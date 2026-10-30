import { z } from 'zod';
import { discoveryDraftProgress, discoveryExecutionStatus } from '@onecrew/runtime-contracts/discovery';
import { campaignSchema } from '../lib/discovery-campaign-schema.ts';

export const platform = z.enum(['youtube', 'tiktok', 'instagram']);

const sourceTargets = z.record(z.number().int().positive()).optional();
export const cloudCampaign = campaignSchema.extend({ approved_at: z.number().int().nullable(), source_targets: sourceTargets });
const productFields = { id: z.string(), title: z.string(), description: z.string(), vendor: z.string().optional(), onlineStoreUrl: z.string().url().nullable(), captured_at: z.number().int() };
const productSnapshot = z.union([z.object({ ...productFields, source: z.literal('manual') }), z.object({ ...productFields, updatedAt: z.string() })]);
export const manualProduct = z.object({ title: z.string().trim().min(1).max(200), description: z.string().trim().min(1).max(2000), vendor: z.string().trim().min(1).max(120).optional(), onlineStoreUrl: z.string().url().nullable() });
export const campaignJob = z.object({
  id: z.string().uuid(), shop: z.string(), campaign_id: z.string(), kind: z.enum(['draft', 'execution']), state: z.enum(['running', 'completed', 'failed', 'interrupted']),
  phase: z.string(), brief: z.string(), expected_revision: z.number().int().nullable(), error_code: z.string().nullable(), created_at: z.number().int(), updated_at: z.number().int(), product: productSnapshot.nullable(),
});
export const executionSnapshot = z.unknown().transform(value => discoveryExecutionStatus.nullable().parse(value));
export const campaignJobStatus = z.object({
  job: campaignJob, campaign: cloudCampaign.nullable(), draft_progress: z.unknown().transform(value => discoveryDraftProgress.nullable().parse(value)), execution: executionSnapshot,
  counts: z.object({ qualified: z.number().int(), pending: z.number().int(), rejected: z.number().int() }).nullable(),
});
export type CampaignJob = z.infer<typeof campaignJob>;
export type CampaignJobStatus = z.infer<typeof campaignJobStatus>;
export const campaignConditions = z.object({ platforms: z.array(platform).min(1).max(platform.options.length), min_followers: z.number().int().safe().nonnegative(), max_followers: z.number().int().safe().nonnegative().default(Number.MAX_SAFE_INTEGER), target_count: z.literal(10) }).refine(value => value.min_followers <= value.max_followers);
export const campaignTemplateSummary = z.object({ id: z.string().uuid(), shop: z.string(), name: z.string(), campaign_id: z.string(), expected_revision: z.number().int(), rules: z.string(), conditions: campaignConditions.nullable(), created_at: z.number().int() });
export const campaignTemplate = campaignTemplateSummary.extend({ reference_plan: campaignSchema.pick({ id: true, brief: true, opencli_version: true, criteria: true, scopes: true, target_count: true }).extend({ source_targets: sourceTargets }) });
export type CampaignTemplateSummary = z.infer<typeof campaignTemplateSummary>;
export type CampaignTemplate = z.infer<typeof campaignTemplate>;
