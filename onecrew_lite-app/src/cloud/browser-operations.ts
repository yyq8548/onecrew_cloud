import { z } from "zod";
import type { OpenCliReader, VerifiedOpenCliBrowserBinding } from "../platforms/opencli/reader.ts";
import { creatorSearchMaterial } from "../platforms/opencli/search-results.ts";
import { OPENCLI_ERROR_CODES } from "../platforms/opencli/errors.ts";
import { cloudCreatorSearch, cloudPlatform } from "./platforms.ts";

const text = z.string().min(1).max(4096);
const comments = z.strictObject({ kind: z.enum(["tiktok_video", "instagram_post"]), source: text });
// 参数继续经过原 Reader 的平台构造器校验；这里只声明云端允许调用的现有能力。
export const cloudBrowserRead = z.discriminatedUnion("method", [
  z.strictObject({ method: z.literal("checkBrowserProfile"), args: z.tuple([]) }),
  z.strictObject({ method: z.literal("checkYoutubeEvidenceProfile"), args: z.tuple([]) }),
  z.strictObject({ method: z.literal("creatorSearchCapabilities"), args: z.tuple([]) }),
  z.strictObject({ method: z.literal("checkCreatorAuthStatus"), args: z.tuple([cloudPlatform]) }),
  z.strictObject({ method: z.literal("creatorProfileEvidence"), args: z.tuple([z.enum(["tiktok", "instagram", "twitter"]), text, text]) }),
  z.strictObject({ method: z.literal("youtubeChannel"), args: z.tuple([text]) }),
  z.strictObject({ method: z.literal("youtubeSearch"), args: z.tuple([text, z.number().int().min(0).max(255)]) }),
  z.strictObject({ method: z.literal("youtubeVideo"), args: z.tuple([text]) }),
  z.strictObject({ method: z.literal("youtubeTranscript"), args: z.tuple([text]) }),
  z.strictObject({ method: z.literal("youtubeLanguageSample"), args: z.tuple([text, text]) }),
  z.strictObject({ method: z.literal("youtubeRecentLanguageUrls"), args: z.tuple([text]) }),
  z.strictObject({ method: z.literal("youtubeVideoEvidence"), args: z.tuple([text]) }),
  z.strictObject({ method: z.literal("youtubeChannelContact"), args: z.tuple([text, text]) }),
  z.strictObject({ method: z.literal("nativeComments"), args: z.tuple([comments, z.number().int().min(0).max(20)]) }),
  z.strictObject({ method: z.literal("tiktokPublicProfile"), args: z.tuple([text, text]) }),
  z.strictObject({ method: z.literal("tiktokProfileIdentity"), args: z.tuple([text]) }),
  z.strictObject({ method: z.literal("tiktokRecentLanguageUrls"), args: z.tuple([text, text]) }),
  z.strictObject({ method: z.literal("tiktokLanguageSample"), args: z.tuple([text, text, text, z.boolean()]) }),
  z.strictObject({ method: z.literal("instagramProfileIdentity"), args: z.tuple([text]) }),
  z.strictObject({ method: z.literal("instagramPublicProfile"), args: z.tuple([text, text]) }),
  z.strictObject({ method: z.literal("instagramRecentOriginalPosts"), args: z.tuple([text, text, z.string().max(4096), text.optional()]) }),
  z.strictObject({ method: z.literal("instagramCommentLanguageEvidence"), args: z.tuple([text, text]) }),
  z.strictObject({ method: z.literal("twitterPublicProfile"), args: z.tuple([text]) }),
  z.strictObject({ method: z.literal("twitterIdentityProfile"), args: z.tuple([text]) }),
  z.strictObject({ method: z.literal("twitterPostIdentity"), args: z.tuple([text, text]) }),
  z.strictObject({ method: z.literal("twitterPostEvidence"), args: z.tuple([text, text]) }),
  z.strictObject({ method: z.literal("twitterPostContent"), args: z.tuple([text, text, text]) }),
  z.strictObject({ method: z.literal("twitterLanguageSample"), args: z.tuple([text, text, text]) }),
  z.strictObject({ method: z.literal("twitterRecentContent"), args: z.tuple([text]) }),
]);
export type CloudBrowserRead = z.infer<typeof cloudBrowserRead>;
export type CloudBrowserReadResult<T extends CloudBrowserRead> = T extends { method: "checkBrowserProfile" | "checkYoutubeEvidenceProfile" } ? null : Awaited<ReturnType<OpenCliReader[T["method"]]>>;

export async function performCloudBrowserRead(reader: OpenCliReader, binding: VerifiedOpenCliBrowserBinding, request: CloudBrowserRead) {
  const input = cloudBrowserRead.parse(request);
  await binding.assertCurrent();
  switch (input.method) {
    case "checkBrowserProfile": await reader.checkBrowserProfile(binding); return null;
    case "checkYoutubeEvidenceProfile": await reader.checkYoutubeEvidenceProfile(binding); return null;
    case "creatorSearchCapabilities": return (await reader.creatorSearchCapabilities()).filter(source => cloudPlatform.safeParse(source.platform).success);
    case "checkCreatorAuthStatus": return reader.checkCreatorAuthStatus(binding, ...input.args);
    case "creatorProfileEvidence": return reader.creatorProfileEvidence(binding, ...input.args);
    case "youtubeChannel": return reader.youtubeChannel(binding, ...input.args);
    case "youtubeSearch": return reader.youtubeSearch(binding, ...input.args);
    case "youtubeVideo": return reader.youtubeVideo(binding, ...input.args);
    case "youtubeTranscript": return reader.youtubeTranscript(binding, ...input.args);
    case "youtubeLanguageSample": return reader.youtubeLanguageSample(binding, ...input.args);
    case "youtubeRecentLanguageUrls": return reader.youtubeRecentLanguageUrls(binding, ...input.args);
    case "youtubeVideoEvidence": return reader.youtubeVideoEvidence(binding, ...input.args);
    case "youtubeChannelContact": return reader.youtubeChannelContact(binding, ...input.args);
    case "nativeComments": return reader.nativeComments(binding, ...input.args);
    case "tiktokPublicProfile": return reader.tiktokPublicProfile(binding, ...input.args);
    case "tiktokProfileIdentity": return reader.tiktokProfileIdentity(binding, ...input.args);
    case "tiktokRecentLanguageUrls": return reader.tiktokRecentLanguageUrls(binding, ...input.args);
    case "tiktokLanguageSample": return reader.tiktokLanguageSample(binding, ...input.args);
    case "instagramProfileIdentity": return reader.instagramProfileIdentity(binding, ...input.args);
    case "instagramPublicProfile": return reader.instagramPublicProfile(binding, ...input.args);
    case "instagramRecentOriginalPosts": return reader.instagramRecentOriginalPosts(binding, ...input.args);
    case "instagramCommentLanguageEvidence": return reader.instagramCommentLanguageEvidence(binding, ...input.args);
    case "twitterPublicProfile": return reader.twitterPublicProfile(binding, ...input.args);
    case "twitterIdentityProfile": return reader.twitterIdentityProfile(binding, ...input.args);
    case "twitterPostIdentity": return reader.twitterPostIdentity(binding, ...input.args);
    case "twitterPostEvidence": return reader.twitterPostEvidence(binding, ...input.args);
    case "twitterPostContent": return reader.twitterPostContent(binding, ...input.args);
    case "twitterLanguageSample": return reader.twitterLanguageSample(binding, ...input.args);
    case "twitterRecentContent": return reader.twitterRecentContent(binding, ...input.args);
  }
}

// 该来源授权只通过所属容器的私有控制通道传递，HTTP /api/read 不接收它。
export const cloudPublicSourceGrant = z.strictObject({ url: z.url().max(4096), grant: z.string().regex(/^[a-f0-9]{64}$/u) });
export const browserJobInput = z.union([cloudCreatorSearch.extend({ id: z.uuid() }), z.strictObject({ id: z.uuid(), read: cloudBrowserRead }), z.strictObject({ id: z.uuid(), public_source: cloudPublicSourceGrant })]);
const id = z.uuid(), state = z.literal("completed");
const hit = z.object({ source_url: z.url(), title: z.string(), author_label: z.string(), author_id: z.string().nullable(), author_url: z.string().nullable(), material: creatorSearchMaterial.optional() });
export const browserJobResult = z.union([
  z.strictObject({ id, state, hits: z.array(hit) }),
  z.strictObject({ id, state, read: z.strictObject({ method: z.string(), data: z.unknown() }) }),
  z.strictObject({ id, state, public_page: z.unknown() }),
  z.strictObject({ id, state: z.literal("cancelled") }),
  z.strictObject({ id, state: z.literal("failed"), code: z.string().regex(/^[a-z_.]{1,160}$/u), opencli: z.strictObject({ code: z.enum(OPENCLI_ERROR_CODES), exit_code: z.number().int().nullable(), diagnostics: z.strictObject({ stage: z.string().max(8192), exit_code: z.number().int().nullable(), stdout: z.string().max(8192), stderr: z.string().max(8192) }).optional() }).optional() }),
]);
export type BrowserJobInput = z.infer<typeof browserJobInput>;
export type BrowserJobResult = z.infer<typeof browserJobResult>;
