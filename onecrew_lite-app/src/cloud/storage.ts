import { randomBytes } from "node:crypto";
import { lstatSync } from "node:fs";
import { open } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { acquireInstanceLock } from "../service/instance-lock.ts";
import { createPrivateDirectory, verifyPrivateDirectory, verifyPrivateFile } from "../storage/private-backup.ts";
import { readVaultMasterKey } from "../storage/vault-reader.ts";
import { ShopifyInstallationStore } from "../shopify/installation-store.ts";
import { BrowserSnapshotStore } from "./browser-snapshot-store.ts";
import { CampaignJobStore } from "./campaign-jobs.ts";
import { CampaignTemplateStore } from "./campaign-templates.ts";
import { CloudMailStore } from "./mail-store.ts";
import { CloudWorkspaceRegistry } from "./workspaces.ts";
import { CloudAccountStore } from "./account-store.ts";

export async function openCloudStorage(directory: string, initialize = false) {
  if (!isAbsolute(directory)) throw new Error("cloud.absolute_data_directory_required");
  const existing = lstatSync(directory, { throwIfNoEntry: false });
  if (!existing && initialize) await createPrivateDirectory(directory);
  else await verifyPrivateDirectory(directory);
  await using opening = new AsyncDisposableStack();
  const lease = await acquireInstanceLock(directory);
  opening.defer(() => lease.close());
  const keyPath = join(directory, "cloud.key");
  const databasePath = join(directory, "cloud.sqlite");
  if (initialize) {
    if (lstatSync(keyPath, { throwIfNoEntry: false }) || lstatSync(databasePath, { throwIfNoEntry: false })) throw new Error("cloud.storage_already_exists");
    const bytes = randomBytes(32);
    const keyFile = await open(keyPath, "wx", 0o600);
    try { await keyFile.writeFile(bytes); await keyFile.sync(); } finally { bytes.fill(0); await keyFile.close(); }
    const databaseFile = await open(databasePath, "wx", 0o600);
    await databaseFile.close();
  }
  // 已有数据缺失密钥时直接失败，禁止生成新密钥覆盖存量会话。
  const key = await readVaultMasterKey(keyPath);
  opening.defer(() => { key.fill(0); });
  await verifyPrivateFile(databasePath);
  const database = new DatabaseSync(databasePath);
  opening.defer(() => database.close());
  database.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;");
  const installations = new ShopifyInstallationStore(database, key);
  const workspaces = new CloudWorkspaceRegistry(database, installations);
  const accounts = new CloudAccountStore(database, key);
  opening.defer(() => accounts.close());
  opening.defer(() => installations.close());
  const browserSnapshots = new BrowserSnapshotStore(lease, key);
  opening.defer(() => browserSnapshots.close());
  const campaignJobs = new CampaignJobStore(database);
  const campaignTemplates = new CampaignTemplateStore(database);
  const mail = new CloudMailStore(database, key);
  opening.defer(() => mail.close());
  const ownership = opening.move();
  return { lease, installations, workspaces, accounts, browserSnapshots, campaignJobs, campaignTemplates, mail, close: () => ownership.disposeAsync() };
}
