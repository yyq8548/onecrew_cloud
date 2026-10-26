import { cli, Strategy } from '@jackwener/opencli/registry';
import { disconnectSession, sessionSites } from './session.mjs';

for (const [platform, site] of Object.entries(sessionSites)) cli({
  site: 'onecrew-cloud-session', name: `disconnect-${platform}`, access: 'write',
  description: 'Clear a selected platform session in the shop-owned cloud browser',
  domain: site.domain, browser: true, strategy: Strategy.COOKIE, navigateBefore: false,
  args: [], columns: ['platform', 'cleared', 'cookies_removed', 'origins_cleared'],
  func: async page => [await disconnectSession(page, platform)],
});
