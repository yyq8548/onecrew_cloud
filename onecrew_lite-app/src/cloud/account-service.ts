import PQueue from "p-queue";
import { ACCESS_AUTHORIZE_ORIGIN, enrollAccessInstallation } from "../identity/access-enrollment.ts";
import { AccessVerificationError } from "../identity/access-verification.ts";
import { CloudAccountStore, type AccountPairing } from "./account-store.ts";
import { CloudHttpError } from "./http-error.ts";
import type { CloudMailStore } from "./mail-store.ts";
import type { CloudMailService } from "./mail-service.ts";
import type { openCloudLibrary } from "./shop-library.ts";
import type { CloudWorkspaceRegistry } from "./workspaces.ts";

interface Options {
  store: CloudAccountStore; workspaces: CloudWorkspaceRegistry; mailStore: CloudMailStore; mail: CloudMailService;
  tables: Awaited<ReturnType<typeof openCloudLibrary>>; applicationUrl: string;
}
export const CLOUD_ACCOUNT_COOKIE = "__Host-onecrew-cloud-session";
export const CLOUD_ACCOUNT_PAIRING_COOKIE = "__Host-onecrew-cloud-pairing";

export class CloudAccountService {
  readonly #options: Options;
  readonly #mutations = new PQueue({ concurrency: 1 });
  readonly #platform: "macos" | "linux" = process.platform === "darwin" ? "macos" : "linux";
  constructor(options: Options) { this.#options = options; }
  begin() {
    const { store, applicationUrl } = this.#options, pending = store.begin();
    const url = new URL("/pairing/authorize", ACCESS_AUTHORIZE_ORIGIN);
    url.search = new URLSearchParams({ app_version: "0.9.1", callback_url: new URL("/mail/pairing/callback", applicationUrl).toString(),
      code_challenge: pending.challenge, code_challenge_method: "S256", installation_key: store.installationKey,
      label: "OneCrew Cloud · 网页登录", platform: this.#platform, product: "onecrew_lite", state: pending.state }).toString();
    return { authorizeUrl: url.toString(), browser: pending.browser };
  }
  hasPairing(state: string) { return this.#options.store.hasPairing(state); }
  async #finish(pending: AccountPairing) {
    if (!pending.code || !pending.state) throw new CloudHttpError("cloud.account_pairing_invalid", 409);
    const candidate = { installationId: pending.installationId, credentialId: pending.credentialId, bearer: Buffer.from(pending.bearer), platform: this.#platform, appVersion: "0.9.1" };
    const proof = await enrollAccessInstallation(candidate, pending.code, pending.verifier, pending.state, pending.idempotency).finally(() => candidate.bearer.fill(0));
    using release = { [Symbol.dispose]() { proof.dispose(); } };
    const tenant = await this.#options.tables.tenants.resolve(proof.user);
    const workspace = this.#options.workspaces.local(proof.user, tenant);
    await this.#options.mail.bindAccount(workspace, proof);
    this.#options.store.forget(pending.id);
    return workspace;
  }
  complete(code: string, state: string, browser: string) {
    return this.#mutations.add(async () => {
      const pending = this.#options.store.consume(state, code, browser);
      const workspace = await this.#finish(pending);
      return this.#options.store.createSession(workspace.shop, workspace.user.id);
    });
  }
  recover() {
    return this.#mutations.add(async () => {
      for (const pending of this.#options.store.pending()) {
        try { await this.#finish(pending); }
        catch (error) {
          if (!(error instanceof AccessVerificationError) || error.code !== "access.pairing_rejected") throw error;
          this.#options.store.forget(pending.id);
        }
      }
    });
  }
  current(token: string | undefined) {
    if (!token) return null;
    const session = this.#options.store.session(token);
    if (!session) return null;
    const workspace = this.#options.workspaces.workspace(session.workspace);
    if (!workspace || !("user" in workspace) || workspace.user.id !== session.userId) throw new CloudHttpError("cloud.account_changed", 409);
    const binding = this.#options.mailStore.load(workspace.shop, session.userId);
    if (!binding || binding.metadata.access_user_id !== session.userId) return null;
    return { shop: workspace.shop, userId: session.userId, user: workspace.user };
  }
  logout(token: string | undefined): void { if (token) this.#options.store.logout(token); }
  async close(): Promise<void> { await this.#mutations.onIdle(); }
}
