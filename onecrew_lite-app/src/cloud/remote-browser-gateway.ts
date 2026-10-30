import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { createWebSocketStream, WebSocket, WebSocketServer } from "ws";
import { z } from "zod";
import type { ShopifyWorkspace } from "../shopify/installation-store.ts";
import type { WorkspaceStore } from "./workspaces.ts";
import { cloudPlatform, type CloudPlatform } from "./platforms.ts";
import { ShopBrowserManager } from "./shop-browser-manager.ts";
import { CloudHttpError } from "./http-error.ts";
import { DockerBrowserClient, dockerCommand } from "./docker-browser-client.ts";
import { cloudLoginResult, type cloudLoginInput } from "./login-form.ts";

interface Ticket { workspace: ShopifyWorkspace; member: string; platform: CloudPlatform; revision: number; expires: number }
type LoginResult = Awaited<ReturnType<ShopBrowserManager["connect"]>>;
interface ViewerSession { ticket: Ticket; cancel: AbortController; done: Promise<void>; result: Promise<LoginResult>; finishing: { checkAuth: boolean; container?: string; endViewer?: () => void } }

// 凭据只在内存中保留九十秒并且只能使用一次；URL 不携带凭据或目标地址。
export class RemoteBrowserGateway {
  readonly #store: WorkspaceStore;
  readonly #browsers: ShopBrowserManager;
  readonly #origin: string;
  readonly #failure: (error: unknown) => void;
  readonly #tickets = new Map<string, Ticket>();
  readonly #sessions = new Map<WebSocket, ViewerSession>();
  readonly #sockets = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024, perMessageDeflate: false, handleProtocols: protocols => protocols.has("binary") ? "binary" : false });
  #closed = false;
  constructor(store: WorkspaceStore, browsers: ShopBrowserManager, origin: string, failure: (error: unknown) => void) {
    this.#store = store; this.#browsers = browsers; this.#origin = origin; this.#failure = failure;
  }
  issue(workspace: ShopifyWorkspace, member: string, rawPlatform: unknown) {
    if (this.#closed) throw new CloudHttpError("cloud.connections_stopping", 503);
    const platform = cloudPlatform.parse(rawPlatform);
    z.string().min(1).parse(member);
    const current = this.#store.workspace(workspace.shop);
    if (!current || current.uninstalled_at !== null || current.tenant_id !== workspace.tenant_id || current.base_id !== workspace.base_id) throw new CloudHttpError("shopify.installation_changed", 409);
    for (const [key, value] of this.#tickets) if (value.expires <= Date.now() || value.workspace.shop === workspace.shop && value.member === member) this.#tickets.delete(key);
    const token = randomBytes(32).toString("hex"), expires = Date.now() + 90000;
    this.#tickets.set(token, { workspace, member, platform, expires, revision: this.#store.lifecycleRevision(workspace.shop) });
    return { path: "/connections/socket", protocol: `onecrew.${token}`, expires_at: expires, session_seconds: 900 };
  }
  attach(server: Server): void {
    server.on("upgrade", (request, socket, head) => this.#upgrade(request, socket, head));
  }
  #active(workspace: ShopifyWorkspace, member: string, platform: CloudPlatform) {
    const active = [...this.#sessions].find(([, session]) => session.ticket.workspace.shop === workspace.shop);
    if (!active) return null;
    const [, session] = active;
    if (session.ticket.member !== member || session.ticket.platform !== platform || session.ticket.workspace.tenant_id !== workspace.tenant_id || session.ticket.workspace.base_id !== workspace.base_id) throw new CloudHttpError("cloud.viewer_owner_mismatch", 403);
    if (session.ticket.revision !== this.#store.lifecycleRevision(workspace.shop)) throw new CloudHttpError("shopify.installation_changed", 409);
    return active;
  }
  async paste(workspace: ShopifyWorkspace, member: string, platform: CloudPlatform, text: string): Promise<void> {
    const active = this.#active(workspace, member, platform);
    if (!active || !active[1].finishing.container || active[1].finishing.checkAuth) throw new CloudHttpError("cloud.viewer_disconnected", 409);
    // 文本只经stdin进入当前会话剪贴板；子进程不继承命令输出管道。
    await dockerCommand(["exec", "-i", "-e", "DISPLAY=:99", active[1].finishing.container, "sh", "-c", "xclip -selection clipboard -in >/dev/null 2>&1"], text);
  }
  async fillLogin(workspace: ShopifyWorkspace, member: string, input: z.infer<typeof cloudLoginInput>) {
    const active = this.#active(workspace, member, input.platform);
    if (!active || !active[1].finishing.container || active[1].finishing.checkAuth) throw new CloudHttpError("cloud.viewer_disconnected", 409);
    return cloudLoginResult.parse(await new DockerBrowserClient(active[1].finishing.container).request("POST", "/login/fill", input));
  }
  async finish(workspace: ShopifyWorkspace, member: string, platform: CloudPlatform): Promise<LoginResult | null> {
    const active = this.#active(workspace, member, platform);
    if (!active) return null;
    const [viewer, session] = active;
    session.finishing.checkAuth = true;
    if (session.finishing.endViewer) session.finishing.endViewer();
    else viewer.close();
    return session.result;
  }
  #upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    socket.on("error", () => socket.destroy());
    const protocols = request.headers["sec-websocket-protocol"]?.split(",").map(value => value.trim()) ?? [];
    const credential = protocols.find(value => /^onecrew\.[a-f0-9]{64}$/u.test(value))?.slice(8);
    const ticket = credential ? this.#tickets.get(credential) : undefined;
    if (credential) this.#tickets.delete(credential);
    if (this.#closed || request.url !== "/connections/socket" || request.headers.origin !== this.#origin || !protocols.includes("binary") || !ticket || ticket.expires <= Date.now() || ticket.revision !== this.#store.lifecycleRevision(ticket.workspace.shop) || this.#store.workspace(ticket.workspace.shop)?.uninstalled_at !== null) {
      socket.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nCache-Control: no-store\r\n\r\n");
      return;
    }
    this.#sockets.handleUpgrade(request, socket, head, viewer => {
      const cancel = new AbortController();
      const signal = AbortSignal.any([cancel.signal, AbortSignal.timeout(900000)]);
      const finishing: ViewerSession["finishing"] = { checkAuth: false };
      viewer.once("close", () => { if (!finishing.checkAuth) cancel.abort(new Error("cloud.viewer_disconnected")); });
      viewer.once("error", () => cancel.abort(new Error("cloud.viewer_failed")));
      const result = this.#browsers.connect(ticket.workspace, ticket.platform, signal, async (container, stopped) => {
        finishing.container = container;
        if (viewer.readyState === WebSocket.OPEN) await this.#relay(viewer, container, stopped, finishing);
        return finishing.checkAuth;
      });
      const done = result.then(() => undefined, error => {
        if (error !== signal.reason && !(error instanceof CloudHttpError && error.message === "shopify.installation_changed")) this.#failure(error);
      }).finally(() => {
        viewer.terminate(); this.#sessions.delete(viewer);
      });
      this.#sessions.set(viewer, { ticket, cancel, done, result, finishing });
    });
  }
  async #relay(viewer: WebSocket, container: string, signal: AbortSignal, finishing: ViewerSession["finishing"]): Promise<void> {
    signal.throwIfAborted();
    const remote = spawn("docker", ["exec", "-i", container, "node", "/opt/onecrew/viewer.mjs"], { stdio: ["pipe", "pipe", "ignore"] });
    const stream = createWebSocketStream(viewer);
    const done = Promise.withResolvers<void>();
    finishing.endViewer = done.resolve;
    const abort = () => { viewer.terminate(); done.resolve(); };
    remote.once("error", done.reject);
    remote.once("exit", code => code === 0 ? done.resolve() : done.reject(new Error("cloud.viewer_process_failed")));
    remote.stdin.once("error", done.reject);
    stream.once("error", done.reject);
    viewer.once("close", done.resolve);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    remote.stdout.pipe(stream); stream.pipe(remote.stdin);
    try { await done.promise; }
    finally {
      delete finishing.endViewer;
      signal.removeEventListener("abort", abort);
      remote.stdout.unpipe(stream); stream.unpipe(remote.stdin);
      stream.destroy(); remote.stdin.end(); remote.stdout.destroy();
    }
  }
  async close(): Promise<void> {
    this.#closed = true; this.#tickets.clear();
    const active = [...this.#sessions.entries()];
    for (const [viewer, session] of active) { session.cancel.abort(new Error("cloud.connections_stopping")); viewer.terminate(); }
    await Promise.all(active.map(([, session]) => session.done));
    await new Promise<void>((resolve, reject) => this.#sockets.close(error => error ? reject(error) : resolve()));
  }
}
