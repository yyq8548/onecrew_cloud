import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { openCloudStorage } from "../src/cloud/storage.ts";

test("cloud storage initializes private persistent files, reopens and refuses replacement keys", async () => {
  const scratch = fileURLToPath(new URL("../../.scratch/", import.meta.url));
  await mkdir(scratch, { recursive: true });
  const root = await mkdtemp(join(scratch, "cloud-storage-"));
  const directory = join(root, "private");
  try {
    const initialized = await openCloudStorage(directory, true);
    assert.deepEqual(initialized.installations.pendingWebhooks(), []);
    await initialized.close();
    const keyPath = join(directory, "cloud.key");
    const key = await readFile(keyPath);
    assert.equal(key.length, 32);
    assert.equal((await stat(directory)).mode & 0o077, 0);
    assert.equal((await stat(keyPath)).mode & 0o077, 0);
    assert.equal((await stat(join(directory, "cloud.sqlite"))).mode & 0o077, 0);
    await assert.rejects(openCloudStorage(directory, true), /storage_already_exists/u);
    assert.deepEqual(await readFile(keyPath), key);
    const reopened = await openCloudStorage(directory);
    await reopened.close();
    await rename(keyPath, `${keyPath}.saved`);
    await assert.rejects(openCloudStorage(directory));
    await assert.rejects(stat(keyPath), { code: "ENOENT" });
    await rename(`${keyPath}.saved`, keyPath);
    const restored = await openCloudStorage(directory);
    await restored.close();
    key.fill(0);
    await assert.rejects(openCloudStorage("relative-directory"), /absolute_data_directory_required/u);
  } finally { await rm(root, { recursive: true }); }
});
