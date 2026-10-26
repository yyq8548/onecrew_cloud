import { withOwnedSearchPage } from '../onecrew-browser-search/owned-page.mjs';
import { Page } from '@jackwener/opencli/browser/page';

export const sessionSites = Object.freeze({
  youtube: { domain: 'www.youtube.com', domains: ['youtube.com', 'google.com'], origins: ['https://www.youtube.com', 'https://youtube.com', 'https://accounts.google.com', 'https://www.google.com', 'https://myaccount.google.com', 'https://consent.youtube.com', 'https://consent.google.com'] },
  tiktok: { domain: 'www.tiktok.com', domains: ['tiktok.com'], origins: ['https://www.tiktok.com', 'https://tiktok.com', 'https://m.tiktok.com'] },
  instagram: { domain: 'www.instagram.com', domains: ['instagram.com', 'facebook.com'], origins: ['https://www.instagram.com', 'https://instagram.com', 'https://www.facebook.com', 'https://m.facebook.com', 'https://accountscenter.instagram.com', 'https://accountscenter.facebook.com'] },
  twitter: { domain: 'x.com', domains: ['x.com', 'twitter.com'], origins: ['https://x.com', 'https://www.x.com', 'https://twitter.com', 'https://www.twitter.com', 'https://mobile.twitter.com'] },
});

export async function disconnectSession(page, platform) {
  if (!Object.hasOwn(sessionSites, platform)) throw new Error('ONECREW_SESSION_PLATFORM_INVALID');
  const site = sessionSites[platform];
  const belongs = domain => typeof domain === 'string' && site.domains.some(allowed => domain.replace(/^\./u, '') === allowed || domain.endsWith(`.${allowed}`));
  const scoped = new Page('onecrew-cloud-session', undefined, page.contextId, 'background', 'adapter', 'persistent', page.preferredContextId);
  return withOwnedSearchPage(scoped, async owned => {
    await owned.goto(undefined, { settleMs: 1 });
    const origins = new Set(site.origins);
    const cookies = (await Promise.all(site.domains.map(domain => owned.getCookies({ domain })))).flat();
    const selected = cookies.filter(cookie => belongs(cookie.domain));
    for (const cookie of selected) {
      const domain = cookie.domain.replace(/^\./u, '');
      origins.add(`https://${domain}`); origins.add(`http://${domain}`);
    }
    for (const origin of origins) await owned.cdp('Storage.clearDataForOrigin', { origin, storageTypes: 'all' });
    const remaining = (await Promise.all(site.domains.map(domain => owned.getCookies({ domain })))).flat();
    if (remaining.some(cookie => belongs(cookie.domain))) {
      console.error(JSON.stringify({ event: 'onecrew.session_clear_incomplete', remaining: remaining.filter(cookie => belongs(cookie.domain)).map(({ name, domain, secure, httpOnly }) => ({ name, domain, secure, httpOnly })) }));
      throw new Error('ONECREW_SESSION_CLEAR_INCOMPLETE');
    }
    return { platform, cleared: true, cookies_removed: selected.length, origins_cleared: origins.size };
  });
}
