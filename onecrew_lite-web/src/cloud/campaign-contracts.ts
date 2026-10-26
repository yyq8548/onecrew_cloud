import { z } from 'zod';
import { discoveryDraftProgress, discoveryExecutionStatus } from '@onecrew/runtime-contracts/discovery';
import { campaignSchema } from '../lib/discovery-campaign-schema.ts';

const sourceTargets = z.record(z.number().int().positive()).optional();
export const cloudCampaign = campaignSchema.extend({ approved_at: z.number().int().nullable(), source_targets: sourceTargets });
const productSnapshot = z.object({ id: z.string(), title: z.string(), description: z.string(), onlineStoreUrl: z.string().url().nullable(), updatedAt: z.string(), captured_at: z.number().int() });
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
export const campaignConditions = z.object({ platforms: z.array(z.enum(['youtube', 'tiktok', 'instagram', 'twitter'])).min(1).max(4), min_followers: z.number().int().safe().nonnegative(), max_followers: z.number().int().safe().nonnegative(), target_count: z.literal(10) }).refine(value => value.min_followers <= value.max_followers);
export const campaignTemplateSummary = z.object({ id: z.string().uuid(), shop: z.string(), name: z.string(), campaign_id: z.string(), expected_revision: z.number().int(), rules: z.string(), conditions: campaignConditions.nullable(), created_at: z.number().int() });
export const campaignTemplate = campaignTemplateSummary.extend({ reference_plan: campaignSchema.pick({ id: true, brief: true, opencli_version: true, criteria: true, scopes: true, target_count: true }).extend({ source_targets: sourceTargets }) });
export type CampaignTemplateSummary = z.infer<typeof campaignTemplateSummary>;
export type CampaignTemplate = z.infer<typeof campaignTemplate>;
