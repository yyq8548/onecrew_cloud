import { z } from "zod";
import { cloudPlatform } from "./platforms.ts";

export const cloudCampaignConditions = z.strictObject({
  platforms: z.array(cloudPlatform).min(1).max(cloudPlatform.options.length).refine(values => new Set(values).size === values.length),
  min_followers: z.number().int().safe().nonnegative(),
  max_followers: z.number().int().safe().nonnegative().default(Number.MAX_SAFE_INTEGER),
  target_count: z.literal(10).default(10),
}).refine(value => value.max_followers >= value.min_followers, { path: ["max_followers"], message: "cloud.invalid_follower_range" });
export type CloudCampaignConditions = z.output<typeof cloudCampaignConditions>;

export function cloudConditionsFromPlan(plan: { scopes: readonly { platform: string }[]; criteria: Record<string, unknown>; target_count: number }): CloudCampaignConditions | null {
  const parsed = cloudCampaignConditions.safeParse({ platforms: plan.scopes.map(scope => scope.platform), min_followers: plan.criteria.min_subscribers ?? plan.criteria.min_followers, max_followers: plan.criteria.max_subscribers ?? plan.criteria.max_followers, target_count: plan.target_count });
  return parsed.success ? parsed.data : null;
}
