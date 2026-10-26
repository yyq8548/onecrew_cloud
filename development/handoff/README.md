# 换电脑开发交接

更新日期：2026-10-25。仓库为 `https://github.com/yyq8548/onecrew_cloud.git`，源码与交接资料已上传，尚未上架或部署生产。用户已恢复基础功能开发，goal 当前为 **active**；优先完成最简单的本地搜索、评分与结果保存流程，线上环境暂缓。

## 先读这几份文件

| 内容 | 入口 |
| --- | --- |
| 完整目标、暂停状态、恢复条件 | [GOAL.md](GOAL.md) |
| 当前有效总计划与实现进度 | [CLOUD-IMPLEMENTATION.md](../CLOUD-IMPLEMENTATION.md) |
| 最简单版本的当前真实基础流程 | [BASIC-WORKFLOW.md](../cloud/BASIC-WORKFLOW.md) |
| 用户提供的原始总方案 | [原方案归档](OneCrew-Shopify上架实施方案-2026-10-23.md) |
| 当前问题、已处理失败与注意事项 | [ISSUES.md](ISSUES.md) |
| 当前模型结果与限制 | [模型记录](../cloud/model/README.md#当前评分验证) |
| 服务、环境变量、数据与备份 | [SERVICE.md](../cloud/SERVICE.md) |
| 上架文案草稿及尚缺条件 | [SHOPIFY-SUBMISSION.md](../cloud/SHOPIFY-SUBMISSION.md) |
| 用户工作约定与发布流程 | [工作约定](WORKSPACE-RULES.md)、[发布流程](../../docs/release/合并与部署流程.md) |
| 携带的真实验收与失败记录 | [证据索引](EVIDENCE.md) |

原方案按原文归档，里面的旧 8B、CPU、长文本规划和邮件安排，已由用户后续批准覆盖：当前仅免费 4B，商品＋平台＋粉丝范围，默认共 10 位 KOL；无长文本需求规划或独立确认页；四平台；邮件返回未启用/501。原文中的旧机器绝对路径只记录原位置，开发入口使用本交接文件中的仓库相对链接。

原方案归档与旧机用户文件逐字一致，SHA256 为 `a5f39400d53db8ec667f5f839c9f081af926efe1f913ca42860ece54a877b3d4`。携带的发布流程与旧机工作区版本一致，SHA256 为 `bf07a73b1445a857ff7e20b8929aad3c69d05ec035a7370a5fe422af28fe6806`。

## 当前可确认的状态

- Lite 固定提交 `1ac72b654eaf823df6c14ce512e34c6c43ddd8f2` 已独立导入，不携带 Lite Git 历史或账号目录。完整源码、锁文件、Library/vendor 源码和固定回归夹具在本仓库。
- Cloud 简化输入、商品相关性、任务进度和停止、条件模板、结果与证据、店铺隔离、隐私处理、浏览器与受限断开补丁已有实现。真实 Shopify 与四平台完整业务仍未验收。
- 当前评分为 v15：复用关键词选择段落，4B 只返回关系、段落编号及身份，代码复制原文和生成等级说明。所选段落命中获批的两个合作/优惠表达时，先待核验、不评分。
- 类型检查与 49 项 Cloud Linux 检查通过。当前 v15 五次真实 4B Metal 评分通过，约 12.7–18.8 秒，每次一轮，无重试；粉丝超限零模型调用。只有三位独立作者，不代表人工批量质量、P95 或完整 Campaign 通过。
- 旧机默认 Linux 验证镜像 v15 为 `f18a613c2af1`，上一版 v12 为 `f9175d539c69`；源码哈希及镜像实际 CLI 初始化通过。镜像 ID 不会随 Git 迁移。

## 新电脑准备

1. 克隆本仓库，使用 Node 26.7.0、pnpm 10.32.1 和 Docker。其他系统不能直接继承 M1 Metal 的性能结论。
2. 在仓库根目录按下列命令安装和构建代码。原生模块需要对应系统编译环境，详见 [开发说明](../README.md)。

```sh
pnpm install --frozen-lockfile
pnpm build:tables
pnpm typecheck
pnpm check:contracts
pnpm --filter onecrew-web build:cloud
```

3. Linux 运行时从仓库内完整 Dockerfile 构建。旧机的增量 Dockerfile 依赖本地基准，只作为证据归档。

```sh
docker build -f development/cloud/browser/Dockerfile -t onecrew-cloud-browser:worker .
docker build -f development/cloud/service/Dockerfile -t onecrew-cloud-service:linux-check .
docker run --rm --network none onecrew-cloud-service:linux-check
```

4. 免费 4B 权重及 llama.cpp 运行包按 [模型文档](../cloud/model/README.md) 的固定版本、大小和 SHA256 重新准备。Mac ARM 使用已验证的 Metal 入口；Linux CPU 配置保留，但旧 CPU 测量慢，不能宣称性能达标。不要重新测试 8B。
5. 按 [服务说明](../cloud/SERVICE.md) 使用独立私有数据目录。真实 Shopify 应用和 HTTPS origin 后续再配置；本地基础功能先用真实公开商品与原执行器验证。密钥放受忽略配置；不要复制 Lite 数据目录。

## Git 不携带的本机状态

模型权重、原生运行包、node_modules、构建缓存、Docker 镜像、Shopify 凭据、浏览器会话、加密快照、主密钥和运行数据库需在新环境准备。三个旧 Lite 桌面安装 ZIP 不属于 Cloud 源码；安装脚本与固定测试夹具继续保留。

仓库携带公开内容的模型输出、失败记录与脱敏验收日志，供审阅和追溯。现有 `check-score.mjs` 需要原私有材料数据库，不能只拿日志直接回放；可在恢复后重新采集，或通过私有渠道按停机一致性备份流程迁移整个数据目录和配套密钥。不要把这些运行数据上传 GitHub。

## 当前下一步

先完成真实本地 Campaign 搜索、评分、Library/模板与停止恢复链路。真实 Shopify 安装、商品与成员权限、Webhook、卸载重装后续再验收；四平台账号验收仍按实际证据记录。生产 HTTPS、备份、主体/政策/联系人与审核材料继续作为上架条件。

仅修改 onecrew_cloud，不修改 Lite/Access/Sync，不购买服务。新电脑接续前检查最新提交、goal 和当前验证记录。
