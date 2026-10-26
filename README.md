# OneCrew Cloud

面向 Shopify 后台的独立云端版本，继承 Lite 的创作者搜索、Campaign、证据评分和 Library。服务器运行浏览器与开源模型，商家无需安装客户端。邮件本轮仅保留未启用的接口。

仓库：https://github.com/yyq8548/onecrew_cloud.git。导入来源为 Lite 提交 `1ac72b654eaf823df6c14ce512e34c6c43ddd8f2`，来源和进度见 [开发记录](development/CLOUD-IMPLEMENTATION.md)。目录和包标识保留 `onecrew_lite-*` 以便复用；本仓库不依赖相邻 Lite 源码或账号目录。

**换电脑开发先读 [交接入口](development/handoff/README.md)。** 其中保存 goal、原始总方案、当前有效范围、进度、问题与验收证据。当前优先完成[最简单版本的本地基础流程](development/cloud/BASIC-WORKFLOW.md)，线上环境暂缓；Git 不迁移 Codex 的运行状态。

## 当前实现

- 按店铺独立持有原 AccountContextService、AdmissionGate 和 ExecutionSupervisor，拒绝店铺共用存储归属。
- 服务器语义客户端复用原 SemanticStructuredClient 合同，支持 JSON schema、证据输入、取消、输出大小限制与独立评分缓存身份。
- 独立 Cloud HTTP 入口使用 Shopify 官方 SDK 验证会话、交换 token、验证 Webhook 和读取商品；SQLite 加密保存 offline session 与持久收件。
- 私有持久目录、独占锁、显式初始化与关闭恢复，安装和卸载以事务版本检查处理并发。
- 卸载持久收件驱动店铺任务取消和运行时排空，排空期间阻止重装，服务启动时恢复未完成的卸载处理。
- 提供 OpenCLI 1.8.8、配套扩展、Chromium/Xvfb 的 Linux 容器构建入口。
- Linux 浏览器入口复用目录锁并管理所属进程，真实验证了两套环境独立运行、正常重启和故障关闭。
- 容器内四平台搜索入口复用原 OpenCliReader，通过私有 socket 接受任务、返回结果和取消排空；真实 YouTube 调用已通过。
- 宿主服务按店铺分配浏览器，活动数据保存在容器内存目录，任务结束后保存加密快照并停止容器；两店铺搜索、重开恢复和卸载取消已实际验证。
- 网页入口复用现有界面组件，接入商品、四平台搜索与 noVNC 登录窗口。远程连接使用短时单次凭据；实际 VNC 数据流和连接权限检查已通过，真实 Shopify 内嵌体验仍待验收。

云端平台范围为 YouTube、TikTok、Instagram、X。本地装配和部分验收已完成；真实 Shopify、四平台完整业务、人工批量质量与持续运行条件尚未全部验收，不能视为可上架。

## 本地开发

使用 Node.js 26.7.0、pnpm 10.32.1 和根目录锁文件。

```sh
pnpm install --frozen-lockfile
pnpm build:tables
pnpm typecheck
pnpm check:contracts
pnpm --filter onecrew-web build:cloud
node --test --test-concurrency=4 onecrew_lite-app/tests/cloud-*.test.ts
```

Cloud 启动方法与当前验证范围见 [Cloud HTTP 服务](development/cloud/SERVICE.md)。Linux 浏览器构建与边界见 [浏览器环境](development/cloud/browser/README.md)。继承代码的构建说明见 [development/README.md](development/README.md)，桌面安装内容不作为云端部署入口。

免费模型的固定权重、Linux CPU 配置、本机 Metal 验证和实际性能见 [模型验证](development/cloud/model/README.md)。待填写的 [Shopify 应用配置模板](development/cloud/shopify.app.toml.example)对应当前权限和 Webhook 路由，需真实开发应用与 HTTPS 地址后才能使用。按用户当前要求，邮件本轮暂不接入，Access/Sync 保持只读。

不购买付费服务。账号凭据、浏览器会话、模型权重、数据库和依赖缓存不提交。第三方许可证保留在所属模块；当前项目没有整体开源授权声明。

[Shopify 提交材料草稿](development/cloud/SHOPIFY-SUBMISSION.md)包含商店文案、英文审核步骤、截图与录屏范围、隐私说明的代码依据及待补材料。该文件尚未用于提交，真实业务和评分质量验收仍须完成。
