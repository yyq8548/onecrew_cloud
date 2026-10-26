import { useTranslation } from 'react-i18next';
import type { DiscoveryReviewMaterial } from '@onecrew/runtime-contracts/discovery';

export function PublicPageReceipt({ read }: { read: DiscoveryReviewMaterial['public_pages'][number] }) {
  const { t } = useTranslation('shell');
  const status = read.status === 'reading' ? t('opencliPilot.publicPageStatus.reading') : read.status === 'completed' ? t('opencliPilot.publicPageStatus.completed') : read.status === 'failed' ? t('opencliPilot.publicPageStatus.failed') : read.status;
  return <div className="space-y-1 break-words text-xs">
    <p role="status">{status}{read.stop_code ? ` · ${read.stop_code}` : ''}</p>
    <p>{t('opencliPilot.publicPageSource')}: {read.source_url}</p>
    <p className="whitespace-pre-wrap">{read.source_excerpt}</p>
    <p>{t('opencliPilot.publicPageRequested')}: {read.requested_url}</p>
    {read.status === 'completed' && <>
      <p>{t('opencliPilot.publicPageDocument')}: {read.document_url}</p>
      <p className="font-medium">{read.title}</p>
      <p className="max-h-64 overflow-y-auto whitespace-pre-wrap">{read.markdown_excerpt}</p>
      {read.truncated && <p>{t('opencliPilot.publicPageTruncated')}</p>}
    </>}
    <p className="text-muted-foreground">{t('opencliPilot.publicPageLimit')}</p>
  </div>;
}

export function ReviewMaterialContent({ material }: { material: DiscoveryReviewMaterial }) {
  const { t, i18n } = useTranslation('shell');
  const transcript = material.transcript;
  const criteria = material.criteria && typeof material.criteria === 'object' ? material.criteria as Record<string, unknown> : {};
  const requirements: unknown[] = Array.isArray(criteria.requirements) ? criteria.requirements : [];
  const rawNative = material.native_content?.native_content;
  const native = rawNative && typeof rawNative === 'object' ? rawNative : null;
  const transcriptStatus = !transcript ? '' : transcript.status === 'reading' ? t('opencliPilot.reviewStatus.reading') : transcript.status === 'completed' ? t('opencliPilot.reviewStatus.completed') : transcript.status === 'failed' ? t('opencliPilot.reviewStatus.failed') : transcript.status === 'unavailable' ? t('opencliPilot.reviewStatus.unavailable') : transcript.status;
  return <div className="space-y-4 break-words text-sm">
    <p className="text-muted-foreground">{t('opencliPilot.reviewLimit')}</p>
    <p className="break-all">{material.hit.source_url}</p>
    <p>{t('opencliPilot.reviewAuthor', { id: material.native_author_id })}</p>
    <p>{t('opencliPilot.reviewRevision', { revision: material.criteria_revision })}</p>
    {requirements.length > 0 && <ul className="list-disc pl-5">{requirements.map((requirement, index) => <li key={index}>
      {typeof requirement === 'object' && requirement !== null && 'excerpt' in requirement && typeof requirement.excerpt === 'string' ? requirement.excerpt : t('opencliPilot.additionalConditions')}
    </li>)}</ul>}
    {material.native_followers != null && <p>{t('opencliPilot.reviewNativeFollowers', { value: String(material.native_followers) })}</p>}
    {material.native_follower_estimate && <p>{t('opencliPilot.reviewApproximateFollowers', {
      display: material.native_follower_estimate.display,
      lower: material.native_follower_estimate.lower.toLocaleString(i18n.resolvedLanguage),
      upper: material.native_follower_estimate.upper.toLocaleString(i18n.resolvedLanguage),
    })}</p>}
    {material.native_profile && <div className="space-y-1 rounded-md border p-3">
      <p className="font-medium">{t('opencliPilot.reviewNativeProfile')}</p>
      <p className="break-all">{material.native_profile.profile_url}</p>
      <p>{t('opencliPilot.reviewCaptured', { time: new Date(material.native_profile.observed_at * 1000).toLocaleString(i18n.resolvedLanguage) })}</p>
      {material.native_profile.bio && <p className="whitespace-pre-wrap">{material.native_profile.bio}</p>}
      {material.native_profile.self_declared_location && <p>{t('opencliPilot.reviewSelfDeclaredLocation', { location: material.native_profile.self_declared_location })}</p>}
      <p className="text-muted-foreground">{t('opencliPilot.reviewNativeProfileLimit')}</p>
    </div>}
    <p className="break-all text-xs">{t('opencliPilot.reviewHash', { hash: material.material_hash })}</p>
    {native && 'text' in native && typeof native.text === 'string' && <>
      <h3 className="font-medium">{t('opencliPilot.reviewNativeContent')}</h3>
      <p className="whitespace-pre-wrap">{native.text}</p>
      {'text_truncated' in native && native.text_truncated === true && <p>{t('opencliPilot.reviewTruncated')}</p>}
    </>}
    {native && 'description' in native && typeof native.description === 'string' && <>
      <h3 className="font-medium">{t('opencliPilot.reviewNativeContent')}</h3>
      <p className="whitespace-pre-wrap">{native.description}</p>
      {'description_truncated' in native && native.description_truncated === true && <p>{t('opencliPilot.reviewTruncated')}</p>}
    </>}
    {material.hit.platform === 'tiktok' && <>
      <h3 className="font-medium">{t('opencliPilot.reviewSearchCaption')}</h3>
      <p className="whitespace-pre-wrap">{material.hit.title}</p>
      <p className="text-muted-foreground">{t('opencliPilot.reviewSearchCaptionLimit')}</p>
    </>}
    {material.hit.platform === 'youtube' && <>
      <h3 className="font-medium">{t('opencliPilot.reviewDescription')}</h3>
      <p className="whitespace-pre-wrap">{material.video_description ?? t('opencliPilot.reviewMissing')}</p>
      <h3 className="font-medium">{t('opencliPilot.reviewTranscript')}</h3>
      {!transcript ? <p>{t('opencliPilot.reviewMissing')}</p> : <>
        <p>{transcriptStatus}{transcript.stop_code ? ` · ${transcript.stop_code}` : ''}</p>
        <p>{t('opencliPilot.reviewCaptured', { time: new Date(transcript.captured_at * 1000).toLocaleString(i18n.resolvedLanguage) })}</p>
        {transcript.status === 'completed' && <>
          {transcript.segments.map((line, index) => <p className="whitespace-pre-wrap" key={index}><span className="font-mono">{line.timestamp}</span> {line.speaker} {line.text}</p>)}
          {transcript.truncated && <p>{t('opencliPilot.reviewTruncated')}</p>}
        </>}
      </>}
    </>}
    <h3 className="font-medium">{t('opencliPilot.reviewPages')}</h3>
    {material.public_pages.length === 0 ? <p>{t('opencliPilot.reviewMissing')}</p> : material.public_pages.map(page => <PublicPageReceipt key={page.requested_url} read={page} />)}
  </div>;
}
