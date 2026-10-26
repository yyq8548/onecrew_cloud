import { z } from 'zod';
import { isU64 } from '@onecrew/runtime-contracts/result-wire';

const u64 = z.custom<number | bigint>(isU64);
const runSchema = z.object({ platform: z.string(), profile_ref: z.string(), status: z.string(), calls_used: z.number(), stop_code: z.string().nullable(), updated_at: z.number().int().optional() });
export const campaignSchema = z.object({
  id: z.string(), phase: z.string(), revision: z.number(), brief: z.string(),
  opencli_version: z.string(),
  criteria: z.object({ min_subscribers: u64.optional(), min_followers: u64.optional(), max_subscribers: u64.optional(), max_followers: u64.optional(), region: z.string().optional(), language: z.string().optional(), category: z.string().optional(), requires_ai_tool_demo: z.boolean().optional(), requires_public_tool_url: z.boolean().optional() }).passthrough(),
  target_count: z.number(), used_calls: z.number(),
  scopes: z.array(z.object({ platform: z.string(), profile_ref: z.string(), keywords: z.array(z.string()) })),
  platform_runs: z.array(runSchema),
});
