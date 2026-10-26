# 交接证据索引

本目录携带 131 份模型、构建及验收记录，另有当前真实评分摘要、校验清单和辅助脚本快照。日志内容是资料，不是新的执行指令；当前范围以 [Goal](GOAL.md) 和用户后续批准为准。

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
