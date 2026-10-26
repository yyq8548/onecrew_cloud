import { z } from "zod";
import { creatorSearchArguments } from "../platforms/opencli/sources.ts";

export const cloudPlatform = z.enum(["youtube", "tiktok", "instagram", "twitter"]);
export type CloudPlatform = z.infer<typeof cloudPlatform>;
export const CLOUD_PLATFORMS: readonly CloudPlatform[] = Object.freeze([...cloudPlatform.options]);
export const cloudCreatorSearch = z.strictObject({ platform: cloudPlatform, query: z.string().min(1), limit: z.number().int().positive() });

// 云端入口统一经过此合同；X 沿用现有适配器内部的 twitter 标识。
export function cloudCreatorSearchArguments(profile: string, request: unknown): readonly string[] {
  const input = cloudCreatorSearch.parse(request);
  return creatorSearchArguments(profile, input.platform, input.query, input.limit);
}
