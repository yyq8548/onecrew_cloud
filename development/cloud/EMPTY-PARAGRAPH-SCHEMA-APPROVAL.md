# 空内容段落的评分约束

2026-10-26 用户已批准，按以下范围实施和验证。

## 真实失败

2026-10-26，Instagram 内容搜索已成功返回帖子作者，任务中已有 1 位评分写入 Library。随后候选 `https://www.instagram.com/koalastraw/` 在当前已保存材料中没有可引用的内容段落。

使用该候选原材料和同一 4B 独立诊断，实际输出为：`relation=related_product_use_case`、`paragraph_id=""`、`creator=unknown`。原审核抛出 `cloud.score_source_excerpt_required`。保存这次真实输出后无模型调用回放，同样失败，确认可选段落数量为 0。

## 修改范围

仅修改 onecrew_cloud 内 `onecrew_lite-app/src/cloud/campaign-scoring.ts`：当可选内容段落为空时，模型输出 JSON Schema 只允许 `relation=insufficient_content_evidence`、`paragraph_id=""`、`creator=unknown`。有段落的评分逻辑不变。

这使现有“没有内容依据就待核验”的规则同时约束模型生成与解码。继续执行原审核，不捕获错误伪装成功，不重试、不增加生产模型调用，不扩大上下文、不修改分数或粉丝范围。资料继续由原执行链补充，不能把待核验当作匹配。

## 验证

- 原真实错误响应必须被新 Schema 拒绝。
- 同一真实材料在 4B 上一次输出合法的证据不足，并通过原审核。
- 复用已有有段落材料核对评分行为不变。
- 继续原 Instagram 任务，核对完整评分、Library、模板和关闭重开结果；保持未完成项可见。

原错误响应已被新 Schema 拒绝；同一真实材料使用 4B 一次返回合法的证据不足，并通过原审核。有段落的保存响应回放保持原等级、引用和审核结果，未增加模型调用。类型检查及 6 项相关测试通过，见[验证证据](../handoff/evidence/empty-paragraph-schema-20261026.json)。

原 Instagram 任务恢复后正常完成：13 条来源、13 位候选、2 位匹配、5 位待核验、6 位因粉丝不足排除；评分、Library、条件模板、重复请求及关闭重开检查通过，无失败代码或延期评分。本轮未找满 10 位，见[完整流程证据](../handoff/evidence/instagram-workflow-20261026/summary.json)。
