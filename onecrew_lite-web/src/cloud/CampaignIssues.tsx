import type { z } from 'zod';
import { platform, platformLabels } from './api';
import { cloudCampaign } from './campaign-contracts';

type Run = z.infer<typeof cloudCampaign>['platform_runs'][number];
export default function CampaignIssues({ runs, deferredScores }: { runs: Run[]; deferredScores: number }) {
  const stopped = runs.filter(run => ['unauthorized', 'risk_control_stop', 'technical_stop'].includes(run.status));
  if (stopped.length === 0 && deferredScores === 0) return null;
  return <div className="space-y-2 text-sm">
    {stopped.map(run => {
      const selected = platform.safeParse(run.platform);
      const name = selected.success ? platformLabels[selected.data] : run.platform;
      if (run.status === 'technical_stop' && run.stop_code?.startsWith('interrupted_')) return <p key={run.platform} role="status">{name} 读取已中断，已有结果已保留，可继续寻找。</p>;
      const help = run.status === 'unauthorized'
        ? '请在上方登录该平台账号，然后点击“开始寻找”。'
        : run.status === 'risk_control_stop'
          ? '请在上方打开平台登录窗口，完成验证后点击“开始寻找”。'
          : '请检查上方的平台连接，然后点击“开始寻找”新建任务。';
      return <p key={run.platform} role="alert" className="text-destructive">{name} 搜索已中断。{help}</p>;
    })}
    {deferredScores > 0 && <p role="status">有 {deferredScores} 条内容暂未完成评分，已保留材料，可稍后继续寻找。</p>}
  </div>;
}
