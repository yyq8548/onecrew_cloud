import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { addAbortSignal, Writable, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { z } from "zod";
import type { InstanceLease } from "../service/instance-lock.ts";
import { createPrivateDirectory, verifyPrivateDirectory, verifyPrivateFile } from "../storage/private-backup.ts";
import { shopDomainSchema } from "./shop-runtime-registry.ts";

const ownerSchema = z.strictObject({ shop: shopDomainSchema, tenant_id: z.uuid(), base_id: z.uuid() });
export type BrowserSnapshotOwner = z.infer<typeof ownerSchema>;
export interface BrowserSnapshot { readonly id: string; readonly encryptedBytes: number }
const context = Buffer.from("onecrew-cloud-browser-snapshot-v1");

async function directory(parent: string, name: string): Promise<string> {
  await verifyPrivateDirectory(parent);
  const path = join(parent, name);
  const existing = await lstat(path).then(value => value, error => { if (error.code === "ENOENT") return null; throw error; });
  return existing ? verifyPrivateDirectory(path) : createPrivateDirectory(path);
}

// 只保存不变的加密代；Chrome 和归档生产者须先由调用方排空。
export class BrowserSnapshotStore {
  readonly #lease: InstanceLease;
  readonly #masterKey: Buffer;
  readonly #active = new Set<Promise<unknown>>();
  readonly #directories = new Map<string, Promise<string>>();
  #root: Promise<string> | undefined;
  #closing: Promise<void> | undefined;
  constructor(lease: InstanceLease, key: Uint8Array) {
    if (key.byteLength !== 32) throw new Error("cloud.snapshot_key_invalid");
    this.#lease = lease; this.#masterKey = Buffer.from(key);
  }

  #run<T>(owner: BrowserSnapshotOwner, id: string, work: (key: Buffer, root: string) => Promise<T>): Promise<T> {
    this.#lease.assertOwned();
    if (this.#closing) throw new Error("cloud.snapshot_store_closed");
    const verified = ownerSchema.parse(owner);
    z.uuid().parse(id);
    const identity = JSON.stringify([verified.shop, verified.tenant_id, verified.base_id]);
    const key = Buffer.from(hkdfSync("sha256", this.#masterKey, context, Buffer.from(JSON.stringify([identity, id])), 32));
    const task = (async () => {
      const name = createHash("sha256").update(identity).digest("hex");
      let root = this.#directories.get(name);
      if (!root) {
        this.#root ??= directory(this.#lease.directory, "browser-snapshots");
        root = this.#root.then(parent => directory(parent, name));
        this.#directories.set(name, root);
      }
      return work(key, await root);
    })().finally(() => { key.fill(0); });
    this.#active.add(task);
    void task.then(() => { this.#active.delete(task); }, () => { this.#active.delete(task); });
    return task;
  }

  save(owner: BrowserSnapshotOwner, archive: Readable, signal: AbortSignal): Promise<BrowserSnapshot> {
    const id = randomUUID();
    return this.#run(owner, id, async (key, root) => {
      signal.throwIfAborted();
      addAbortSignal(signal, archive);
      await verifyPrivateDirectory(root);
      const temporary = join(root, `${id}.partial`), target = join(root, `${id}.vault`);
      let created = false, published = false;
      try {
        {
          await using file = await open(temporary, "wx", 0o600);
          created = true;
          const nonce = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key, nonce);
          let bytes = 0;
          await file.writeFile(nonce);
          for await (const chunk of archive) {
            signal.throwIfAborted(); this.#lease.assertOwned();
            if (!(chunk instanceof Uint8Array)) throw new Error("cloud.snapshot_binary_stream_required");
            bytes += chunk.byteLength;
            await file.writeFile(cipher.update(chunk));
          }
          signal.throwIfAborted();
          if (!bytes) throw new Error("cloud.snapshot_empty_archive");
          await file.writeFile(cipher.final());
          await file.writeFile(cipher.getAuthTag());
          await file.chmod(0o400);
          await file.sync();
        }
        this.#lease.assertOwned(); signal.throwIfAborted();
        await rename(temporary, target);
        published = true;
        await using parent = await open(root, constants.O_RDONLY);
        await parent.sync();
        const saved = await lstat(target);
        return Object.freeze({ id, encryptedBytes: saved.size });
      } finally { if (created && !published) await rm(temporary); }
    }).then(value => value, error => { archive.destroy(); throw error; });
  }

  restoreTo(owner: BrowserSnapshotOwner, id: string, destination: Writable, signal: AbortSignal): Promise<void> {
    return this.#run(owner, id, async (key, root) => {
      let completed = false;
      try {
        signal.throwIfAborted();
        const path = join(root, `${id}.vault`);
        await verifyPrivateFile(path);
        await using file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
        const before = await file.stat({ bigint: true });
        if (!before.isFile() || before.nlink !== 1n || before.size <= 28n || before.size > BigInt(Number.MAX_SAFE_INTEGER) || (before.mode & 0o222n) !== 0n) throw new Error("cloud.snapshot_generation_invalid");
        const size = Number(before.size);
        const nonce = Buffer.alloc(12), tag = Buffer.alloc(16);
        const head = await file.read(nonce, 0, nonce.length, 0), tail = await file.read(tag, 0, tag.length, size - 16);
        if (head.bytesRead !== 12 || tail.bytesRead !== 16) throw new Error("cloud.snapshot_truncated");
        const decipher = () => { const value = createDecipheriv("aes-256-gcm", key, nonce); value.setAuthTag(tag); return value; };
        const stream = () => file.createReadStream({ start: 12, end: size - 17, autoClose: false });
        const assertUnchanged = async () => {
          this.#lease.assertOwned();
          const actual = await file.stat({ bigint: true }), named = await lstat(path, { bigint: true });
          if (actual.dev !== before.dev || actual.ino !== before.ino || actual.size !== before.size || actual.mtimeNs !== before.mtimeNs || actual.ctimeNs !== before.ctimeNs || named.dev !== before.dev || named.ino !== before.ino || named.isSymbolicLink()) throw new Error("cloud.snapshot_generation_changed");
        };
        // 首遍完成 GCM 认证且不释放明文，第二遍才向恢复目标输出。
        const discard = new Writable({ write(chunk: Buffer, _encoding, callback) { chunk.fill(0); callback(); } });
        await pipeline(stream(), decipher(), discard, { signal });
        await assertUnchanged();
        await pipeline(stream(), decipher(), destination, { signal });
        await assertUnchanged();
        completed = true;
      } finally { if (!completed) destination.destroy(); }
    });
  }

  retain(owner: BrowserSnapshotOwner, ids: readonly string[]): Promise<void> {
    const kept = z.array(z.uuid()).min(1).parse(ids);
    return this.#run(owner, kept[0]!, async (_key, root) => {
      for (const name of await readdir(root)) {
        const match = /^(.+)\.(vault|partial)$/u.exec(name);
        if (!match) throw new Error("cloud.snapshot_filename_invalid");
        const id = z.uuid().parse(match[1]);
        if (match[2] === "vault" && kept.includes(id)) continue;
        const path = join(root, name);
        await verifyPrivateFile(path);
        await rm(path);
      }
    });
  }

  async removeOwner(owner: BrowserSnapshotOwner): Promise<void> {
    this.#lease.assertOwned();
    if (this.#closing) throw new Error("cloud.snapshot_store_closed");
    const verified = ownerSchema.parse(owner);
    const name = createHash("sha256").update(JSON.stringify([verified.shop, verified.tenant_id, verified.base_id])).digest("hex");
    const parent = join(this.#lease.directory, "browser-snapshots"), root = join(parent, name);
    if (!(await lstat(parent).then(value => value, error => { if (error.code === "ENOENT") return null; throw error; }))) return;
    await verifyPrivateDirectory(parent);
    if (!(await lstat(root).then(value => value, error => { if (error.code === "ENOENT") return null; throw error; }))) return;
    await verifyPrivateDirectory(root);
    await rm(root, { recursive: true });
    this.#directories.delete(name);
    await using handle = await open(parent, constants.O_RDONLY);
    await handle.sync();
  }

  close(): Promise<void> {
    this.#closing ??= (async () => {
      const results = await Promise.allSettled([...this.#active]);
      this.#masterKey.fill(0);
      const errors = results.filter(result => result.status === "rejected").map(result => result.reason as unknown);
      if (errors.length) throw new AggregateError(errors, "cloud.snapshot_close_failed");
    })();
    return this.#closing;
  }
}
