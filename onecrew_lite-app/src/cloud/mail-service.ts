import { inspect } from "node:util";
import PQueue from "p-queue";
import { AccountContextService } from "../identity/account-context.ts";
import { AccountDatabases } from "../identity/account-databases.ts";
import { ACCESS_AUTHORIZE_ORIGIN, enrollAccessInstallation } from "../identity/access-enrollment.ts";
import { AccessInstallationVerifier, AccessVerificationError, type VerifiedMigrationCredential } from "../identity/access-verification.ts";
import { AccessGmailProvider, type VerifiedMailIdentity, type VerifiedMailIdentityProvider } from "../mail/gmail-access.ts";
import { GmailBulkWorker } from "../mail/gmail-bulk-worker.ts";
import type { BulkControl, PrepareBulkInput } from "../mail/gmail-bulk.ts";
import { gmailMailboxId } from "../mail/gmail-mailbox-repository.ts";
import type { InstanceLease } from "../service/instance-lock.ts";
import type { LocalWorkspace, WorkspaceStore } from "./workspaces.ts";
import { CloudHttpError } from "./http-error.ts";
import { CloudMailStore, type CloudMailPairing } from "./mail-store.ts";
import { revokeCloudMailInstallation } from "./mail-revocation.ts";
import type { ShopData, ShopDataService } from "./shop-data.ts";

interface CloudMailOptions {
  readonly lease: InstanceLease;
  readonly store: CloudMailStore;
  readonly installations: WorkspaceStore;
  readonly data: ShopDataService;
  readonly applicationUrl: string;
  readonly onFailure: (failure: { requestId: string; code: string; errorClass: string }) => void;
}

// 每位店铺成员使用独立邮件数据库，原 Gmail 代码仍以真实 Access 用户为账号。
export class CloudMailService {
  readonly #options: CloudMailOptions;
  readonly #sessions = new Map<string, Promise<MailSession>>();
  readonly #mutations = new PQueue({ concurrency: 1 });
  readonly #callback: string;
  readonly #platform: "macos" | "linux" = process.platform === "darwin" ? "macos" : "linux";
  constructor(options: CloudMailOptions) {
    this.#options = options;
    const callback = new URL("/mail/pairing/callback", options.applicationUrl);
    if (callback.protocol !== "https:") throw new Error("cloud.mail_https_required");
    this.#callback = callback.toString();
  }
  // 邮件错误由 HTTP 或持久发送状态反馈；店铺 supervisor 负责等待操作排空。
  #track<T>(parent: ShopData, work: () => Promise<T>): Promise<T> {
    return parent.runtime.supervisor.ownTask(parent.runtime.context, () => work().then(value => ({ ok: true as const, value }), error => ({ ok: false as const, error: error as unknown }))).then(result => {
      if (!result.ok) throw result.error;
      return result.value;
    });
  }
  begin(shop: string, member: string) {
    return this.#mutations.add(async () => {
      await this.#recoverPairings(shop, member);
      this.#options.store.disconnect(shop, member);
      await this.#disconnect(shop, member);
      const { installations, store } = this.#options;
      const workspace = installations.workspace(shop);
      if (!workspace || workspace.uninstalled_at !== null) throw new CloudHttpError("shopify.installation_required", 409);
      const pending = store.begin(shop, member, installations.lifecycleRevision(shop));
      const url = new URL("/pairing/authorize", ACCESS_AUTHORIZE_ORIGIN);
      url.search = new URLSearchParams({ app_version: "0.9.1", callback_url: this.#callback, code_challenge: pending.challenge, code_challenge_method: "S256",
        label: "OneCrew Cloud", platform: this.#platform, product: "onecrew_lite", state: pending.state }).toString();
      return { authorize_url: url.toString() };
    });
  }
  async complete(code: string, state: string): Promise<void> {
    await this.#mutations.add(async () => {
      const { store, data, installations } = this.#options;
      const pending = store.consume(state, code);
      let parent: ShopData;
      try {
        parent = await data.resolve(pending.shop);
        if (installations.lifecycleRevision(pending.shop) !== pending.revision) throw new CloudHttpError("shopify.installation_changed", 409);
      } catch (error) { store.forgetPairing(pending.id); throw error; }
      await this.#track(parent, async () => {
        const proof = await this.#enroll(pending);
        using release = { [Symbol.dispose]() { proof.dispose(); } };
        try {
          parent.assertCurrent();
          store.bind(pending, parent.runtime.context.principal.tenantId, proof);
        } catch (error) { store.revokePairing(pending, proof); throw error; }
      });
    });
  }
  bindAccount(workspace: LocalWorkspace, proof: VerifiedMigrationCredential): Promise<void> {
    return this.#mutations.add(async () => {
      const session = this.#sessions.get(JSON.stringify([workspace.shop, proof.user.id]));
      if (session) await (await session).close();
      // Access 已撤销同一稳定设备的旧凭据；此处只替换当前凭据，不撤销刚批准的设备。
      this.#options.store.bindAccount(workspace, proof);
    });
  }
  async #enroll(pending: CloudMailPairing) {
    if (!pending.code || !pending.state) throw new CloudHttpError("cloud.mail_pairing_recovery_required", 409);
    const candidate = { installationId: pending.installationId, credentialId: pending.credentialId, bearer: Buffer.from(pending.bearer), platform: this.#platform, appVersion: "0.9.1" };
    try { return await enrollAccessInstallation(candidate, pending.code, pending.verifier, pending.state, pending.idempotency); }
    finally { candidate.bearer.fill(0); }
  }
  async #recoverPairings(shop?: string, member?: string): Promise<void> {
    for (const pending of this.#options.store.pendingPairings(shop, member)) {
      try {
        const proof = await this.#enroll(pending);
        using release = { [Symbol.dispose]() { proof.dispose(); } };
        this.#options.store.revokePairing(pending, proof);
      } catch (error) {
        if (!(error instanceof AccessVerificationError) || error.code !== "access.pairing_rejected") throw error;
        this.#options.store.forgetPairing(pending.id);
      }
    }
  }
  async #revoke(shop?: string, member?: string, deferUnavailable = false): Promise<void> {
    for (const request of this.#options.store.revocations(shop, member)) {
      try { await revokeCloudMailInstallation(request); }
      catch (error) {
        if (deferUnavailable && error instanceof CloudHttpError && error.message === "cloud.mail_revocation_incomplete") continue;
        throw error;
      }
      this.#options.store.completeRevocation(request.metadata.installation_id);
    }
  }
  disableShop(shop: string): void { this.#options.store.disableShop(shop); }
  revokeShop(shop: string): Promise<void> {
    return this.#mutations.add(async () => { await this.#recoverPairings(shop); await this.#revoke(shop); });
  }
  recover(): Promise<void> {
    return this.#mutations.add(async () => { await this.#recoverPairings(); await this.#revoke(undefined, undefined, true); });
  }
  async #session(shop: string, member: string): Promise<MailSession> {
    const key = JSON.stringify([shop, member]);
    let session = this.#sessions.get(key);
    if (!session) {
      session = this.#open(shop, member);
      this.#sessions.set(key, session);
      void session.then(() => undefined, () => { if (this.#sessions.get(key) === session) this.#sessions.delete(key); });
    }
    const value = await session;
    value.assertCurrent();
    return value;
  }
  async #open(shop: string, member: string): Promise<MailSession> {
    const { store, installations, data, lease, onFailure } = this.#options;
    const binding = store.load(shop, member);
    if (!binding) throw new CloudHttpError("cloud.mail_pairing_required", 409);
    const parent = await data.resolve(shop);
    if (binding.tenantId !== parent.runtime.context.principal.tenantId || binding.revision !== installations.lifecycleRevision(shop)) throw new CloudHttpError("cloud.mail_binding_changed", 409);
    const accounts = new AccountContextService();
    const context = accounts.activate({ source: "access", user: { id: binding.metadata.access_user_id, email: binding.email }, tenantId: binding.tenantId, baseId: binding.baseId, deviceId: binding.metadata.installation_id });
    const databases = new AccountDatabases(lease, accounts), credential = store.credential(binding);
    await using opening = new AsyncDisposableStack();
    opening.defer(() => { credential.dispose(); databases.close(); });
    const assertCurrent = () => { parent.assertCurrent(); accounts.assertCurrent(context); store.assertCurrent(binding); };
    const issued = new WeakSet<VerifiedMailIdentity>();
    const identities: VerifiedMailIdentityProvider = {
      snapshot: async owner => {
        assertCurrent();
        const user = await new AccessInstallationVerifier().verify(credential, AbortSignal.any([context.signal, parent.runtime.context.signal]));
        assertCurrent();
        if (owner.accountId !== user.id || owner.tenantId !== binding.tenantId || owner.baseId !== binding.baseId) throw new CloudHttpError("cloud.mail_binding_changed", 409);
        const identity: VerifiedMailIdentity = Object.freeze({ owner: Object.freeze({ ...owner }), accessUserId: user.id,
          exposeBearer: () => { assertCurrent(); return credential.exposeBearer(); },
          toJSON: () => { throw new Error("Cloud mail identity must not be serialized"); }, [inspect.custom]: () => "CloudMailIdentity [redacted]" });
        issued.add(identity); return identity;
      },
      assertCurrent: async identity => { if (!issued.has(identity)) throw new Error("cloud.mail_identity_invalid"); assertCurrent(); },
    };
    const repositories = await databases.ensureNewAccount(context);
    assertCurrent();
    repositories.bulk.recoverVerifiedReceipts();
    repositories.bulk.interrupt();
    const access = new AccessGmailProvider(identities, databases.mailboxResolver(identities));
    const worker = new GmailBulkWorker(accounts, databases.bulkResolver(), access);
    let sending: Promise<void> | undefined, closing: Promise<void> | undefined;
    const resources = opening.move();
    const session = {
      repositories, access, owner: repositories.owner, assertCurrent,
      run: () => {
        const previous = sending;
        sending = this.#track(parent, async () => {
          await previous;
          const signal = AbortSignal.any([context.signal, parent.runtime.context.signal]);
          while (!signal.aborted) {
            assertCurrent();
            const result = await worker.tick(signal);
            if (result.state === "idle") break;
          }
        }).then(() => undefined, error => {
          repositories.bulk.interrupt();
          onFailure({ requestId: binding.id, code: "cloud.mail_send_failed", errorClass: error instanceof Error ? error.name : "UnknownError" });
        });
      },
      readback: (id: string) => this.#track(parent, () => worker.readback(context, id)),
      close: () => closing ??= (async () => { accounts.logout(); await sending; await using cleanup = resources; repositories.bulk.interrupt(); this.#sessions.delete(JSON.stringify([shop, member])); })(),
    };
    parent.runtime.resources.defer(() => session.close());
    return session;
  }
  async status(shop: string, member: string) {
    const binding = this.#options.store.load(shop, member);
    if (!binding) return { enabled: true, paired: false, mailboxes: [] };
    const session = await this.#session(shop, member);
    const connections = await session.access.refreshMailboxes(session.owner);
    session.assertCurrent();
    return { enabled: true, paired: true, account_email: binding.email, mailboxes: connections.filter(value => value.provider === "google").map(value => {
      const mailbox = session.repositories.mailbox.binding(gmailMailboxId(binding.metadata.access_user_id, value.id));
      return { id: mailbox.id, email: mailbox.email, available: mailbox.available && mailbox.authAvailable };
    }) };
  }
  async connect(shop: string, member: string) { const session = await this.#session(shop, member); return { authorize_url: await session.access.connectGoogle(session.owner) }; }
  async list(shop: string, member: string) {
    const session = await this.#session(shop, member);
    return { batches: session.repositories.bulk.list() };
  }
  async recipients(shop: string) {
    const parent = await this.#options.data.resolve(shop), repositories = await parent.databases.resolve(parent.runtime.context);
    parent.assertCurrent(); return { recipients: repositories.bulk.recipients() };
  }
  async prepare(shop: string, member: string, input: PrepareBulkInput) {
    const session = await this.#session(shop, member);
    await session.access.refreshMailboxes(session.owner);
    session.assertCurrent(); return session.repositories.bulk.create(input);
  }
  async control(shop: string, member: string, id: string, action: BulkControl) {
    const session = await this.#session(shop, member);
    session.repositories.bulk.control(id, action);
    if (action === "confirm" || action === "resume") session.run();
    return { batch: session.repositories.bulk.get(id) };
  }
  async readback(shop: string, member: string, id: string) { const session = await this.#session(shop, member); await session.readback(id); return { batch: session.repositories.bulk.get(id) }; }
  async #disconnect(shop: string, member: string) {
    const session = this.#sessions.get(JSON.stringify([shop, member]));
    if (session) await (await session).close();
    await this.#revoke(shop, member);
  }
  disconnect(shop: string, member: string): Promise<void> {
    return this.#mutations.add(async () => {
      this.#options.store.disconnect(shop, member);
      await this.#recoverPairings(shop, member);
      await this.#disconnect(shop, member);
    });
  }
  async close(): Promise<void> {
    await this.#mutations.onIdle();
    for (const session of this.#sessions.values()) await (await session).close();
  }
}

interface MailSession {
  repositories: Awaited<ReturnType<AccountDatabases["resolve"]>>;
  access: AccessGmailProvider;
  owner: Awaited<ReturnType<AccountDatabases["resolve"]>>["owner"];
  assertCurrent(): void; run(): void; readback(id: string): Promise<void>; close(): Promise<void>;
}
