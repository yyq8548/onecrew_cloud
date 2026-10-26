import type { z } from 'zod';
import { DiscoveryPlanRequirements } from '@/pages/connect/discovery-plan-requirements';
import { platform, platformLabels } from './api';
import { cloudCampaign } from './campaign-contracts';

type Plan = Pick<z.infer<typeof cloudCampaign>, 'target_count' | 'scopes' | 'criteria' | 'source_targets'>;
export default function CampaignPlan({ plan }: { plan: Plan }) {
  return <div className="space-y-3 text-sm">
    <p className="font-medium">目标：寻找 {plan.target_count} 位匹配商品的 KOL</p>
    <ul className="list-disc space-y-1 pl-5">{plan.scopes.map(scope => <li key={scope.platform}>{platformLabels[platform.parse(scope.platform)]}{plan.source_targets?.[scope.platform] ? `（目标 ${plan.source_targets[scope.platform]} 位）` : ''}：{scope.keywords.join('、')}</li>)}</ul>
    <dl className="grid gap-2 sm:grid-cols-2">
      {plan.criteria.category && <div><dt className="inline text-muted-foreground">类别：</dt><dd className="inline">{plan.criteria.category}</dd></div>}
      {plan.criteria.language && <div><dt className="inline text-muted-foreground">语言：</dt><dd className="inline">{plan.criteria.language}</dd></div>}
      {plan.criteria.region && <div><dt className="inline text-muted-foreground">地区：</dt><dd className="inline">{plan.criteria.region}</dd></div>}
      {(plan.criteria.min_subscribers !== undefined || plan.criteria.min_followers !== undefined) && <div><dt className="inline text-muted-foreground">粉丝数量下限：</dt><dd className="inline">{String(plan.criteria.min_subscribers ?? plan.criteria.min_followers)}</dd></div>}
      {(plan.criteria.max_subscribers !== undefined || plan.criteria.max_followers !== undefined) && <div><dt className="inline text-muted-foreground">粉丝数量上限：</dt><dd className="inline">{String(plan.criteria.max_subscribers ?? plan.criteria.max_followers)}</dd></div>}
    </dl>
    {plan.criteria.requires_ai_tool_demo && <p>需要本人展示 AI 工具。</p>}
    {plan.criteria.requires_public_tool_url && <p>需要公开的工具链接。</p>}
    <DiscoveryPlanRequirements criteria={plan.criteria} />
  </div>;
}
