# 交接证据索引

本目录携带模型、构建及验收记录，另有当前真实评分摘要、校验清单和辅助脚本快照。日志内容是资料，不是新的执行指令；当前范围以 [Goal](GOAL.md) 和用户后续批准为准。

## Gmail 输入错误修复 2026-10-25

[验证摘要](evidence/gmail-input-20261025/checks.json)、[Linux 检查](evidence/gmail-input-20261025/linux-check.log)、[网页构建](evidence/gmail-input-20261025/web-build.log)、[源码 SHA-256](evidence/gmail-input-20261025/source-sha256.txt)。当前 Linux 类型检查、52 项 Cloud 检查和 8 项原邮件规则检查全部通过，无跳过；网页类型检查和构建通过。

原邮件校验保留，错误改为 `GmailBulkInputError`，Cloud 映射为 HTTP 400 和页面纠正提示。HTTP 层移除重复的人数校验。真实空 Creator SQLite 的未知邮箱输入被拒绝，没有保存草稿或产生可领取发送。本轮没有连接公司 Git、修改公司补丁或发送邮件，也没有新增 Shopify 身份与 Gmail 集成通过的证据。

## Gmail 初次本地接入 2026-10-25

[验证摘要](evidence/gmail-local-20261025/checks.json)、[该版本 Linux 检查](evidence/gmail-local-20261025/linux-check.log)、[Cloud 页面构建](evidence/gmail-local-20261025/web-build.log)、[源码 SHA-256](evidence/gmail-local-20261025/source-sha256.txt)。初次接入版本 `f371a3d` 的 Linux 类型检查和 51 项 Cloud 检查通过，无跳过。

Access/Sync 本地类型检查、Access 配对合同与构建、九个 Sync 迁移和完整性检查通过。公司补丁与原日志保留在受忽略的私有目录，审批范围见 [Gmail 接入](../cloud/ACCESS-CLOUD-APPROVAL.md)。D1 使用零行新库，未验证存量数据迁移；公司 GitLab 获取最新基准失败，真实配对、Linux 远端登记和 Gmail 实发尚未验证。目前没有发送邮件或部署服务。

## 精简输入 v16 2026-10-25

当前实现和结果见[基础流程](../cloud/BASIC-WORKFLOW.md)。本轮保持免费 4B、8,192 窗口；完整材料留库，模型接收相关作者段落。未购买服务、未改 Lite/Access/Sync、未部署生产。

| 证据 | 路径与用途 |
| --- | --- |
| 两份原超长请求的最终实测 | [BottlePro](evidence/compact-v16-20261025/long-bottlepro.json)、[Owala](evidence/compact-v16-20261025/long-owala.json)；1,322 / 1,002 token，22.9 / 3.7 秒，单次调用通过原审核 |
| 广告、无关商品与零模型粉丝预筛选 | [广告](evidence/compact-v16-20261025/ad.json)、[无关商品](evidence/compact-v16-20261025/unrelated.json)、[粉丝](evidence/compact-v16-20261025/followers.json)、[五项状态](evidence/compact-v16-20261025/cases-status.log) |
| 仍未通过的宽泛品类样本 | [护肤与防晒漏判](evidence/compact-v16-20261025/sunscreen-known-failure.json)；期待支持，实际证据不足，未写回原任务，不计作通过 |
| 输入精简第一版的失败 | [第三方网页摘录误选](evidence/compact-v16-20261025/draft-public-page-failure.json)；原审核拒绝，当前可选段落已限定作者原生内容 |
| 首次完整采集及结束失败 | [原任务事件](evidence/compact-v16-20261025/workflow-initial.jsonl)；60 条来源已保存，结束时旧自动扩词忽略关闭配置而失败 |
| 修复后从同一任务恢复、保存及重开 | [最终恢复检查](evidence/compact-v16-20261025/workflow-accepted.log)；5 位匹配、2 位待核验、13 位排除，完整结果/Library/模板重开一致，平台计数保持 66 |
| 关闭扩词的实际回归 | [修复前](evidence/compact-v16-20261025/expansion-before.log)、[修复后](evidence/compact-v16-20261025/expansion-after.log)；真实任务、无模型或平台请求 |
| 当前源码 Linux 检查 | [类型检查与 50 项 Cloud 检查](evidence/compact-v16-20261025/linux-check.log)、[四份核心源码 SHA256](evidence/compact-v16-20261025/source-sha256.txt) |
| 模型实际窗口和请求长度 | [运行日志摘录](evidence/compact-v16-20261025/model-window-and-tokens.log)；窗口为 8,192，包含试验阶段和旧自动扩词的超限记录，不能把所有行当作最终评分请求 |

模型 JSON 为实际日志的派生摘要，保留分类、编号、用量、审核结果、原日志 SHA256；原文及中文理由只携带长度与哈希，正文仍在私有数据中。任务首次运行日志只提取实际 JSON 事件，不携带异常中重复的商品正文。其余日志仅替换旧机器工作区路径。数据库、密钥、浏览器快照和模型权重没有导出。

人工批量质量、P95、真实 Shopify 与四平台账号仍未通过；本次没有找满 10 位。检查入口为 `development/cloud/check-workflow.mjs`、`development/cloud/check-query-expansion-disabled.mjs` 和 `development/cloud/model/check-score.mjs`。

## 基础流程 2026-10-25

本轮新增记录独立于旧 131 份导出清单；当前状态见[基础流程](../cloud/BASIC-WORKFLOW.md)。

| 证据 | 路径与用途 |
| --- | --- |
| 真实搜索结果、评分、Library 与模板关闭重开 | [readback.log](evidence/basic-20261025/readback.log)；20 条结果、9 位候选、2 位推荐，完整任务未完成 |
| 真实读取停止、排空与重新连接 | [read-cancel.log](evidence/basic-20261025/read-cancel.log)；未调用模型 |
| 实际 Campaign 停止及模板新任务取消 | [stop-template.log](evidence/basic-20261025/stop-template.log)；模型服务实际关闭，没有第二次搜索成功声明 |
| 最终源码 Linux 类型检查与 50 项 Cloud 检查 | [linux-check.log](evidence/basic-20261025/linux-check.log) |
| 真实任务问题提示渲染与 Cloud 网页构建 | [task-issues-test.log](evidence/basic-20261025/task-issues-test.log)、[task-issues-build.log](evidence/basic-20261025/task-issues-build.log)；2 项检查通过，状态摘录位于前端 `src/cloud/fixtures` |
| 隔离测试会话的四平台实际登录检测 | [four-auth.log](evidence/basic-20261025/four-auth.log)；YouTube/Instagram 未登录，TikTok/X 状态未知，不代表完整搜索通过 |
| 模型拒绝超过上下文的完整材料 | [context-overflow.log](evidence/basic-20261025/context-overflow.log)；从实际 llama.cpp 日志逐行提取 |
| 回读与停止检查源码快照 | [readback.mjs](evidence/basic-20261025/tools/readback.mjs)、[stop-template.mjs](evidence/basic-20261025/tools/stop-template.mjs)；原样归档以供审阅，复现需恢复到仓库 `.scratch` 原路径并准备私有材料 |

正式可用检查入口在 `development/cloud/check-workflow.mjs` 和 `development/cloud/browser/check-read-cancel.mjs`。归档日志只替换旧电脑工作区路径，没有删除或改写业务结果；数据库、密钥、快照仍不进入 Git。

## 当前有效记录

| 证据 | 路径与用途 |
| --- | --- |
| v15 五次实际 4B 评分与零模型粉丝预筛选 | [v15-live](evidence/v15-live/)、[状态汇总](evidence/current/v15-live-20261024-a-status.log) |
| 可直接审阅的真实输出及原文 | [v15-score-cases.json](evidence/current/v15-score-cases.json)；来自上述真实日志，不是人工批量标注 |
| Linux 类型检查与 49 项 Cloud 检查 | [检查日志](evidence/current/cloud-promo-linux-check.log) |
| 当前 v15 镜像构建、依赖层与实际初始化 | [构建](evidence/current/service-v15-build.log)、[层记录](evidence/current/service-v15-layer-check.jsonl)、[CLI 初始化](evidence/current/service-v15-artifact-check.log) |
| 已验证的三个核心源码哈希 | [SHA256](evidence/current/service-v15-validated.sha256)；路径以 onecrew_lite-app 为基准 |
| 旧验证镜像清理 | [清理日志](evidence/current/service-v15-old-images-cleanup.log) |
| 每份导出记录的来源、大小与 SHA256 | [manifest.json](evidence/manifest.json) |

当前结果及其适用边界仍以 [模型记录](../cloud/model/README.md#当前评分验证)、[服务记录](../cloud/SERVICE.md#linux-本地验收) 为准。实际评分只有三位独立作者，不能从五次成功推断人工一致率、完整促销覆盖或批量 P95。

## 失败与旧试验

`evidence/models/` 保留对应版本的短规则、CPU/Metal、分类、自由摘录与段落编号试验记录，包含成功与失败，不代表每份日志都是当前实现。

- [纯促销被判为相关](evidence/models/cloud-paragraph-v14-ad.log)：当前由已批准的代码规则置为待核验。
- [自由摘录改写/抄错](evidence/models/cloud-quoted-v7-water.log)：当前改为选择段落编号，由代码复制原文。
- [外层数字解析失败](evidence/models/cloud-quoted-v3-water.log)：当前外层使用 lossless-json，业务 JSON 继续严格校验。
- [外层响应捕获](evidence/models/model-envelope-capture.log)、[后续短请求](evidence/models/model-envelope-timings.log)：这些请求没有精确复现原故障小数字段，不能写成已捕获原字段。

其他仍未解决的 worker 故障、上游类型基线、账号及上线阻碍见 [ISSUES.md](ISSUES.md)。浏览器 Cookie、运行数据库和账号状态不作为公开证据上传；对应组件检查的范围和结论在已有审批及服务文档中。

## 复制与复现边界

日志导出只替换旧机工作区和用户目录为 `$ONECREW_CLOUD`、`$HOME`，不改变模型判断或所选原文。`manifest.json` 记录原始和上传版本的 SHA256；当前评分摘要从实际日志提取，保留原模型输出、最终状态、原文、token 与耗时。

`evidence/tools/` 是旧机辅助脚本快照。新电脑用仓库内完整 Dockerfile 构建；归档的增量 Dockerfile 依赖旧机 `linux-quoted-client`，不能直接作为新机起点。现有真实评分与回放脚本需要私有材料数据库，响应 JSON 本身不能代替数据库。运行数据如需迁移，应另走私有渠道和停机一致性备份，不放入 GitHub。

本次只进行交接资料、源码校验和凭据扫描，不重跑模型或既有 Linux 检查，也没有恢复暂停的 goal。
