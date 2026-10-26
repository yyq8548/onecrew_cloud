import { z } from 'zod';
import { isU64 } from '@onecrew/runtime-contracts/result-wire';

export const u64 = z.custom<number | bigint>(isU64);
export const hitSchema = z.object({
  id: z.string(), platform: z.string(), source_url: z.string().url(), title: z.string(), author_label: z.string(),
  search_keyword: z.string(), captured_at: z.number(), profile_ref: z.string().min(1),
  author_id: z.string().min(1).max(100).nullable(), author_url: z.string().url().nullable(),
  author_observed_at: z.number().int().nullable(),
}).refine(hit => (hit.author_id === null) === (hit.author_url === null)
  && (hit.author_id === null) === (hit.author_observed_at === null));
export const candidateSchema = z.object({
  id: z.string(), platform: z.string(), platform_account_id: z.string(),
  display_name: z.string(), profile_url: z.string().url(), verdict: z.enum(['pending', 'qualified', 'rejected']),
  evidence: z.object({
    manual_profile_contact: z.boolean().optional(),
    manual_wechat_accounts: z.array(z.object({ kind: z.enum(['wechat', 'wechat_official']), value: z.string().min(1).max(40), source_url: z.string().url(), native_author_id: z.string() })).max(10).optional(),
    associated_social_accounts: z.array(z.object({
      kind: z.literal('social_profile'), normalized_value: z.string().url(),
      source_url: z.string().url(), captured_at: z.number().int().positive(),
      native_author_id: z.string(), attribution: z.enum(['author_published', 'unconfirmed']),
    })).max(100).optional(),
    contact_status: z.object({ has_contact: z.boolean(), manual_email_required: z.boolean() }).optional(),
    source_urls: z.array(z.string().url()),
    public_links: z.array(z.string().url()).optional(),
    assessment: z.object({ reasons: z.array(z.string()), subscribers_normalized: u64.nullable(),
      match_rating: z.object({ level: z.enum(['excellent', 'good', 'medium', 'low']), reason: z.string(), source_url: z.string().url() }).nullable().optional(),
      selection: z.object({ state: z.enum(['matched', 'unmatched', 'unverified']), reason: z.string(), source_url: z.string().url() }).optional(),
      quality_rating: z.object({ level: z.enum(['excellent', 'good', 'medium', 'low']), score: z.union([z.literal(95), z.literal(85), z.literal(70), z.literal(40)]), reason: z.string(), source_url: z.string().url() }).nullable().optional(),
    }).optional(),
  }).passthrough(),
});
export const countsSchema = z.object({ qualified: z.number().int().nonnegative(), pending: z.number().int().nonnegative(), rejected: z.number().int().nonnegative() });
