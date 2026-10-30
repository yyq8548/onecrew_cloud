import { z } from 'zod';
import { discoveryReviewMaterial } from '@onecrew/runtime-contracts/discovery';
import { candidateSchema, countsSchema, hitSchema } from '../lib/discovery-result-schemas.ts';
import { cloudCampaign } from './campaign-contracts.ts';

const quality = z.enum(['excellent', 'good', 'medium', 'low']);
const creators = z.object({
  state: z.enum(['missing', 'current', 'sources_changed']),
  projection: z.object({ table_id: z.string(), campaign_id: z.string(), criteria_revision: z.number(), groups: z.array(z.object({ group_id: z.string(), members: z.array(z.object({ source_hit_ids: z.array(z.string()) })) })) }).nullable(),
  sources: z.array(z.object({ search_hit_id: z.string(), verdict: z.string(), contacts: z.array(z.object({ kind: z.string(), normalized_value: z.string(), source_url: z.string().url(), source_excerpt: z.string(), attribution: z.string() })) })),
  recommendations: z.array(z.object({ id: z.string(), values: z.object({ name: z.object({ name: z.string(), url: z.string().url().optional() }), category: z.string().nullable(), platform: z.string(), score: z.object({ level: quality, reason: z.string().optional() }).nullable(), contacts: z.string() }) })),
});
export const campaignResults = z.object({
  campaign: cloudCampaign, counts: countsSchema, hits: z.array(hitSchema), candidates: z.array(candidateSchema),
  library: z.object({ table: z.object({ id: z.string(), name: z.string() }).nullable(), creators: creators.nullable() }),
}).superRefine((value, context) => {
  const projection = value.library.creators?.projection;
  if (projection && (projection.campaign_id !== value.campaign.id || projection.table_id !== value.library.table?.id)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Library ownership changed' });
});
export const reviewMaterial = z.object({ material: z.unknown().transform(value => discoveryReviewMaterial.parse(value)) });
export type CampaignResults = z.infer<typeof campaignResults>;
