import type { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { platform, platformLabels } from './api';
import { cloudCampaign } from './campaign-contracts';

type Run = z.infer<typeof cloudCampaign>['platform_runs'][number];
export default function CampaignIssues({ runs, deferredScores }: { runs: Run[]; deferredScores: number }) {
  const { t } = useTranslation('cloud');
  const stopped = runs.filter(run => ['unauthorized', 'risk_control_stop', 'technical_stop'].includes(run.status));
  if (stopped.length === 0 && deferredScores === 0) return null;
  return <div className="space-y-2 text-sm">
    {stopped.map(run => {
      const selected = platform.safeParse(run.platform);
      const name = selected.success ? platformLabels[selected.data] : run.platform;
      if (run.status === 'technical_stop' && run.stop_code?.startsWith('interrupted_')) return <p key={run.platform} role="status">{t('{{platform}} 读取已中断，已有结果已保留，可继续寻找。', { platform: name })}</p>;
      const help = run.status === 'unauthorized'
        ? '请在「平台账号」完成登录，再返回「KOL 搜索」重新开始。'
        : run.status === 'risk_control_stop'
          ? '请在「平台账号」打开浏览器并完成验证，再返回「KOL 搜索」重新开始。'
          : '请在「平台账号」检查连接，再返回「KOL 搜索」新建任务。';
      return <p key={run.platform} role="alert" className="text-destructive">{t('{{platform}} 搜索已中断。', { platform: name })}{t(help)}</p>;
    })}
    {deferredScores > 0 && <p role="status">{t('有 {{count}} 条内容暂未完成评分，已保留材料，可稍后继续寻找。', { count: deferredScores })}</p>}
  </div>;
}
