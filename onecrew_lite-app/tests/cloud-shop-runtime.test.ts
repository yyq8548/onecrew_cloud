import assert from "node:assert/strict";
import test from "node:test";
import { ShopRuntimeRegistry } from "../src/cloud/shop-runtime-registry.ts";
import type { VerifiedPrincipal } from "../src/identity/account-context.ts";

const principal = (shop: string): VerifiedPrincipal => ({ user: { id: "shared-owner", email: "owner@example.com" }, tenantId: `tenant-${shop}`, baseId: `base-${shop}`, deviceId: `server-${shop}`, source: "access" });

test("two stores owned by one user retain independent contexts and execution gates", async () => {
  const registry = new ShopRuntimeRegistry();
  const first = registry.resolve("first.myshopify.com", principal("first"));
  const second = registry.resolve("second.myshopify.com", principal("second"));
  first.accounts.assertCurrent(first.context);
  second.accounts.assertCurrent(second.context);
  assert.equal(registry.resolve("first.myshopify.com", principal("first")), first);
  assert.notEqual(first.accounts, second.accounts);
  assert.notEqual(first.supervisor, second.supervisor);
  const lease = await first.admission.acquire(first.context);
  const other = await second.admission.acquire(second.context);
  other.assertCurrent();
  other.release();
  lease.release();
  await registry.remove("first.myshopify.com");
  assert.equal(first.context.signal.aborted, true);
  second.accounts.assertCurrent(second.context);
  await registry.close();
  assert.equal(second.context.signal.aborted, true);
  assert.throws(() => registry.resolve("second.myshopify.com", principal("second")), /stopping/u);
});

test("store storage and ownership cannot be reassigned through resolve", async () => {
  const registry = new ShopRuntimeRegistry();
  registry.resolve("first.myshopify.com", principal("first"));
  assert.throws(() => registry.resolve("second.myshopify.com", principal("first")), /storage_shared/u);
  assert.throws(() => registry.resolve("first.myshopify.com", principal("second")), /owner_changed/u);
  assert.throws(() => registry.resolve("first.myshopify.com.attacker.test", principal("second")));
  await registry.close();
});
