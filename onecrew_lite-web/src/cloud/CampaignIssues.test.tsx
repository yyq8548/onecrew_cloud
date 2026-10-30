import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import english from './translations/en';
import { parseApplicationJson } from '@onecrew/runtime-contracts/json';
import CampaignIssues from './CampaignIssues';
import { cloudCampaign } from './campaign-contracts';

function savedStatus(name: string) {
  const record = parseApplicationJson(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
  return z.object({ job: z.object({ state: z.string() }), counts: z.object({ qualified: z.number() }), platform_runs: cloudCampaign.shape.platform_runs, deferred_scores: z.number().int().nonnegative() }).parse(record);
}
async function renderStatus(status: ReturnType<typeof savedStatus>, language = 'zh-CN') {
  const i18n = i18next.createInstance();
  await i18n.init({ lng: language, defaultNS: 'cloud', resources: { 'zh-CN': { cloud: {} }, 'en-US': { cloud: english } } });
  return renderToStaticMarkup(<I18nextProvider i18n={i18n}><CampaignIssues runs={status.platform_runs} deferredScores={status.deferred_scores} /></I18nextProvider>);
}

describe('actual Cloud task issue display', () => {
  it('shows the actual stopped platform instead of leaving a zero-result task unexplained', async () => {
    const status = savedStatus('profile-stop');
    const markup = await renderStatus(status);
    expect(status.job.state).toBe('completed');
    expect(status.counts.qualified).toBe(0);
    expect(markup).toContain('YouTube 搜索已中断');
    expect(markup).toContain('请在「平台账号」检查连接');
    expect(markup).toContain('role="alert"');
  });

  it('shows pending scores from the actual task that exceeded the model window', async () => {
    const status = savedStatus('deferred-scores');
    const markup = await renderStatus(status);
    expect(status.deferred_scores).toBe(2);
    expect(markup).toContain('有 2 条内容暂未完成评分');
    expect(markup).toContain('已保留材料');
    expect(markup).not.toContain('搜索已中断');
    expect(markup).toContain('YouTube 读取已中断');
    expect(markup).toContain('role="status"');
  });

  it('renders the same real failure and pending-count evidence in English', async () => {
    const failure = await renderStatus(savedStatus('profile-stop'), 'en-US');
    expect(failure).toContain('YouTube search was interrupted.');
    expect(failure).toContain('Check the connection under Platform accounts');
    const pending = await renderStatus(savedStatus('deferred-scores'), 'en-US');
    expect(pending).toContain('2 items are awaiting review.');
    expect(pending).toContain('YouTube reading was interrupted.');
  });
});
