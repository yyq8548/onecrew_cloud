import { z } from "zod";
import { parseApplicationJson, stringifyApplicationJson } from "../contracts/application-json.ts";
import type { BulkBatch, BulkControl, PrepareBulkInput } from "../mail/gmail-bulk.ts";
import type { MailHistoryRepository } from "../mail/mail-history.ts";
import { readVerifiedRuntime, type RuntimeDescriptor } from "../service/runtime.ts";
import { CloudHttpError } from "./http-error.ts";

const user = z.object({ id: z.string().min(1), email: z.email() });
const access = z.object({ state: z.string(), user: user.nullable().optional() });
const session = z.object({ accountId: z.string().min(1), epoch: z.string().min(1) });
type MailCommand = "onecrew_gmail_connect_url" | "onecrew_gmail_refresh" | "onecrew_email_mailbox_list" | "onecrew_gmail_bulk_list" | "onecrew_gmail_bulk_prepare" | "onecrew_gmail_bulk_control" | "onecrew_gmail_bulk_readback";

// 原本机服务继续拥有 Access、Vault 和发送记录；控制凭据不会进入浏览器。
export class LocalMailClient {
  readonly #directory: string;
  #runtime: Promise<RuntimeDescriptor> | undefined;
  #identity: z.infer<typeof session> | undefined;

  constructor(directory: string) { this.#directory = directory; }
  #unavailable(error: unknown): never {
    this.#runtime = undefined; this.#identity = undefined;
    throw Object.assign(new CloudHttpError("cloud.native_mail_unavailable", 503), { cause: error });
  }
  #ready() { return this.#runtime ??= readVerifiedRuntime(this.#directory).then(undefined, error => this.#unavailable(error)); }

  async #request(path: string, input?: unknown, identity?: z.infer<typeof session>): Promise<unknown> {
    const runtime = await this.#ready();
    const response = await fetch(`${runtime.url}${path}`, {
      method: input === undefined ? "GET" : "POST", redirect: "error", signal: AbortSignal.timeout(30000),
      headers: { authorization: `Bearer ${runtime.control_token}`, "content-type": "application/json", origin: runtime.url,
        ...(identity ? { "x-onecrew-account-id": identity.accountId, "x-onecrew-auth-epoch": identity.epoch } : {}) },
      ...(input === undefined ? {} : { body: stringifyApplicationJson(input) }),
    }).then(undefined, error => this.#unavailable(error));
    if (response.status === 401) this.#unavailable(new Error("Native service rejected its control credential"));
    const value = parseApplicationJson(new Uint8Array(await response.arrayBuffer()));
    if (!response.ok || value !== null && typeof value === "object" && "ok" in value && value.ok === false) {
      const error = z.object({ error: z.union([z.string(), z.object({ code: z.string() })]) }).parse(value).error;
      const status = response.status === 401 ? 401 : response.status === 403 ? 403 : response.status === 409 ? 409 : response.status === 404 ? 404 : response.status === 400 || response.status === 422 ? 400 : 502;
      const code = typeof error === "string" ? error : error.code;
      if (code === "access.account_changed") { this.#identity = undefined; throw new CloudHttpError("cloud.native_mail_session_changed", status); }
      throw new CloudHttpError(code, status);
    }
    return value;
  }

  async access() { return access.parse(await this.#request("/_local/access/status")); }

  async owner() {
    const status = await this.access();
    if (status.state !== "signed_in" || !status.user) throw new CloudHttpError("cloud.onecrew_login_required", 401);
    return status.user;
  }

  async #session() {
    const owner = await this.owner();
    if (this.#identity && this.#identity.accountId !== owner.id) throw new CloudHttpError("access.account_changed", 409);
    if (!this.#identity) {
      const runtime = await this.#ready();
      const workspace = z.object({ url: z.url() }).parse(await this.#request("/_local/workspace", {}));
      const url = new URL(workspace.url);
      if (url.origin !== runtime.url || !url.hash.startsWith("#onecrew_ticket=")) throw new Error("cloud.local_mail_ticket_invalid");
      const identity = session.parse(await this.#request("/api/local/session", { ticket: decodeURIComponent(url.hash.slice("#onecrew_ticket=".length)) }));
      if (identity.accountId !== owner.id) throw new CloudHttpError("access.account_changed", 409);
      this.#identity = identity;
    }
    return this.#identity;
  }

  async #command<T>(name: MailCommand, input: unknown = {}): Promise<T> {
    const value = await this.#request(`/api/commands/${name}`, input, await this.#session());
    return z.object({ ok: z.literal(true), result: z.unknown() }).parse(value).result as T;
  }

  async status() {
    this.#runtime = undefined;
    const status = await this.access();
    if (status.state !== "signed_in" || !status.user) return { enabled: true, paired: false, mailboxes: [] };
    this.#identity = undefined;
    await this.#command("onecrew_gmail_refresh");
    const mailboxes = await this.#command<ReturnType<MailHistoryRepository["mailboxes"]>>("onecrew_email_mailbox_list");
    return { enabled: true, paired: true, account_id: status.user.id, account_email: status.user.email,
      mailboxes: mailboxes.filter(mailbox => mailbox.provider === "gmail").map(mailbox => ({ id: mailbox.mailbox_ref_id, email: mailbox.email_address, available: mailbox.available && mailbox.capabilities.includes("send") && mailbox.capabilities.includes("sent_readback") })) };
  }

  async pair() {
    this.#runtime = undefined; this.#identity = undefined;
    const value = z.object({ authorizeUrl: z.url() }).parse(await this.#request("/_local/access/login", {}));
    return { authorize_url: value.authorizeUrl };
  }
  async connect() { return { authorize_url: await this.#command<string>("onecrew_gmail_connect_url") }; }
  batches() { return this.#command<BulkBatch[]>("onecrew_gmail_bulk_list"); }
  prepare(input: PrepareBulkInput) { return this.#command<BulkBatch>("onecrew_gmail_bulk_prepare", { input }); }
  async #batch(id: string) {
    const batch = (await this.batches()).find(value => value.id === id);
    if (!batch) throw new CloudHttpError("cloud.mail_batch_missing", 404);
    return batch;
  }
  async control(id: string, action: BulkControl) {
    await this.#command("onecrew_gmail_bulk_control", { input: { id, action } });
    return this.#batch(id);
  }
  async readback(id: string) {
    await this.#command("onecrew_gmail_bulk_readback", { id });
    return this.#batch(id);
  }
}
