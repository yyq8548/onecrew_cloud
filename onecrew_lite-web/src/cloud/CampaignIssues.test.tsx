import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseApplicationJson } from '@onecrew/runtime-contracts/json';
import CampaignIssues from './CampaignIssues';
import { cloudCampaign } from './campaign-contracts';

function savedStatus(name: string) {
  const record = parseApplicationJson(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
  return z.object({ job: z.object({ state: z.string() }), counts: z.object({ qualified: z.number() }), platform_runs: cloudCampaign.shape.platform_runs, deferred_scores: z.number().int().nonnegative() }).parse(record);
}

describe('actual Cloud task issue display', () => {
  it('shows the actual stopped platform instead of leaving a zero-result task unexplained', () => {
    const status = savedStatus('profile-stop');
    const markup = renderToStaticMarkup(<CampaignIssues runs={status.platform_runs} deferredScores={status.deferred_scores} />);
    expect(status.job.state).toBe('completed');
    expect(status.counts.qualified).toBe(0);
    expect(markup).toContain('YouTube 搜索已中断');
    expect(markup).toContain('请检查上方的平台连接');
    expect(markup).toContain('role="alert"');
  });

  it('shows pending scores from the actual task that exceeded the model window', () => {
    const status = savedStatus('deferred-scores');
    const markup = renderToStaticMarkup(<CampaignIssues runs={status.platform_runs} deferredScores={status.deferred_scores} />);
    expect(status.deferred_scores).toBe(2);
    expect(markup).toContain('有 2 条内容暂未完成评分');
    expect(markup).toContain('已保留材料');
    expect(markup).not.toContain('搜索已中断');
    expect(markup).toContain('YouTube 读取已中断');
    expect(markup).toContain('role="status"');
  });
});
