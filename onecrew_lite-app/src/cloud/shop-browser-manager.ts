import { createHash } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import type { ShopifyWorkspace } from "../shopify/installation-store.ts";
import { workspaceKeySchema as shopDomainSchema, type WorkspaceStore } from "./workspaces.ts";
import { BrowserSnapshotStore, type BrowserSnapshotOwner } from "./browser-snapshot-store.ts";
import { DockerBrowserClient, dockerCommand } from "./docker-browser-client.ts";
import { cloudCreatorSearch, cloudPlatform } from "./platforms.ts";
import { CloudHttpError } from "./http-error.ts";
import type { CloudBrowserRead, CloudBrowserReadResult } from "./browser-operations.ts";
import type { VerifiedOpenCliPublicSource } from "../platforms/opencli/reader.ts";
import { OpenCliError } from "../platforms/opencli/errors.ts";
import { cloudSessionReceipt } from "../platforms/opencli/cloud-session.ts";

export interface ShopBrowserConfiguration { readonly image: string; readonly seccompProfile: string; readonly dataDirectory: string }
const inspection = z.object({ Image: z.string(), State: z.object({ Running: z.boolean() }), Config: z.object({ Labels: z.record(z.string(), z.string()) }) });
interface Active { cancel: AbortController; settled: Promise<void> }
interface TaskSession { workspace: ShopifyWorkspace; revision: number; active: Active; client: DockerBrowserClient; signal: AbortSignal }

export class ShopBrowserManager {
  readonly #config: ShopBrowserConfiguration;
  readonly #store: WorkspaceStore;
  readonly #snapshots: BrowserSnapshotStore;
  readonly #scope: string;
  readonly #active = new Map<string, Active>();
  readonly #closing = new Map<string, Promise<void>>();
  readonly #task = new AsyncLocalStorage<TaskSession>();
  #image: Promise<string> | undefined;
  #stopping = false;
  constructor(config: ShopBrowserConfiguration, store: WorkspaceStore, snapshots: BrowserSnapshotStore) {
    if (!config.image || !isAbsolute(config.seccompProfile) || !isAbsolute(config.dataDirectory)) throw new Error("cloud.browser_configuration_invalid");
    if (createHash("sha256").update(readFileSync(config.seccompProfile)).digest("hex") !== "8009f0da5bb7a293a5fa7b34de074ec82b61c1e2f800573364d44c6a8c48ab48") throw new Error("cloud.browser_seccomp_not_approved");
    this.#config = config; this.#store = store; this.#snapshots = snapshots;
    this.#scope = createHash("sha256").update(resolve(config.dataDirectory)).digest("hex").slice(0, 16);
  }
  #owner(workspace: ShopifyWorkspace): BrowserSnapshotOwner { return { shop: workspace.shop, tenant_id: workspace.tenant_id, base_id: workspace.base_id }; }
  #identity(owner: BrowserSnapshotOwner): string { return createHash("sha256").update(JSON.stringify([owner.shop, owner.tenant_id, owner.base_id])).digest("hex"); }
  #name(owner: BrowserSnapshotOwner): string { return `onecrew-${this.#scope}-${this.#identity(owner).slice(0, 20)}`; }
  async #find(owner: BrowserSnapshotOwner) {
    const found = await dockerCommand(["ps", "-a", "--filter", `label=onecrew.scope=${this.#scope}`, "--filter", `label=onecrew.owner=${this.#identity(owner)}`, "--format", "{{.ID}}"]);
    const ids = found.stdout.trim().split(/\s+/u).filter(Boolean);
    if (ids.length > 1) throw new Error("cloud.browser_multiple_owners");
    if (!ids.length) return null;
    const details = inspection.parse(JSON.parse((await dockerCommand(["inspect", ids[0]!, "--format", "{{json .}}"])).stdout));
    if (details.Config.Labels["onecrew.shop"] !== owner.shop) throw new Error("cloud.browser_owner_mismatch");
    return details;
  }
  #assert(workspace: ShopifyWorkspace, revision: number): void {
    const current = this.#store.workspace(workspace.shop);
    if (!current || current.uninstalled_at !== null || current.tenant_id !== workspace.tenant_id || current.base_id !== workspace.base_id || this.#store.lifecycleRevision(workspace.shop) !== revision) throw new CloudHttpError("shopify.installation_changed", 409);
  }
  async #prepare(owner: BrowserSnapshotOwner, signal: AbortSignal): Promise<DockerBrowserClient> {
    let state = await this.#find(owner);
    const name = this.#name(owner);
    const image = await (this.#image ??= dockerCommand(["image", "inspect", this.#config.image, "--format", "{{.Id}}"]).then(result => z.string().regex(/^sha256:[a-f0-9]{64}$/u).parse(result.stdout.trim())));
    if (state && state.Image !== image) {
      if (state.State.Running) throw new CloudHttpError("cloud.browser_image_changed", 409);
      // 已停止容器的活动目录是 tmpfs；当前与上一代身份保存在独立加密快照中。
      await dockerCommand(["rm", name]);
      state = null;
    }
    if (!state) {
      await dockerCommand(["create", "--name", name, "--stop-timeout", "40", "--memory", "2g", "--cpus", "2", "--security-opt", `seccomp=${this.#config.seccompProfile}`, "--tmpfs", "/data:rw,nosuid,nodev,size=1g,uid=1000,gid=1000,mode=700", "--label", `onecrew.scope=${this.#scope}`, "--label", `onecrew.owner=${this.#identity(owner)}`, "--label", `onecrew.shop=${owner.shop}`, "--env", "ONECREW_BROWSER_START_COLD=1", image]);
      state = (await this.#find(owner))!;
    }
    const starting = !state.State.Running;
    if (starting) await dockerCommand(["start", name]);
    const deadline = Date.now() + 30000;
    while ((await dockerCommand(["exec", name, "/usr/bin/test", "-S", "/data/worker.sock"], undefined, [0, 1])).code !== 0) {
      signal.throwIfAborted();
      if (Date.now() > deadline || !(await this.#find(owner))?.State.Running) throw new Error("cloud.browser_worker_unavailable");
      await delay(100, undefined, { signal });
    }
    const client = new DockerBrowserClient(name);
    const status = z.object({ version: z.string(), active_job: z.uuid().nullable(), cold: z.boolean() }).parse(await client.request("GET", "/status"));
    if (status.version !== "1.8.8") throw new OpenCliError("opencli_version_changed");
    if (status.active_job) await client.request("POST", `/jobs/${status.active_job}/cancel`);
    if (starting) {
      if (!status.cold) throw new Error("cloud.browser_restore_requires_cold_worker");
      const snapshot = this.#store.browserSnapshot(owner.shop);
      if (snapshot) {
        const target = client.restoration();
        const restored = await Promise.allSettled([this.#snapshots.restoreTo(owner, snapshot, target.stream, signal), target.finished]);
        const errors = restored.filter(value => value.status === "rejected").map(value => value.reason as unknown);
        if (errors.length) { await dockerCommand(["stop", name]); throw new AggregateError(errors, "cloud.browser_restore_failed"); }
      }
    }
    return client;
  }
  async #checkpoint(owner: BrowserSnapshotOwner, revision: number, discardPrevious = false): Promise<void> {
    if (!(await this.#find(owner))?.State.Running) return;
    const client = new DockerBrowserClient(this.#name(owner));
    const status = z.object({ active_job: z.uuid().nullable() }).parse(await client.request("GET", "/status"));
    if (status.active_job) await client.request("POST", `/jobs/${status.active_job}/cancel`);
    await client.request("POST", "/pause");
    const archive = client.archive();
    const [snapshot] = await Promise.all([this.#snapshots.save(owner, archive.stream, new AbortController().signal), archive.finished]);
    const retained = this.#store.recordBrowserSnapshot(owner, snapshot.id, revision, discardPrevious);
    await this.#snapshots.retain(owner, retained);
    await dockerCommand(["stop", this.#name(owner)]);
  }
  async #using<T>(workspace: ShopifyWorkspace, signal: AbortSignal, operation: (client: DockerBrowserClient, signal: AbortSignal) => Promise<T>, discardPrevious = false): Promise<T> {
    const task = this.#task.getStore();
    if (task) {
      if (workspace.shop !== task.workspace.shop || workspace.tenant_id !== task.workspace.tenant_id || workspace.base_id !== task.workspace.base_id || this.#active.get(workspace.shop) !== task.active) throw new CloudHttpError("cloud.browser_owner_mismatch", 409);
      this.#assert(workspace, task.revision);
      const stopped = AbortSignal.any([signal, task.signal]); stopped.throwIfAborted();
      const result = await operation(task.client, stopped);
      this.#assert(workspace, task.revision);
      return result;
    }
    if (this.#stopping || this.#closing.has(workspace.shop)) throw new CloudHttpError("cloud.shop_stopping", 409);
    if (this.#active.has(workspace.shop)) throw new CloudHttpError("cloud.worker_busy", 409);
    const revision = this.#store.lifecycleRevision(workspace.shop);
    this.#assert(workspace, revision); signal.throwIfAborted();
    const owner = this.#owner(workspace), cancel = new AbortController(), settled = Promise.withResolvers<void>();
    let prepared = false;
    this.#active.set(workspace.shop, { cancel, settled: settled.promise });
    try {
      const stopped = AbortSignal.any([signal, cancel.signal]);
      const client = await this.#prepare(owner, stopped);
      prepared = true;
      this.#assert(workspace, revision);
      const result = await operation(client, stopped);
      this.#assert(workspace, revision);
      return result;
    } finally {
      try { if (prepared) await this.#checkpoint(owner, revision, discardPrevious); }
      finally { this.#active.delete(workspace.shop); settled.resolve(); }
    }
  }
  task<T>(workspace: ShopifyWorkspace, signal: AbortSignal, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    return this.#using(workspace, signal, (client, stopped) => this.#task.run({ workspace, revision: this.#store.lifecycleRevision(workspace.shop), active: this.#active.get(workspace.shop)!, client, signal: stopped }, () => operation(stopped)));
  }
  search(workspace: ShopifyWorkspace, request: unknown, signal: AbortSignal) {
    const input = cloudCreatorSearch.parse(request);
    return this.#using(workspace, signal, (client, stopped) => client.search(input, stopped));
  }
  read<T extends CloudBrowserRead>(workspace: ShopifyWorkspace, request: T, signal: AbortSignal): Promise<CloudBrowserReadResult<T>> {
    return this.#using(workspace, signal, (client, stopped) => client.read(request, stopped));
  }
  async readPublicWeb(workspace: ShopifyWorkspace, source: VerifiedOpenCliPublicSource, signal: AbortSignal) {
    await source.assertApproved();
    return this.#using(workspace, signal, (client, stopped) => client.readPublicWeb(source, stopped));
  }
  connect(workspace: ShopifyWorkspace, platform: unknown, signal: AbortSignal, viewer: (container: string, signal: AbortSignal) => Promise<boolean>) {
    const selected = cloudPlatform.parse(platform);
    return this.#using(workspace, signal, async (client, stopped) => {
      await client.request("POST", "/connect", { platform: selected });
      stopped.throwIfAborted();
      const checkAuth = await viewer(client.container, stopped);
      stopped.throwIfAborted();
      if (!checkAuth) return { auth: null, check_error: null };
      try {
        const auth = await client.read({ method: "checkCreatorAuthStatus", args: [selected] }, stopped);
        return { auth, check_error: null };
      } catch (error) {
        if (!(error instanceof OpenCliError)) throw error;
        return { auth: null, check_error: error.code };
      }
    });
  }
  disconnect(workspace: ShopifyWorkspace, platform: unknown, signal: AbortSignal) {
    const selected = cloudPlatform.parse(platform);
    return this.#using(workspace, signal, async client => {
      const receipt = cloudSessionReceipt.parse(await client.request("POST", "/disconnect", { platform: selected }));
      if (receipt.platform !== selected) throw new CloudHttpError("cloud.browser_transport_invalid", 502);
      return receipt;
    }, true);
  }
  suspend(shop: string): void { shopDomainSchema.parse(shop); this.#active.get(shop)?.cancel.abort(new Error("cloud.shop_stopping")); }
  busy(shop: string): boolean { shopDomainSchema.parse(shop); return this.#active.has(shop) || this.#closing.has(shop); }
  stopAcceptingWork(): void { this.#stopping = true; for (const shop of this.#active.keys()) this.suspend(shop); }
  closeShop(shop: string): Promise<void> {
    shopDomainSchema.parse(shop);
    const existing = this.#closing.get(shop); if (existing) return existing;
    this.suspend(shop);
    const operation = (async () => {
      await this.#active.get(shop)?.settled;
      const workspace = this.#store.workspace(shop);
      if (!workspace) throw new Error("cloud.browser_installation_missing");
      await this.#checkpoint(this.#owner(workspace), this.#store.lifecycleRevision(shop));
      this.#closing.delete(shop);
    })();
    this.#closing.set(shop, operation);
    return operation;
  }
  async removeShop(shop: string): Promise<void> {
    const workspace = this.#store.workspace(shop);
    if (!workspace || workspace.uninstalled_at === null) throw new Error("cloud.browser_redaction_requires_uninstall");
    this.suspend(shop);
    await this.#active.get(shop)?.settled;
    await this.#closing.get(shop);
    const owner = this.#owner(workspace), existing = await this.#find(owner);
    if (existing?.State.Running) await dockerCommand(["stop", this.#name(owner)]);
    if (existing) await dockerCommand(["rm", this.#name(owner)]);
    await this.#snapshots.removeOwner(owner);
  }
  async recover(): Promise<void> {
    const listed = await dockerCommand(["ps", "-a", "--filter", `label=onecrew.scope=${this.#scope}`, "--format", "{{.ID}}"]);
    for (const id of listed.stdout.trim().split(/\s+/u).filter(Boolean)) {
      const details = inspection.parse(JSON.parse((await dockerCommand(["inspect", id, "--format", "{{json .}}"])).stdout));
      await this.closeShop(shopDomainSchema.parse(details.Config.Labels["onecrew.shop"]));
    }
  }
  async close(): Promise<void> {
    this.stopAcceptingWork();
    const results = await Promise.allSettled([...this.#active.keys()].map(shop => this.closeShop(shop)));
    await this.recover();
    const errors = results.filter(value => value.status === "rejected").map(value => value.reason as unknown);
    if (errors.length) throw new AggregateError(errors, "cloud.browsers_close_failed");
  }
}
