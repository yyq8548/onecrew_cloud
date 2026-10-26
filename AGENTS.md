# OneCrew Cloud 工作约定

- 在新电脑或新对话接续时，先读 [交接入口](development/handoff/README.md)、[Goal](development/handoff/GOAL.md) 和 [用户工作约定](development/handoff/WORKSPACE-RULES.md)。按其中的当前状态接续，用户明确恢复前保持 goal 暂停。
- Cloud 开发只修改 onecrew_cloud，Lite 保持只读。Gmail 所需 Access、Sync 改动在独立本地目录制作补丁，完成验证后交用户审批，由 River 合并；不得自行推送或发布公司服务。当前有效方案和进度见 [开发记录](development/CLOUD-IMPLEMENTATION.md)，原始方案归档不能覆盖用户后续批准。
- 保持简单，复用已有能力；不购买付费服务。方案、费用、关键权限或评分职责调整先提交具体范围，获得用户批准后实施。
- 仅使用免费 4B，不再测试 8B。平台限定 YouTube、TikTok、Instagram、X；Gmail 复用现有授权和发送能力，保留成员归属、发送确认和实际回执。
- 使用文件编辑工具修改代码，临时文件放受忽略的 `.scratch`；不使用 `/tmp`、脚本改写源码或 Git 回滚代码。保留用户已有修改。
- 使用真实材料与实现验证，模拟参数或本地检查不能证明 Shopify、平台账号或生产验收通过。复用仍对当前源码有效的检查证据。
- 涉及公司分支、MR、合并、客户端打包、Cloudflare/R2 或生产发布时，先读取 [合并与部署流程](docs/release/合并与部署流程.md)。本仓库的 GitHub 源码交接不等于生产发布。
- 当前实现依赖与启动方法见 [README](README.md) 和 [Cloud 服务](development/cloud/SERVICE.md)。换电脑从仓库内完整 Dockerfile 构建，不依赖旧机镜像 ID 或 `.scratch` 基准镜像。

## 构建与缓存

- 开发期间持续清理本任务生成、已经确认不用的旧构建和缓存。保留当前版本、上一版，以及运行中、验证中或仍需回退的产物。
- 清理前核对实际进程、任务、插件和验证引用，确认绝对路径属于当前工作区。源码、账号数据、浏览器身份和必要验收日志保留。具体边界见 `development/README.md` 的清理要求。
