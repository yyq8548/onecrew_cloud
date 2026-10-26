import PQueue from "p-queue";
import type { AccountContext } from "../identity/account-context.ts";
import { OpenCliError } from "../platforms/opencli/errors.ts";
import type { OpenCliReaderApi, VerifiedOpenCliBrowserBinding, VerifiedOpenCliPublicSource } from "../platforms/opencli/reader.ts";
import type { ShopifyWorkspace } from "../shopify/installation-store.ts";
import type { CloudBrowserRead, CloudBrowserReadResult } from "./browser-operations.ts";
import { cloudPlatform } from "./platforms.ts";
import type { ShopData } from "./shop-data.ts";
import { ShopBrowserManager } from "./shop-browser-manager.ts";

interface Configuration { readonly data: ShopData; readonly workspace: ShopifyWorkspace; readonly browsers: ShopBrowserManager }
interface Shared { readonly queue: PQueue; readonly bindings: WeakSet<VerifiedOpenCliBrowserBinding> }
const unavailable = async (..._args: unknown[]): Promise<never> => { throw new OpenCliError("opencli_read_command_unavailable"); };

// 业务代码使用店铺签发的逻辑 profile；worker 再映射到真实且唯一的扩展 profile。
export class CloudDiscoveryReader implements OpenCliReaderApi {
  readonly version = "1.8.8";
  readonly #config: Configuration;
  readonly #shared: Shared;
  readonly #onFailure: ((error: OpenCliError) => void) | undefined;

  constructor(config: Configuration, shared: Shared = { queue: new PQueue({ concurrency: 1 }), bindings: new WeakSet() }, onFailure?: (error: OpenCliError) => void) {
    config.data.assertCurrent();
    const principal = config.data.runtime.context.principal;
    if (principal.source !== "shopify" || principal.shop !== config.workspace.shop || principal.tenantId !== config.workspace.tenant_id || principal.baseId !== config.workspace.base_id) throw new Error("cloud.browser_owner_mismatch");
    this.#config = config;
    this.#shared = shared;
    this.#onFailure = onFailure;
  }

  withDiagnostics(onFailure: (error: OpenCliError) => void) { return new CloudDiscoveryReader(this.#config, this.#shared, onFailure); }

  binding(context: AccountContext, profile: string, cancellation: AbortSignal = context.signal): VerifiedOpenCliBrowserBinding {
    const { data } = this.#config;
    data.runtime.accounts.assertCurrent(context);
    data.assertCurrent();
    if (profile !== "cloud") throw new OpenCliError("opencli_profile_unavailable");
    const signal = AbortSignal.any([context.signal, cancellation]);
    const binding: VerifiedOpenCliBrowserBinding = Object.freeze({
      profile, signal,
      async assertCurrent() { data.runtime.accounts.assertCurrent(context); data.assertCurrent(); signal.throwIfAborted(); },
      withSignal: (next: AbortSignal) => this.binding(context, profile, AbortSignal.any([signal, next])),
    });
    this.#shared.bindings.add(binding);
    return binding;
  }

  async #run<T>(binding: VerifiedOpenCliBrowserBinding | undefined, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const { data } = this.#config;
    const assertCurrent = async () => {
      data.assertCurrent();
      if (binding) {
        if (!this.#shared.bindings.has(binding)) throw new OpenCliError("opencli_profile_unavailable");
        await binding.assertCurrent();
      }
    };
    await assertCurrent();
    const signal = binding ? AbortSignal.any([binding.signal, data.runtime.context.signal]) : data.runtime.context.signal;
    // 取消后仍等待底层浏览器排空，再放行下一项读取。
    return this.#shared.queue.add(async () => {
      await assertCurrent();
      signal.throwIfAborted();
      const result = await work(signal);
      await assertCurrent();
      return result;
    }).then(value => value, error => {
      signal.throwIfAborted();
      if (error instanceof OpenCliError) this.#onFailure?.(error);
      throw error;
    });
  }

  #read<T extends CloudBrowserRead>(binding: VerifiedOpenCliBrowserBinding | undefined, input: T): Promise<CloudBrowserReadResult<T>> {
    return this.#run(binding, signal => this.#config.browsers.read(this.#config.workspace, input, signal));
  }

  async checkBrowserProfile(binding: VerifiedOpenCliBrowserBinding) { await this.#read(binding, { method: "checkBrowserProfile", args: [] }); }
  async checkYoutubeEvidenceProfile(binding: VerifiedOpenCliBrowserBinding) { await this.#read(binding, { method: "checkYoutubeEvidenceProfile", args: [] }); }
  creatorSearchCapabilities(inspectedAddons?: Parameters<OpenCliReaderApi["creatorSearchCapabilities"]>[0]) {
    if (inspectedAddons !== undefined) throw new OpenCliError("opencli_invalid_input");
    return this.#read(undefined, { method: "creatorSearchCapabilities", args: [] });
  }
  creatorSearch(binding: VerifiedOpenCliBrowserBinding, platform: string, query: string, limit: number) {
    const selected = cloudPlatform.safeParse(platform);
    if (!selected.success) throw new OpenCliError("opencli_read_command_unavailable");
    return this.#run(binding, signal => this.#config.browsers.search(this.#config.workspace, { platform: selected.data, query, limit }, signal));
  }
  checkCreatorAuthStatus(binding: VerifiedOpenCliBrowserBinding, platform: string) {
    const selected = cloudPlatform.safeParse(platform);
    if (!selected.success) throw new OpenCliError("opencli_read_command_unavailable");
    return this.#read(binding, { method: "checkCreatorAuthStatus", args: [selected.data] });
  }
  creatorProfileEvidence(binding: VerifiedOpenCliBrowserBinding, site: string, authorId: string, authorUrl: string) {
    if (site !== "tiktok" && site !== "instagram" && site !== "twitter") throw new OpenCliError("opencli_read_command_unavailable");
    return this.#read(binding, { method: "creatorProfileEvidence", args: [site, authorId, authorUrl] });
  }
  youtubeSearch(binding: VerifiedOpenCliBrowserBinding, query: string, limit: number) { return this.#read(binding, { method: "youtubeSearch", args: [query, limit] }); }
  youtubeChannel(binding: VerifiedOpenCliBrowserBinding, channel: string) { return this.#read(binding, { method: "youtubeChannel", args: [channel] }); }
  youtubeVideo(binding: VerifiedOpenCliBrowserBinding, video: string) { return this.#read(binding, { method: "youtubeVideo", args: [video] }); }
  youtubeTranscript(binding: VerifiedOpenCliBrowserBinding, video: string) { return this.#read(binding, { method: "youtubeTranscript", args: [video] }); }
  youtubeLanguageSample(binding: VerifiedOpenCliBrowserBinding, channel: string, video: string) { return this.#read(binding, { method: "youtubeLanguageSample", args: [channel, video] }); }
  youtubeRecentLanguageUrls(binding: VerifiedOpenCliBrowserBinding, channel: string) { return this.#read(binding, { method: "youtubeRecentLanguageUrls", args: [channel] }); }
  youtubeVideoEvidence(binding: VerifiedOpenCliBrowserBinding, video: string) { return this.#read(binding, { method: "youtubeVideoEvidence", args: [video] }); }
  youtubeChannelContact(binding: VerifiedOpenCliBrowserBinding, channel: string, task: string) { return this.#read(binding, { method: "youtubeChannelContact", args: [channel, task] }); }
  nativeComments(binding: VerifiedOpenCliBrowserBinding, source: Parameters<OpenCliReaderApi["nativeComments"]>[1], limit: number) {
    if (source.kind !== "tiktok_video" && source.kind !== "instagram_post") throw new OpenCliError("opencli_read_command_unavailable");
    return this.#read(binding, { method: "nativeComments", args: [{ kind: source.kind, source: source.source }, limit] });
  }
  tiktokPublicProfile(binding: VerifiedOpenCliBrowserBinding, username: string, authorId: string) { return this.#read(binding, { method: "tiktokPublicProfile", args: [username, authorId] }); }
  tiktokProfileIdentity(binding: VerifiedOpenCliBrowserBinding, username: string) { return this.#read(binding, { method: "tiktokProfileIdentity", args: [username] }); }
  tiktokRecentLanguageUrls(binding: VerifiedOpenCliBrowserBinding, username: string, authorId: string) { return this.#read(binding, { method: "tiktokRecentLanguageUrls", args: [username, authorId] }); }
  tiktokLanguageSample(binding: VerifiedOpenCliBrowserBinding, username: string, authorId: string, source: string, includeComments = true) { return this.#read(binding, { method: "tiktokLanguageSample", args: [username, authorId, source, includeComments] }); }
  instagramProfileIdentity(binding: VerifiedOpenCliBrowserBinding, username: string) { return this.#read(binding, { method: "instagramProfileIdentity", args: [username] }); }
  instagramPublicProfile(binding: VerifiedOpenCliBrowserBinding, username: string, authorId: string) { return this.#read(binding, { method: "instagramPublicProfile", args: [username, authorId] }); }
  instagramRecentOriginalPosts(binding: VerifiedOpenCliBrowserBinding, username: string, authorId: string, query = "", sourceUrl?: string) { return this.#read(binding, { method: "instagramRecentOriginalPosts", args: sourceUrl === undefined ? [username, authorId, query] : [username, authorId, query, sourceUrl] }); }
  instagramCommentLanguageEvidence(binding: VerifiedOpenCliBrowserBinding, username: string, source: string) { return this.#read(binding, { method: "instagramCommentLanguageEvidence", args: [username, source] }); }
  twitterPublicProfile(binding: VerifiedOpenCliBrowserBinding, handle: string) { return this.#read(binding, { method: "twitterPublicProfile", args: [handle] }); }
  twitterIdentityProfile(binding: VerifiedOpenCliBrowserBinding, handle: string) { return this.#read(binding, { method: "twitterIdentityProfile", args: [handle] }); }
  twitterPostIdentity(binding: VerifiedOpenCliBrowserBinding, handle: string, postId: string) { return this.#read(binding, { method: "twitterPostIdentity", args: [handle, postId] }); }
  twitterPostEvidence(binding: VerifiedOpenCliBrowserBinding, handle: string, postId: string) { return this.#read(binding, { method: "twitterPostEvidence", args: [handle, postId] }); }
  twitterPostContent(binding: VerifiedOpenCliBrowserBinding, handle: string, postId: string, accountId: string) { return this.#read(binding, { method: "twitterPostContent", args: [handle, postId, accountId] }); }
  twitterLanguageSample(binding: VerifiedOpenCliBrowserBinding, handle: string, postId: string, accountId: string) { return this.#read(binding, { method: "twitterLanguageSample", args: [handle, postId, accountId] }); }
  twitterRecentContent(binding: VerifiedOpenCliBrowserBinding, handle: string) { return this.#read(binding, { method: "twitterRecentContent", args: [handle] }); }
  readPublicWeb(binding: VerifiedOpenCliBrowserBinding, source: VerifiedOpenCliPublicSource) { return this.#run(binding, signal => this.#config.browsers.readPublicWeb(this.#config.workspace, source, signal)); }

  readonly bilibiliPublicProfile = unavailable;
  readonly bilibiliSourceVideoEvidence = unavailable;
  readonly bilibiliVideoEvidence = unavailable;
  readonly bilibiliLanguageSample = unavailable;
  readonly bilibiliRecentLanguageUrls = unavailable;
  readonly weiboPublicProfile = unavailable;
  readonly weiboPostEvidence = unavailable;
  readonly weiboOriginalComments = unavailable;
  readonly douyinPublicProfile = unavailable;
  readonly douyinOriginalContent = unavailable;
  readonly douyinOriginalComments = unavailable;
  readonly linkedinPublicProfile = unavailable;
  readonly linkedinOriginalContent = unavailable;
  readonly linkedinCurrentExperience = unavailable;
  readonly linkedinContactPage = unavailable;
  readonly linkedinOriginalComments = unavailable;
  readonly facebookSourceIdentity = unavailable;
  readonly facebookPublicProfile = unavailable;
  readonly facebookNativeProfile = unavailable;
  readonly facebookContactPage = unavailable;
  readonly facebookNativeContactPage = unavailable;
  readonly facebookNativeTargets = unavailable;
  readonly facebookRecentLanguageUrls = unavailable;
  readonly facebookReelContent = unavailable;
  readonly facebookLanguageSample = unavailable;
  readonly facebookNativeOriginal = unavailable;
}
