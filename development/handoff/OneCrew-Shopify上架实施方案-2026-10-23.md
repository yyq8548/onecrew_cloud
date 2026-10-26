# OneCrew Shopify 上架方案：继承 Lite 与 OpenCLI 的云端版本

更新日期：2026-10-23。本文依据当前本地源码、OpenCLI 1.8.8 上游源码和 Shopify 官方要求。实现已在独立的 `onecrew_cloud` 中开始，当前证据与待办见[开发记录](/Users/guanliyuan/Documents/ChatGPT/Onecrew/onecrew_cloud/development/CLOUD-IMPLEMENTATION.md)。未采购服务或执行生产部署。

## 1. 确定采用的方案

在独立的 `onecrew_cloud` 仓库和同名本地目录继承固定版本 Lite 源码，增加服务器运行入口和 Shopify 集成，继续使用现有创作者搜索适配器、Campaign、评分、Library 和数据层。按用户当前决定，邮件本轮暂不实现，仅保留明确未启用的接口。Lite、Access 和 Sync 源码保持只读。服务器同时运行 OpenCLI、Chrome 和开源模型，商家通过 Shopify 后台网页操作。

部署组成：**Shopify 内嵌界面 + Lite 云端入口 + 按店铺隔离的浏览器执行环境 + OpenCLI 1.8.8 及其扩展 + SQLite/PGlite 持久盘 + Qwen3-8B 量化模型/llama.cpp。**

采购边界：不使用 Modash，不采购创作者数据 API、模型 API、托管浏览器或托管数据库。优先使用团队已有且可长期在线的服务器与现有域名设施。需要的软件按各自开源许可使用。

目标是零新增软件许可和第三方调用费用。能否做到零新增服务器账单，取决于现有服务器容量；目前未查到可用于生产的硬件清单。电力、带宽、备份和维护仍消耗资源。Shopify 对尚未注册的 Partner 账号还有一次性 19 美元 App Store 注册费用，已注册账号应核实是否已经缴纳。[官方费用说明](https://shopify.dev/docs/apps/launch/distribution/revenue-share)

云端上线范围仅为四个平台：YouTube、TikTok、Instagram、X。每个平台保留当前已实现的功能范围，不把某个平台的资料或评论能力自动算到所有平台。Google/Yahoo 及其他来源不进入云端产品。某个平台云端验证失败时记录具体缺口并修复；调整这四个平台的范围前先提交用户审批。

## 2. 源码证据：OpenCLI 可以怎样复用

### 许可证与模块边界

OpenCLI 1.8.8 的 `package.json` 和 LICENSE 标明 Apache-2.0。可以按该许可证复用、修改和分发相关代码，保留许可证、版权及适用 NOTICE，标注修改；依赖和站点素材另按各自条款处理。网站访问权限不会因工具开源而自动获得。[LICENSE](https://github.com/jackwener/opencli/blob/v1.8.8/LICENSE)

该版本公开导出 `registry`、`errors`、`types`、`browser/cdp`、`browser/page`、`browser/utils`、`pipeline` 等模块，具备模块复用入口。[package.json](https://github.com/jackwener/opencli/blob/v1.8.8/package.json)

**具体复用方式：锁定上游 1.8.8，把其 runtime、daemon、扩展和现有适配器依赖的站点模块一起放入服务器镜像。我们已拥有的解析和业务适配器继续留在现有目录。** 使用公开导出完成集成；只有出现已确认的云端兼容缺口才在固定版本的 fork 中补丁修复，并记录上游提交和改动。

裁剪源码不会节省数据 API 费用，因为当前这些开源模块本来就没有按次收费。先保留完整依赖链能直接复用现有行为；打包体积确有问题时再按依赖图删除未使用模块。无需为云端重写一个浏览器驱动。

### 为什么保留 daemon 和扩展

上游 1.8.8 的 Linux 测试使用 **Xvfb 虚拟显示 + 有界面 Chrome + 真实扩展**。这是本方案选用该运行方式的直接源码依据；四个平台的真实云端访问仍须分别验收。[上游 Linux 测试配置](https://github.com/jackwener/opencli/blob/v1.8.8/.github/workflows/e2e-headed.yml)

上游直接 CDP 模式的 `tabs()` 返回空数组，`selectTab()` 没有实际切换行为。我们当前适配器依赖创建、选择和关闭所属标签页，因此不能只设置 `OPENCLI_CDP_ENDPOINT` 就声称迁移完成。[cdp.ts](https://github.com/jackwener/opencli/blob/v1.8.8/src/browser/cdp.ts#L448)

服务器保留扩展不要求商家安装扩展。扩展、Chrome 和 OpenCLI 都运行在我们的服务器环境中，商家电脑只需要浏览器。

### 已有适配器的实际依赖

| 现有能力 | 源码证据 | 云端处理 |
| --- | --- | --- |
| 所属标签页创建、绑定、关闭 | [owned-page.mjs](/Users/guanliyuan/Documents/ChatGPT/Onecrew/onecrew_lite2/onecrew_lite-opencli/onecrew-browser-search/owned-page.mjs:4) 使用 `newTab`、`setActivePage`、`closeTab` | 原样保留语义，继续通过扩展 Page 实现 |
| 页面读取和操作 | 同文件包装 evaluate、click；适配器还使用 fillText、hover、wait、sleep | 复用现有读取函数和校验 |
| iframe 内读取 | [hidden-email.mjs](/Users/guanliyuan/Documents/ChatGPT/Onecrew/onecrew_lite2/onecrew_lite-opencli/onecrew-youtube/hidden-email.mjs:79) 使用 frames、evaluateInFrame、cdp | 保留兼容方法，在云端真实测试 |
| 可见页面操作 | 四个平台沿用现有 Page 交互方式 | 提供虚拟显示中的可见窗口，不强制改为无头浏览器 |
| 调用上游搜索 | [search.js](/Users/guanliyuan/Documents/ChatGPT/Onecrew/onecrew_lite2/onecrew_lite-opencli/onecrew-browser-search/search.js:9) 直接加载多个 `clis/*/search.js` 或 people-search 命令 | 必须保留这些站点模块及其传递依赖 |
| 上游辅助函数 | Twitter 身份与正文适配器使用上游 shared/utils | 锁定相容版本，保留四个平台所需辅助模块 |

## 3. 服务器怎样继承现有代码

保留现有 monorepo，新增云端装配入口与 Shopify 网页入口。以下路径已开始实现，具体进度见开发记录：

| 位置 | 责任 | 复用方式 |
| --- | --- | --- |
| `onecrew_lite-app/src/cloud/` | 服务器启动、店铺运行时路由、浏览器环境生命周期 | 调用现有业务服务，替换桌面资源装配 |
| `onecrew_lite-app/src/shopify/` | 安装、身份、商品读取、Webhook、订阅 | 新增 Shopify 专用模块 |
| `onecrew_lite-app/src/discovery/server-semantic-client.ts` | llama.cpp HTTP 适配 | 实现现有 `SemanticStructuredClient` |
| `onecrew_lite-web` 的 Shopify 构建入口 | App Bridge、商品选择、平台连接、任务结果 | 复用现有页面、表格、状态和 API 合同 |
| 现有 `onecrew_lite-opencli` | 搜索、资料、帖子、评论和联系方式读取 | 保留适配器与当前校验规则 |

业务服务先采用单机单写进程，HTTPS 入口在前端转发。Node 服务可以继续监听内网或回环地址；必须改造的是其身份验证、Origin 和会话处理，避免沿用桌面本地 ticket。无需为了上架把 Node 端口直接公开。

### 浏览器执行环境

每个店铺使用独立的运行环境，隔离用户目录、OpenCLI 配置、daemon 端口、浏览器进程与登录数据。可用开源容器运行时管理网络和文件系统边界，确保环境只能访问本店铺挂载目录。浏览器和 daemon 的控制端口仅在该环境内部开放。

同一份镜像供所有店铺复用；每个店铺的持久目录独立。有任务或登录时启动浏览器，空闲时关闭进程保留目录，控制常驻内存。一个 profile 同时只允许一个浏览器进程拥有，防止 Chrome 数据库损坏和标签页串用。

现有 [chrome-host.ts](/Users/guanliyuan/Documents/ChatGPT/Onecrew/onecrew_lite2/onecrew_lite-app/src/platforms/browser/chrome-host.ts:19) 只支持 Windows/macOS，需要新增 Linux 实现。云端入口使用服务器身份链；不能在平台检查中伪装成 macOS，也不能复制商家本机受系统加密保护的 Cookie 作为默认登录方案。

### 多商户运行时是必须改造的地方

当前 [account-context.ts](/Users/guanliyuan/Documents/ChatGPT/Onecrew/onecrew_lite2/onecrew_lite-app/src/identity/account-context.ts:31) 只有一个 `#current`，新账号激活会中止上一个账号上下文。直接把这份桌面服务开放给多个店铺，会造成相互中断。

新增 `ShopRuntimeRegistry`：验证 Shopify session 后，由服务器把 shop 映射到独立的 AccountContextService、AdmissionGate、ExecutionSupervisor 和业务缓存。所有运行时与浏览器操作都从该映射取得，客户端提供的 shopId 不能替代服务器验证。店铺成员共用店铺数据，成员权限在执行时检查。

同一 OneCrew 用户拥有多个店铺时，也要建立明确的 shop→tenant/base 映射。当前 Library 部分关系以 `owner_user_id` 创建 tenant，需扩展这个归属维度，不能因为邮箱相同把多个店铺自动混在一起。

## 4. 保留 SQLite 和 PGlite

[account-databases.ts](/Users/guanliyuan/Documents/ChatGPT/Onecrew/onecrew_lite2/onecrew_lite-app/src/identity/account-databases.ts:68) 已按 accountId、tenantId、baseId 构建独立数据目录；[Library database.ts](/Users/guanliyuan/Documents/ChatGPT/Onecrew/onecrew_lite2/onecrew_lite-library/src/database.ts:38) 已有 PGlite 目录数据库和独占锁；[runtime.ts](/Users/guanliyuan/Documents/ChatGPT/Onecrew/onecrew_lite2/onecrew_lite-library/src/runtime.ts:21) 已定义 Linux 数据路径。

首版继续在服务器持久盘使用这些数据库和现有 repository SQL。无需先迁移 PostgreSQL，也无需购买 Redis。保持一个业务进程拥有共享 PGlite 数据库，各店铺运行时通过现有 Library 服务访问；不能让多个服务副本同时打开同一目录。

补充 Shopify 安装、店铺归属、商品快照、模板和持久任务状态。执行到哪一步、证据引用和已完成发送结果写入数据库。服务重启后将中断任务标为待恢复或明确失败，已完成的外部发送不能自动重放。数据库独占锁负责防止重复写进程，任务记录负责恢复业务状态，两者都保留。

数据库备份使用一致性备份或先排空写入、关闭后复制；Chrome profile 也在关闭时备份。优先使用现有备份存储，记录恢复步骤并实际恢复一次。持久文件路径不放在会被重建的镜像层或临时目录。

## 5. 商家怎样完成平台登录

在 Shopify 的“平台连接”页打开本店铺云浏览器的受限远程视图。使用开源 noVNC 作为网页客户端，连接服务器虚拟显示；商家在平台自己的真实登录页输入账号、密码和验证码。noVNC 支持浏览器访问，许可证为 MPL-2.0，分发时保留其声明和相应义务。[官方说明](https://novnc.com/info.html)

远程视图经 Shopify 身份验证后创建短时、绑定店铺的连接凭据。服务端验证 WebSocket 连接，禁止前端选择任意主机或端口。画面、Cookie、剪贴板和磁盘只属于该店铺；默认关闭不必要的剪贴板与文件传输，减少账户数据泄露面。平台登录结束关闭远程控制视图，后台程序继续使用同一个浏览器 profile。

会话失效或出现平台验证时，任务进入 `needs_connection` 并提示商家完成验证；验证通过后恢复未完成步骤。验证码和登录阻断由平台正常流程处理，不制造空搜索结果或自动绕过验证。

浏览器 profile 包含有效会话凭据，服务器按店铺加密保护存储与备份，不记录密码和 Cookie 日志。商家断开平台时停止相关任务并删除对应会话数据；卸载按 Shopify 数据处理要求清理。

远程登录视图是原生 OneCrew 工作台中的连接步骤，任务和结果由内嵌应用提供。评审时明确解释商家无需本地安装。这个交互及各平台在数据中心网络上的登录可用性必须真实验证，不能仅凭工具能启动就宣布可上架。

## 6. 免费模型与低成本执行

采用 **Qwen3-8B-GGUF 的 Q4_K_M + llama.cpp server** 作为首个实测组合，优先在已有服务器上运行 CPU 推理。官方 Qwen GGUF 页面提供该量化版本和 llama.cpp 运行入口，许可证为 Apache-2.0；llama.cpp 支持 CPU/GPU 和 schema 约束 JSON。[Qwen 模型](https://huggingface.co/Qwen/Qwen3-8B-GGUF)、[llama.cpp 服务说明](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md)

量化减少模型内存需求，但所需总内存还包括上下文缓存、浏览器、Library 和服务进程。不能用模型文件大小代替主机容量。先测实际任务 token 分布，再确定上下文上限和并发；模型请求不静默截断必要证据。CPU 推理速度未知，只有通过延迟和质量门槛，才能认定现有硬件满足上线。

当前 [semantic-client.ts](/Users/guanliyuan/Documents/ChatGPT/Onecrew/onecrew_lite2/onecrew_lite-app/src/discovery/semantic-client.ts:10) 已有结构化模型接口；[dependencies.ts](/Users/guanliyuan/Documents/ChatGPT/Onecrew/onecrew_lite2/onecrew_lite-app/src/discovery/dependencies.ts:54) 当前装配 HostSemanticClient。云端增加 HTTP 实现，保留 prompt、schema、decode、取消信号、证据引用与用量统计。`savedEvidence` 只读取已授权的本任务材料，`scoringIdentity` 包含模型和提示词版本，避免复用不同模型的旧评分缓存。

模型负责需求结构化、查询生成和证据评分。数据读取由现有 OpenCLI 适配器完成，身份与执行权限由代码控制。

先维持现有搜索步骤顺序，保留已有评分并发逻辑，以限额控制模型实际并发；不要同时改搜索并发与云端环境造成故障难以定位。完成迁移验收后，仅在目标隔离和平台限制允许时增加并行度，网页结果数量限制不会因迁移自动提高。

## 7. Shopify 必需的新功能

这些功能需要新增，现有桌面能力不能替代：

1. 内嵌 App Bridge 界面、managed installation、会话令牌验证与 token exchange；服务端维护 shop 和 OneCrew tenant/base 映射。
2. 通过 GraphQL Admin API 读取已授权商品，以 `read_products` 为必要权限起点。商品快照带来源和更新时间，进入 Campaign 规划。
3. 三个隐私 Webhook 的验签和实际数据处理，卸载停用、取消任务和数据清理。错误签名返回 401；事件收到后持久记录并完成清理。
4. 邮件本轮仅保留未启用的接口，不执行 Gmail 授权和发送，也不因此修改 Access/Sync。以后接入时再复用现有发送确认与回执机制。
5. 应用有收费时使用 Shopify App Pricing 或 Billing API，按店铺记录权益。免费应用无需凭空加入收费流程。
6. 隐私政策说明云端托管平台会话和数据用途，提供有效客服、真实界面截图、审核凭据与全流程测试指引。

依据：[认证说明](https://shopify.dev/docs/apps/build/authentication-authorization)、[隐私 Webhook](https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance)、[上架要求](https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements)。

当前云端通过 Shopify 身份验证店铺和成员；邮件暂停接入，Access/Sync 保持只读。Cloudflare Workers/R2 可继续承担已有职责。当前证据不足以认为现有 Workers 部署能直接运行完整 Node、Chrome 和模型进程，需要一台可运行这些服务的服务器。

## 8. 功能和成本边界

商家流程：安装 → 选择商品 → 连接所需平台 → 一句话生成 Campaign → 确认执行 → 查看真实证据与匹配结果 → 保存模板。

“一句话生成 skill”具体实现为可参数化的 Campaign 模板：保存规则和商品参数位置，每次执行建立独立记录。模板保存属于新增的小模块；现有 skill 文件作为宿主操作说明，不直接当成云端通用代码执行器。

| 项目 | 本方案费用处理 |
| --- | --- |
| 创作者数据 API | 不采购，复用现有 OpenCLI 网站读取 |
| OpenCLI 与自有适配器 | 开源许可和现有代码，无按次调用采购费 |
| 模型 | 免费权重自托管，无模型 API 调用采购费 |
| 数据库 | 现有 SQLite/PGlite，无托管数据库采购费 |
| 远程浏览器界面 | 开源 noVNC，自托管；使用现有 HTTPS 基础 |
| 服务器、电力、带宽、磁盘和备份 | 有已有容量时可减少新增现金支出，资源消耗仍存在 |
| Shopify 注册 | 尚未注册的 Partner 账号一次性 19 美元，按后台核实 |
| 收费后的处理费及税费 | 按 Shopify 当前规则计入经营成本 |

不把免费试用、赠送额度或免费 GPU notebook 当持续生产服务。现有硬件无法满足性能或稳定性时，应明确报告实测缺口；本方案没有授权自动采购付费资源。

## 9. 开发顺序与验收

### A. 验证继承链路

在 Linux 测试环境运行固定版本 OpenCLI、配套扩展和 Chrome/Xvfb，加载现有适配器。用真实账号先贯通 Instagram 的登录、搜索、资料、内容证据和模型评分，再依次验收其他三个平台。

验证真实扩展连接、标签页归属、iframe、前台操作、退出和清理。特别测试 YouTube iframe 读取，以及这四个平台实际导入的上游命令。原生 Node 依赖和当前 Node 版本必须在目标 Linux 镜像安装运行，不能沿用 macOS 检查结果。

同时用已有真实 payload 测 Qwen CPU 推理：建议 50 个 brief、100 份人工标注评分样本；一次有效结构化输出至少 98%，必需条件提取至少 95%，评分与人工判断一致率至少 90%。无效结果不得进入业务执行。初步体验门槛：规划 P95 不超过 60 秒、单条文本评分 P95 不超过 30 秒；这是拟定目标，尚未测量。跨店铺读取、伪造事实和未经确认发信均必须为零。

### B. 改造服务器入口

增加 Linux 浏览器管理、店铺运行时注册表、独立浏览器环境和持久任务状态。保留 repository、SQLite 和 PGlite。验证两个店铺交错操作不相互登出、不读取对方数据或浏览器；一个店铺同一数据库只有一个写入所有者。

### C. 接入 Shopify 与网页连接

完成安装、身份、商品读取、内嵌页面和 noVNC 登录流程。服务器仍运行任务时关闭商家浏览器，再重新进入查看结果；清空商家浏览器缓存后能通过 Shopify 身份恢复访问。重启服务验证会话和任务状态恢复。

### D. 完成四平台与模板验收

逐个平台执行当前承诺的搜索与证据读取，记录真实来源、返回数量、耗时和失败原因；不以解析测试代替实时访问。完成模板复用；验证取消、登录失效、站点限流和部分失败。邮件接口明确返回未启用，不把它计为已完成发送能力。

### E. 上架检查

验证隐私 Webhook、卸载清理、备份恢复、无本地客户端运行和有收费时的订阅生命周期。准备商店物料，运行 Shopify 自动检查并提交。现有平台功能未达到承诺时继续修复，若确需调整对外范围先由产品负责人决定。

记录每次 run 的店铺、步骤、版本、耗时、模型 token、浏览器占用和错误码，保留取消与停止入口。每次发布保留上一镜像与相容数据迁移；回退服务不能重放已发送邮件。发布遵循工作区[合并与部署流程](/Users/guanliyuan/Documents/ChatGPT/Onecrew/docs/release/合并与部署流程.md)。

## 10. 当前能够确认与仍待实测的事项

已经确认：OpenCLI 1.8.8 有可复用源码和公开模块；上游有 Linux 有界面浏览器与扩展测试路径；现有适配器依赖与它匹配；Lite 已有按归属分目录的数据层和结构化模型接口，单机服务器方案可以大量继承代码。

仍待实测：目标服务器容量、四个平台的数据中心网络登录和访问、各适配器运行结果、量化模型质量和 CPU 延迟、内嵌远程登录体验、账号归属改造和重启恢复。远程平台验证问题按平台正常流程处理，不能从“开源能运行”推导“所有网站永久免费稳定可用”。

这份方案的完成标准是形成可实施的复用路径和明确验收条件。当前交付已完成源码分析和方案重整；生产可用性需要上述真实执行证据。
