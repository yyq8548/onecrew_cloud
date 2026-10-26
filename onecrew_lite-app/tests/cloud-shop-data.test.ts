import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Session } from "@shopify/shopify-api";
import { openCloudStorage } from "../src/cloud/storage.ts";
import { ShopRuntimeRegistry } from "../src/cloud/shop-runtime-registry.ts";
import { ShopDataService } from "../src/cloud/shop-data.ts";
import { AccountContextService } from "../src/identity/account-context.ts";

const session = (shop: string) => new Session({ id: `offline_${shop}`, shop, state: "", isOnline: false, accessToken: randomBytes(32).toString("hex"), scope: "read_products" });

test("shop Campaign databases isolate identical IDs, persist across restart and close on uninstall", async () => {
  const scratch = fileURLToPath(new URL("../../.scratch/", import.meta.url));
  await mkdir(scratch, { recursive: true });
  const root = await mkdtemp(join(scratch, "shop-data-"));
  try {
    const storage = await openCloudStorage(join(root, "private"), true);
    const runtimes = new ShopRuntimeRegistry();
    try {
      const data = new ShopDataService(storage.lease, storage.installations, runtimes);
      const firstSession = session("first.myshopify.com"), secondSession = session("second.myshopify.com");
      const firstShop = storage.installations.install(firstSession, 0);
      storage.installations.install(secondSession, 0);
      const [first, same, second] = await Promise.all([data.resolve(firstSession.shop), data.resolve(firstSession.shop), data.resolve(secondSession.shop)]);
      assert.equal(first, same);
      assert.equal(first.runtime.context.principal.source, "shopify");
      assert.equal(first.runtime.context.principal.user.id, firstShop.tenant_id);
      assert.equal(first.runtime.context.principal.user.email, undefined);
      const firstRepository = await first.databases.discoveryResolver().resolve(first.runtime.context);
      const secondRepository = await second.databases.discoveryResolver().resolve(second.runtime.context);
      for (const [owned, brief] of [[firstRepository, "寻找护肤创作者"], [secondRepository, "寻找鞋类创作者"]] as const) {
        owned.repository.create({ id: "same-id", brief, opencli_version: "1.8.8", criteria: {}, scopes: [{ platform: "youtube", profile_ref: "cloud", keywords: [brief] }], target_count: 2 });
      }
      assert.equal((await data.campaign(firstSession.shop, "same-id")).brief, "寻找护肤创作者");
      assert.equal((await data.campaign(secondSession.shop, "same-id")).brief, "寻找鞋类创作者");
      assert.equal((await data.recentCampaigns(firstSession.shop)).length, 1);
      await assert.rejects(data.campaign(secondSession.shop, "absent"), /discovery.plan_missing/u);
      storage.installations.uninstall(firstSession.shop);
      await runtimes.remove(firstSession.shop);
      assert.throws(first.assertCurrent);
      assert.throws(firstRepository.assertOwned, /closed/u);
      await assert.rejects(data.resolve(firstSession.shop), /installation_required/u);
      second.assertCurrent();
      storage.installations.install(firstSession, storage.installations.lifecycleRevision(firstSession.shop));
      assert.equal((await data.campaign(firstSession.shop, "same-id")).brief, "寻找护肤创作者");
    } finally { await runtimes.close(); await storage.close(); }
    const reopened = await openCloudStorage(join(root, "private"));
    const runtimesAfterRestart = new ShopRuntimeRegistry();
    try {
      const data = new ShopDataService(reopened.lease, reopened.installations, runtimesAfterRestart);
      assert.equal((await data.campaign("first.myshopify.com", "same-id")).brief, "寻找护肤创作者");
      assert.equal((await data.campaign("second.myshopify.com", "same-id")).brief, "寻找鞋类创作者");
    } finally { await runtimesAfterRestart.close(); await reopened.close(); }
  } finally { await rm(root, { recursive: true }); }
});

test("uninstall during empty database initialization leaves a complete store that can reopen", async () => {
  const scratch = fileURLToPath(new URL("../../.scratch/", import.meta.url));
  await mkdir(scratch, { recursive: true });
  const root = await mkdtemp(join(scratch, "shop-data-cancel-"));
  const storage = await openCloudStorage(join(root, "private"), true);
  const runtimes = new ShopRuntimeRegistry();
  try {
    const data = new ShopDataService(storage.lease, storage.installations, runtimes);
    const installed = session("initializing.myshopify.com");
    storage.installations.install(installed, 0);
    const resolving = data.resolve(installed.shop);
    const rejected = assert.rejects(resolving);
    storage.installations.uninstall(installed.shop);
    await runtimes.remove(installed.shop);
    await rejected;
    storage.installations.install(installed, storage.installations.lifecycleRevision(installed.shop));
    assert.deepEqual(await data.recentCampaigns(installed.shop), []);
  } finally { await runtimes.close(); await storage.close(); await rm(root, { recursive: true }); }
});

test("Shopify ownership does not weaken the Access email requirement", () => {
  const accounts = new AccountContextService();
  assert.throws(() => accounts.activate({ source: "access", user: { id: "owner" }, tenantId: "tenant", baseId: "base", deviceId: "device" } as never));
  assert.throws(() => accounts.activate({ source: "shopify", user: { id: "shop", email: "invented@example.com" }, tenantId: "tenant", baseId: "base", deviceId: "device" } as never));
});

test("a real supervised filesystem failure still closes the store database during removal", async () => {
  const scratch = fileURLToPath(new URL("../../.scratch/", import.meta.url));
  await mkdir(scratch, { recursive: true });
  const root = await mkdtemp(join(scratch, "shop-data-drain-"));
  const storage = await openCloudStorage(join(root, "private"), true), runtimes = new ShopRuntimeRegistry();
  try {
    const installed = session("draining.myshopify.com");
    storage.installations.install(installed, 0);
    const data = new ShopDataService(storage.lease, storage.installations, runtimes);
    const scope = await data.resolve(installed.shop);
    const owned = await scope.databases.discoveryResolver().resolve(scope.runtime.context);
    await assert.rejects(scope.runtime.supervisor.ownTask(scope.runtime.context, () => readFile(join(root, "absent.txt"))), { code: "ENOENT" });
    await assert.rejects(runtimes.remove(installed.shop), /discovery_execution_failed/u);
    assert.throws(owned.assertOwned, /closed/u);
    await assert.rejects(data.resolve(installed.shop));
  } finally {
    await assert.rejects(runtimes.close(), /cloud.shutdown_failed/u);
    await storage.close(); await rm(root, { recursive: true });
  }
});
