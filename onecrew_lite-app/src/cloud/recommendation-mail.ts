import { z } from "zod";
import { CloudHttpError } from "./http-error.ts";
import type { ShopDataService } from "./shop-data.ts";
import type { ShopLibraryService } from "./shop-library.ts";
import { normalizeEmailAddress, type BulkRecipient } from "../mail/gmail-bulk.ts";

export const recommendationMailSelection = z.strictObject({
  campaign_id: z.string().min(1).max(128), expected_revision: z.number().int().positive(),
  recipients: z.array(z.strictObject({ creator_id: z.string().min(1), email: z.email() })),
});

export const cloudMailDraft = z.strictObject({ mailbox_ref_id: z.string().min(1), subject: z.string(), body: z.string(),
  recipients: z.array(z.strictObject({ email: z.string(), source: z.string() })), selection: recommendationMailSelection.optional() });

export function verifiedMailRecipients(recipients: readonly BulkRecipient[], verified: readonly BulkRecipient[]): BulkRecipient[] {
  const known = new Map(verified.map(contact => [normalizeEmailAddress(contact.email), contact]));
  return recipients.map(contact => {
    const saved = known.get(normalizeEmailAddress(contact.email));
    if (saved) return saved;
    if (contact.source !== "用户输入") throw new CloudHttpError("cloud.mail_recipient_unverified", 409);
    return contact;
  });
}

export async function recommendationMailRecipients(data: ShopDataService, library: ShopLibraryService, owner: string, selection: z.infer<typeof recommendationMailSelection>) {
  const campaign = await data.campaign(owner, selection.campaign_id);
  if (campaign.revision !== selection.expected_revision) throw new CloudHttpError("discovery.revision_changed", 409);
  const saved = await library.campaignResults(owner, selection.campaign_id);
  const creators = saved.creators, projection = creators?.projection;
  if (creators?.state !== "current" || projection?.criteria_revision !== selection.expected_revision) throw new CloudHttpError("cloud.mail_recommendations_changed", 409);
  return selection.recipients.map(selected => {
    const row = creators.recommendations.find(row => row.id === selected.creator_id);
    const group = row && projection.groups.find(group => group.group_id === row.id);
    if (!group) throw new CloudHttpError("cloud.mail_recipient_unverified", 409);
    const hits = new Set(group.members.flatMap(member => member.source_hit_ids));
    const contact = creators.sources.filter(source => hits.has(source.search_hit_id)).flatMap(source => source.contacts)
      .find(contact => contact.kind === "email" && contact.attribution === "author_published" && contact.normalized_value.toLowerCase() === selected.email.toLowerCase());
    if (!contact) throw new CloudHttpError("cloud.mail_recipient_unverified", 409);
    return { email: contact.normalized_value, source: contact.source_url };
  });
}
