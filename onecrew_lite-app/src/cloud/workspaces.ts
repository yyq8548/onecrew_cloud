import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { parseApplicationJson, stringifyApplicationJson } from "../contracts/application-json.ts";
import type { ShopifyInstallationStore, ShopifyWorkspace } from "../shopify/installation-store.ts";
import type { BrowserSnapshotOwner } from "./browser-snapshot-store.ts";
import { CloudHttpError } from "./http-error.ts";

export const workspaceKeySchema = z.string().regex(/^(?:[a-z0-9][a-z0-9-]*\.myshopify\.com|local:[a-f0-9]{64})$/u);
const localUser = z.strictObject({ id: z.string().min(1), email: z.email() });
const localWorkspace = z.strictObject({ shop: workspaceKeySchema, kind: z.literal("local"), user: localUser, tenant_id: z.string().min(1), base_id: z.string().min(1), installed_at: z.number().int(), uninstalled_at: z.null() });
export type LocalWorkspace = z.infer<typeof localWorkspace>;
export type CloudWorkspace = ShopifyWorkspace | LocalWorkspace;
export interface WorkspaceStore {
  workspace(key: string): CloudWorkspace | null;
  lifecycleRevision(key: string): number;
  browserSnapshot(key: string): string | null;
  recordBrowserSnapshot(owner: BrowserSnapshotOwner, id: string, revision: number, discardPrevious?: boolean): string[];
}

export function initializeWorkspaceRegistry(database: DatabaseSync): void {
  database.exec(`CREATE TABLE IF NOT EXISTS cloud_workspaces (
    key TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('shopify','local')),
    local_json TEXT CHECK(local_json IS NULL OR json_valid(local_json)), legacy_user_id TEXT
  ) STRICT;
  INSERT OR IGNORE INTO cloud_workspaces(key,kind) SELECT shop,'shopify' FROM shopify_installations;
  CREATE TRIGGER IF NOT EXISTS cloud_shop_registered AFTER INSERT ON shopify_installations
    BEGIN INSERT INTO cloud_workspaces(key,kind) VALUES(NEW.shop,'shopify'); END;
  CREATE TRIGGER IF NOT EXISTS cloud_shop_removed AFTER DELETE ON shopify_installations
    BEGIN DELETE FROM cloud_workspaces WHERE key=OLD.shop; END;
  CREATE VIEW IF NOT EXISTS cloud_active_workspaces AS SELECT key FROM cloud_workspaces w
    WHERE kind='local' OR EXISTS(SELECT 1 FROM shopify_installations i WHERE i.shop=w.key AND i.uninstalled_at IS NULL);
  CREATE TABLE IF NOT EXISTS cloud_local_browser_snapshots (
    workspace TEXT PRIMARY KEY REFERENCES cloud_workspaces(key), snapshot_id TEXT NOT NULL,
    previous_snapshot_id TEXT, updated_at INTEGER NOT NULL
  ) STRICT;`);
}

export function workspaceTable(database: DatabaseSync, table: "cloud_campaign_jobs" | "cloud_campaign_templates", create: string): void {
  const old = database.prepare(`PRAGMA foreign_key_list(${table})`).all().some(row => row.table === "shopify_installations");
  if (!old) { database.exec(create); return; }
  database.exec("BEGIN IMMEDIATE");
  let committed = false;
  using transaction = { [Symbol.dispose]: () => { if (!committed) database.exec("ROLLBACK"); } };
  database.exec(`ALTER TABLE ${table} RENAME TO ${table}_legacy_owner;${create}
    INSERT INTO ${table} SELECT * FROM ${table}_legacy_owner;
    DROP TABLE ${table}_legacy_owner;`);
  database.exec("COMMIT"); committed = true;
}

export class CloudWorkspaceRegistry implements WorkspaceStore {
  readonly #database: DatabaseSync;
  readonly #installations: ShopifyInstallationStore;
  constructor(database: DatabaseSync, installations: ShopifyInstallationStore) { this.#database = database; this.#installations = installations; }

  workspace(key: string): CloudWorkspace | null {
    workspaceKeySchema.parse(key);
    if (!key.startsWith("local:")) return this.#installations.workspace(key);
    const row = this.#database.prepare("SELECT local_json FROM cloud_workspaces WHERE key=? AND kind='local'").get(key);
    return row ? localWorkspace.parse(parseApplicationJson(z.string().parse(row.local_json))) : null;
  }

  local(user: { id: string; email: string }, tenant: { tenantId: string; baseId: string }): LocalWorkspace {
    const key = `local:${createHash("sha256").update(user.id).digest("hex")}`;
    const previous = this.workspace(key);
    if (previous) {
      if (!("user" in previous) || previous.user.id !== user.id || previous.tenant_id !== tenant.tenantId || previous.base_id !== tenant.baseId) throw new CloudHttpError("cloud.workspace_changed", 409);
      return previous;
    }
    const value = localWorkspace.parse({ shop: key, kind: "local", user, tenant_id: tenant.tenantId, base_id: tenant.baseId, installed_at: Date.now(), uninstalled_at: null });
    this.#database.prepare("INSERT INTO cloud_workspaces(key,kind,local_json) VALUES(?,'local',?)").run(key, stringifyApplicationJson(value));
    return value;
  }

  adoptLegacy(key: string, userId: string): void {
    const changed = this.#database.prepare("UPDATE cloud_workspaces SET legacy_user_id=? WHERE key=? AND kind='shopify' AND (legacy_user_id IS NULL OR legacy_user_id=?)").run(userId, key, userId);
    if (changed.changes !== 1) throw new CloudHttpError("cloud.workspace_changed", 409);
  }

  legacy(userId: string): string[] {
    return this.#database.prepare("SELECT key FROM cloud_workspaces WHERE kind='shopify' AND legacy_user_id=?").all(userId).map(row => z.string().parse(row.key));
  }

  lifecycleRevision(key: string): number {
    if (!key.startsWith("local:")) return this.#installations.lifecycleRevision(key);
    if (!this.workspace(key)) throw new CloudHttpError("cloud.workspace_required", 409);
    return 0;
  }

  browserSnapshot(key: string): string | null {
    if (!key.startsWith("local:")) return this.#installations.browserSnapshot(key);
    const row = this.#database.prepare("SELECT snapshot_id FROM cloud_local_browser_snapshots WHERE workspace=?").get(workspaceKeySchema.parse(key));
    return row ? z.uuid().parse(row.snapshot_id) : null;
  }

  recordBrowserSnapshot(owner: BrowserSnapshotOwner, id: string, revision: number, discardPrevious = false): string[] {
    if (!owner.shop.startsWith("local:")) return this.#installations.recordBrowserSnapshot(owner, id, revision, discardPrevious);
    const current = this.workspace(owner.shop);
    if (!current || current.tenant_id !== owner.tenant_id || current.base_id !== owner.base_id || revision !== 0) throw new CloudHttpError("cloud.workspace_changed", 409);
    z.uuid().parse(id);
    this.#database.prepare(`INSERT INTO cloud_local_browser_snapshots VALUES(?,?,NULL,?)
      ON CONFLICT(workspace) DO UPDATE SET previous_snapshot_id=CASE WHEN ? THEN NULL ELSE snapshot_id END,snapshot_id=excluded.snapshot_id,updated_at=excluded.updated_at`).run(owner.shop, id, Date.now(), discardPrevious ? 1 : 0);
    const saved = this.#database.prepare("SELECT snapshot_id,previous_snapshot_id FROM cloud_local_browser_snapshots WHERE workspace=?").get(owner.shop)!;
    return [z.uuid().parse(saved.snapshot_id), ...(saved.previous_snapshot_id == null ? [] : [z.uuid().parse(saved.previous_snapshot_id)])];
  }
}
