import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Session } from "@shopify/shopify-api";
import { openCloudStorage } from "../src/cloud/storage.ts";
import { ShopRuntimeRegistry } from "../src/cloud/shop-runtime-registry.ts";
import { ShopDataService } from "../src/cloud/shop-data.ts";
import { ShopBrowserManager } from "../src/cloud/shop-browser-manager.ts";
import { CloudDiscoveryReader } from "../src/cloud/discovery-reader.ts";
import { OpenCliError } from "../src/platforms/opencli/errors.ts";

test("cloud reader rejects foreign bindings, unsupported platforms and uninstalled owners before opening a browser", async () => {
  const scratch = fileURLToPath(new URL("../../.scratch/", import.meta.url));
  await mkdir(scratch, { recursive: true });
  const root = await mkdtemp(join(scratch, "cloud-reader-"));
  const directory = join(root, "private");
  const storage = await openCloudStorage(directory, true);
  const runtimes = new ShopRuntimeRegistry();
  try {
    const browsers = new ShopBrowserManager({ image: "onecrew-cloud-browser:worker", dataDirectory: directory, seccompProfile: fileURLToPath(new URL("../../development/cloud/browser/seccomp-profile.json", import.meta.url)) }, storage.installations, storage.browserSnapshots);
    const service = new ShopDataService(storage.lease, storage.installations, runtimes);
    const workspaces = ["first.myshopify.com", "second.myshopify.com"].map(shop => storage.installations.install(new Session({ id: `offline_${shop}`, shop, state: "", isOnline: false, accessToken: randomBytes(32).toString("hex"), scope: "read_products" }), 0));
    const [first, second] = await Promise.all(workspaces.map(workspace => service.resolve(workspace.shop)));
    const reader = new CloudDiscoveryReader({ data: first!, workspace: workspaces[0]!, browsers });
    const other = new CloudDiscoveryReader({ data: second!, workspace: workspaces[1]!, browsers });
    const binding = reader.binding(first!.runtime.context, "cloud");
    const foreign = other.binding(second!.runtime.context, "cloud");
    await assert.rejects(reader.checkBrowserProfile(foreign), { code: "opencli_profile_unavailable" });
    assert.throws(() => reader.binding(second!.runtime.context, "cloud"));
    assert.throws(() => reader.binding(first!.runtime.context, "borrowed-profile"), { code: "opencli_profile_unavailable" });
    assert.throws(() => reader.creatorSearch(binding, "facebook", "skincare", 2), { code: "opencli_read_command_unavailable" });
    await assert.rejects(reader.facebookPublicProfile(binding, "123"), error => error instanceof OpenCliError && error.code === "opencli_read_command_unavailable");
    storage.installations.uninstall(workspaces[0]!.shop);
    await runtimes.remove(workspaces[0]!.shop);
    await assert.rejects(reader.checkBrowserProfile(binding));
    second!.assertCurrent();
  } finally { await runtimes.close(); await storage.close(); await rm(root, { recursive: true }); }
});
