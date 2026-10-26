# Cloud HTTP 服务

本入口属于本地实现阶段。已装配店铺浏览器、简化 KOL 搜索、Campaign 与内嵌页面代码；Shopify 真实安装、商品读取与有效 Webhook 尚未验收。模型单样本与平台断开组件已有真实验证，评分质量、完整搜索和四平台真实账号验收仍待完成。

Gmail 已完成本地接口和页面接入，替换原 501 空接口。复用原 Access 授权、发送确认与回执，使用店铺成员到 Access 用户的映射及成员独立邮件数据库。当前 Linux 类型检查和 51 项 Cloud 检查通过；实际授权、Linux 登记和发信待公司补丁审批、发布及真实账号验收，见 [Gmail 接入范围](ACCESS-CLOUD-APPROVAL.md)。

2026-10-25：当前为[最简单版本的本地基础流程](BASIC-WORKFLOW.md)。用户批准 v16 精简输入，保持免费 4B 和 8,192 窗口，完整材料留库；实际任务保存 60 条 YouTube 来源、20 位候选、5 位匹配、2 位待核验、13 位排除。已修复关闭自动扩词后仍发送长请求的问题，原任务恢复正常结束，Library、模板与完整结果关闭重开一致。Linux 类型检查和 50 项 Cloud 检查通过，两个原超长材料输入缩减至 1,002、1,322 token。默认 10 位未找满，宽泛品类仍有漏判；旧 v15 镜像仅作为依赖基准，不包含本轮源码，当前检查以只读挂载最终源码的记录为准。

## Shopify 应用配置

待填写的 [shopify.app.toml.example](shopify.app.toml.example) 与当前代码一致：内嵌应用、managed installation、仅 `read_products` 权限、API 版本 `2026-10`，卸载及三个隐私事件投递到 `/webhooks/shopify`。配置格式依据 [Shopify 官方说明](https://shopify.dev/docs/apps/build/cli-for-apps/app-configuration)。

创建真实开发应用后，将模板作为仓库根目录的 `shopify.app.toml`，填写真实 client ID 与 HTTPS 地址；client ID 对应 `SHOPIFY_API_KEY`，HTTPS origin 对应 `SHOPIFY_APPLICATION_URL`。client secret 仅放受忽略配置或部署环境，不写入 TOML。根地址是已有内嵌入口，当前代码使用 token exchange，没有另加传统 OAuth callback。

模板中的占位值不能部署。当前仅验证本地 TOML 语法和接口对应关系，未执行 Shopify CLI 部署、自动检查或事件订阅。真实应用与店铺仍按用户要求留待本地实现之后准备。

## 启动与持久目录

使用 Node 26.7.0、pnpm 10.32.1，在仓库根目录执行。数据目录必须使用本仓库内或部署持久盘上的独立绝对路径，不得指向 Lite 的数据目录。父目录须已存在。

```sh
pnpm cloud:initialize --data-directory /absolute/path/to/onecrew-cloud-data
pnpm --filter onecrew-web build:cloud
```

初始化创建私有目录、32 字节 `cloud.key` 和 `cloud.sqlite`，使用继承的操作系统独占锁。密钥和数据库已存在时拒绝重新初始化；启动时密钥缺失直接失败，不创建替代密钥。

启动所需环境变量：

| 环境变量 | 用途 |
| --- | --- |
| `ONECREW_CLOUD_DATA_DIRECTORY` | 前述独立持久目录的绝对路径，也可由 `--data-directory` 指定 |
| `SHOPIFY_API_KEY` | 开发应用的 client ID |
| `SHOPIFY_API_SECRET` | 开发应用的 client secret，仅保存在受忽略的本地配置或部署环境中 |
| `SHOPIFY_APPLICATION_URL` | 专用 HTTPS origin，无路径、查询参数或片段 |
| `ONECREW_CLOUD_PORT` | 本地 HTTP 端口，默认 8788 |
| `ONECREW_BROWSER_SECCOMP_PROFILE` | 已批准的 `development/cloud/browser/seccomp-profile.json` 的绝对路径 |
| `ONECREW_BROWSER_IMAGE` | 浏览器镜像，默认 `onecrew-cloud-browser:worker` |
| `ONECREW_MODEL_ENDPOINT` | 自托管 llama.cpp 结构化生成端点，默认 `http://127.0.0.1:8789/v1/chat/completions` |
| `ONECREW_MODEL_NAME` | 固定模型名称，默认 `onecrew-qwen3-4b-q4` |
| `ONECREW_MODEL_REVISION` | 权重与推理程序版本，默认 `Qwen-bc640142-Q4_K_M:7485fe6f:llama-8c74db29` |

```sh
pnpm cloud:serve
```

宿主须已构建浏览器镜像且能够调用 Docker；控制接口不挂入浏览器容器。服务仅监听 `127.0.0.1`，由现有 HTTPS 入口转发，需支持 WebSocket Upgrade。启动先将运行中 Campaign 标为中断，恢复所属浏览器资源和卸载收件，成功后监听 HTTP。SIGINT/SIGTERM 停止新浏览器任务、关闭远程视图并排空请求和卸载队列，再关闭店铺资源、数据库、内存密钥与独占锁。模型通过原结构化客户端生成短搜索关键词，并在原执行链中评分；固定筛选条件由代码生成。

SQLite 使用 WAL 和 FULL 同步。备份必须同时保护数据库与密钥，并按上架方案执行一致性备份和真实恢复验收；直接复制运行中的单个 `.sqlite` 文件不能作为备份步骤。

浏览器活动数据位于独立容器的 `/data` tmpfs。启动冷 worker 后认证恢复加密归档；任务或远程视图结束，关闭 Chrome/daemon/Xvfb，以系统 tar 归档并加密保存，提交 SQLite 指针后停止容器。当前和上一代归档保留；恢复不覆盖当前 worker 的锁或控制 socket。加密、恢复、双店铺隔离和卸载停止已真实验证。

## 路由与身份

| 路由 | 当前行为 |
| --- | --- |
| `GET /healthz` | 仅证明 HTTP 正在监听 |
| `GET /` | SDK 验证 Shopify 查询 HMAC，注入公开 API key，返回内嵌页面并设置当前店铺 frame-ancestors |
| `POST /api/shopify/install` | 验证 Shopify session token，检查当前成员商品权限，交换并加密保存 offline session，返回店铺 workspace 与四平台列表 |
| `GET /api/workspace` | 按已验证 token 的店铺读取当前有效安装，返回成员 ID 与四平台列表 |
| `GET /api/products?first=25&after=...` | 检查有效安装，使用当前成员 online token 读取商品，并在网络调用后重新检查卸载状态 |
| `GET /api/campaigns` | 使用已验证店铺的原 AccountDatabases，返回最近五项 Campaign |
| `GET /api/campaigns/:id` | 只在本店铺数据库查询 Campaign；缺失返回 404 |
| `POST /api/campaigns` | 接受请求 UUID、必选商品 ID、平台和粉丝范围，生成关键词后直接执行，目标总共 10 位 KOL；返回 HTTP 202 |
| `GET /api/campaign-templates` | 读取本店铺保存的条件模板列表 |
| `POST /api/campaign-templates` | 接受模板 UUID、名称、来源 Campaign 与版本，服务器提取平台、粉丝范围和目标数量；来源必须已批准执行 |
| `GET /api/campaign-templates/:id` | 只查询本店铺模板和原计划参考，缺失或其他店铺模板返回 404 |
| `POST /api/campaign-templates/:id/generate` | 接受独立请求 UUID 与商品 ID，读取当前商品并重新生成关键词，按保存的条件直接执行；返回 HTTP 202 |
| `GET /api/campaign-jobs` | 返回当前店铺最近二十项生成或执行任务 |
| `GET /api/campaign-jobs/:id` | 返回持久任务、原计划、生成或执行进度及匹配数量 |
| `POST /api/campaign-jobs/:id/cancel` | 停止本店铺关键词生成或当前执行，保存状态和已有证据 |
| `POST /api/campaigns/:id/approve` | 保留原版本确认接口兼容已有记录；简化入口内部批准执行，网页没有独立确认步骤 |
| `POST /api/campaigns/:id/start` | 接受独立请求 UUID 与已批准版本，通过原执行调度器继续已保存的任务；返回 HTTP 202 |
| `POST /api/campaigns/:id/pause` | 通过原 ExecutionSupervisor 暂停当前店铺指定任务 |
| `GET /api/library?page=1&size=25` | 通过原 PGlite 表格服务返回当前店铺的表格 |
| `GET /api/library/:id` | 查询本店铺表格信息，其他店铺表格返回 404 |
| `GET /api/library/:id/creators` | 返回原有创作者、证据及推荐投影 |
| `POST /api/search` | 接受四平台、关键词和数量，校验当前成员权限后在本店铺容器执行原搜索适配器 |
| `POST /api/read` | 固定白名单调用原四平台资料、内容、语言等读取方法，使用原应用 JSON 编码保留大整数 |
| `POST /api/connections` | 校验成员权限，创建当前店铺的九十秒单次连接凭据 |
| `POST /api/connections/close` | 停止本店铺远程视图，等待浏览器加密保存与容器停止 |
| `Upgrade /connections/socket` | 同源、单次子协议凭据；固定连接本店铺浏览器，最长十五分钟 |
| `GET /api/mail/status` | 当前成员配对状态及可用 Gmail 邮箱，需有效 Shopify online session |
| `POST /api/mail/pair` | 创建加密、五分钟有效、一次性 PKCE 配对状态，返回 Access 原确认入口 |
| `GET /mail/pairing/callback` | 以 code/state 完成原 Linux 安装登记与远端验证，绑定发起配对的店铺成员 |
| `POST /api/mail/connect` | 返回 Access Gmail 授权确认入口 |
| `POST /api/mail/disconnect` | 停用本应用的成员绑定并停止发送，保留共享 Gmail 授权 |
| `GET /api/mail/recipients` | 本店铺保存的邮箱联系方式与来源 |
| `GET /api/mail/batches`、`POST /api/mail/prepare` | 当前成员的历史批次与待确认草稿；prepare 不发送 |
| `POST /api/mail/send` | 对保存批次执行 confirm/pause/resume/cancel；confirm/resume 启动原 GmailBulkWorker |
| `POST /api/mail/readback` | 按原 Gmail ID 核对实际回执，未知结果不自动重发 |
| `POST /webhooks/shopify` | 官方 SDK 验证原始正文的 HMAC，事务保存加密收件记录；卸载事件在同一事务内停用安装并删除 offline session，随后立即取消本店铺任务准入并安排排空 |

API 以 `Authorization: Bearer <Shopify session token>` 验证身份。店铺来源于 SDK 验证后的 `dest`，客户端传入的店铺字段不能决定数据归属。商品权限同时检查 online token 对应成员和 `associated_user_scope`，不使用后台 offline token 提升成员权限。

产品入口只接受 `youtube`、`tiktok`、`instagram`、`twitter`；X 保留现有内部 `twitter` 标识。真实搜索验证目前覆盖 YouTube，其他平台与资料、评论等现有能力仍须分别验收。

Campaign 数据复用原 `AccountDatabases` 和 repository SQL，以安装表分配的 tenant/base 固定归属。内部身份明确标记 `source: shopify`，没有虚构邮箱或 Access 用户。成员不决定数据库路径，同店成员共享任务；原 Access 入口仍要求真实邮箱。店铺运行时清理先等待初始化和已开始任务结束，再关闭数据库；任务排空失败也会执行资源关闭，并保持停止状态。

`cloud.sqlite` 中一个店铺同时运行一项任务。简化入口用同一执行记录覆盖连接检查、关键词生成和自动搜索，完整请求摘要保证相同 UUID 重试复用结果，条件改变返回 409。网页只传商品 ID；服务端使用当前成员 online token 读取实际商品快照，保存标题、描述、来源 URL、更新时间及读取时间。商品字段依据官方 [product 查询](https://shopify.dev/docs/api/admin-graphql/2026-10/queries/product)。

创建正文为 `{ "id": "<UUID>", "product_id": "gid://shopify/Product/<ID>", "platforms": ["youtube"], "min_followers": 10000, "max_followers": 100000 }`。`target_count` 缺省为 10，指定时也只接受 10；粉丝上下限均包含端点，平台不重复且至少一个。代码固定这些条件，模型只为每个平台提供 1–3 个关键词，随后复用原 Campaign、证据与商品匹配评分。确定低于或高于范围的候选被排除，平台四舍五入数值跨越边界时保持待核验。

商品相关性写入原 `criteria.requirements`，要求真实内容证据。即使粉丝数符合范围，没有对应审核证据的候选也保持待核验；原评分流程验证内容引用、作者归属和条件版本后，才能进入匹配结果。

网页每十秒读取任务状态，关闭网页不取消服务器任务；重新进入从最近任务恢复查看。“停止寻找”取消关键词生成并通过原调度器停止正在执行的任务。服务重启把未完成记录设为 `interrupted`，不会自动重放；已保存条件和证据保留，由商家点击继续寻找。尚未保存条件的任务需要重新开始。运行期间，直接搜索与远程登录返回忙碌状态，防止争用本店浏览器。

共享 Library 位于持久目录的 `library/pglite`，由一个进程持有原数据库独占锁。PGlite 使用原服务生成的 tenant/base，并以 `shopify:<已验证店铺>` 固定归属，保留原 Teable 标识格式。原 Campaign 证据发布器已支持该店铺身份；服务端明确标记已完成解析的操作者信息，允许邮箱缺省，避免单连接事务再次查询自身。它不创建 Access 授权或邮件发送。

资料读取白名单保持平台原有能力边界，评论只开放已有的 TikTok 视频和 Instagram 帖子方法。没有新增其他平台评论能力，也没有开放任意方法、命令或参数。真实 YouTube 搜索、频道资料和原始视频描述已通过；TikTok、Instagram、X 仍待真实账号验收。

Discovery 执行器通过公开 Reader 接口复用原实现。云端依赖工厂为每个店铺签发逻辑 `cloud` profile，代理校验签发记录及当前账号，worker 使用自己的真实扩展 profile。诊断副本共享串行队列，保留原 OpenCliError、退出码及已脱敏诊断。已真实运行原搜索和视频证据执行器并写入 Campaign；简化入口、自动执行和进度接口已装配，完整业务搜索、评分与结果仍待验收。

原执行器领取来源和预算后才能调用通用公开页面读取。宿主在启动前、发送前及返回后执行来源授权回调；随机 grant 经所属容器私有通道传入，worker 在原读取器每次校验时核对当前任务、URL、取消状态及真实浏览器归属。原公网地址、DNS 和返回地址检查继续执行。`POST /api/read` 不接受该私有授权输入。该路径尚待有授权证据的完整任务实测。

浏览器镜像在服务进程内解析为固定本地 image ID。已停止且属于本服务的旧镜像容器可被替换，再从独立加密快照恢复；活动旧镜像先排空。实际验证新镜像仍保留原 profile 标记，启动同时核对 OpenCLI 1.8.8。

请求正文限制为 1 MiB。未授权请求与错误 Webhook 签名返回 401。错误响应和日志只暴露固定错误码、请求 ID 和异常类型，不输出 JWT、访问令牌或 Webhook 正文。

## 结果与证据

`GET /api/campaigns/:id/results` 读取原 Campaign、计数、搜索记录与候选，并通过原 Library 服务取得本店铺对应表格的推荐结果。`after_hit_id` 与 `after_candidate_id` 分别继续原 keyset 分页，每批各 100 条。网页在当前 Campaign 的“结果与证据”中显示推荐、评分说明、联系方式、全部候选状态和原始来源；推荐表格使用本地分页，每页 25 条。

`GET /api/campaigns/:id/hits/:hit/material?revision=` 调用原 repository 的 `prepareReviewMaterial`，返回已保存资料、原始描述/正文、字幕及公开网页回执。读取保留原证据与版本绑定；未准备材料返回 409，条件版本变化返回 409，其他店铺的 Campaign 返回 404。两个接口使用成员 online session、店铺生命周期检查和原无损 JSON 编码，不调用平台或模型。

网页复用原候选合同和只读证据组件。原生正文、网页摘录按纯文字展示；资料来源链接保留在结果表与来源列表。Library 身份快照缺失、来源改变或条件版本过期时显示等待同步，继续提供原 SQLite 候选与来源。只有当前快照的合格记录进入推荐表。证据窗口另展示已保存联系方式的原文、来源和归属状态。

## Campaign 模板

模板使用 `cloud_campaign_templates` 表，与安装和任务共享原 SQLite 连接及持久目录。保存字段包括模板 UUID、店铺、名称、来源 Campaign/版本和原计划参考。服务器从已批准的来源计划提取平台、粉丝范围和目标数量，原规则列保留由服务器生成的说明以复用存储结构。客户端不能提供参考计划或批准状态。同一 UUID 与相同请求复用已有模板，内容改变返回 409；保存期间来源版本变化也返回 409。

网页在“保存条件模板”中只填写名称。选择模板后显示其平台和粉丝范围，选择新商品即可开始；服务器按当前成员权限重新读取商品，并为新商品生成关键词。旧格式模板缺少完整粉丝范围时显示为不可选，保留原记录供查看。

每次使用模板均采用新的任务 UUID 和独立 Campaign，生成关键词后直接执行。请求摘要绑定模板 ID 与商品 ID；网络重试复用已接收任务，商品后续改名不会改变该任务保存的快照。本地存储和合同检查已经覆盖条件保存与复用，结合真实 Shopify 商品的完整执行仍待验收。

## Webhook 持久收件

收件范围为 `APP_UNINSTALLED`、`CUSTOMERS_DATA_REQUEST`、`CUSTOMERS_REDACT`、`SHOP_REDACT`。返回成功表示签名已验证并且收件事务已经提交。隐私正文使用原应用 JSON 解析器保留完整资源 ID，并校验正文中的店铺域名与已验签信封一致。实际导出或删除由原持久队列处理；处理失败保留待办并停止服务。

收件 ID 唯一；相同 ID、店铺、主题、正文摘要、API 版本和触发时间的重复请求复用已有记录。冲突内容返回 409。原始正文使用现有 Lite AES-GCM 封装加密保存，处理时解密并复核摘要。

卸载和店铺删除递增生命周期版本，即使尚无本地安装记录也保留版本；生命周期使用带密钥的店铺摘要作为键，兼容现有版本记录。安装流程在令牌交换前读取版本，保存时原子检查；交换期间发生停用则返回 409。有明确触发时间且早于本次安装授权时间的旧事件只完成收件。活动安装收到没有触发时间的店铺删除时返回 409，避免无法区分旧安装的事件删除新空间。

`ShopifyUninstallProcessor` 使用原 PQueue 串行处理卸载与隐私收件。卸载和店铺删除先同步停用对应账户上下文与任务准入，等待原 ExecutionSupervisor 排空；待处理期间安装事务返回 409。队列执行前重新检查收件是否已完成，避免同批删除覆盖了后续重复收件后再次执行。其他店铺保持可用。

排空或清理失败时保留待处理收件和运行时停止状态，报告 `cloud.webhook_processing_failed` 并关闭当前服务，CLI 以非零状态结束；重启在 HTTP 监听前恢复收件。

卸载只停止任务和浏览器、清除 Shopify 访问令牌并保留业务数据，随后由 `shop/redact` 删除本店全部浏览器快照与容器、账户数据目录、Library 实体表/字段/派生任务/租户元数据、Campaign 任务/模板、安装及隐私请求资料。Library 使用原 Teable 永久删除命令与现有写事务，保留其他店铺的共享数据库。最终 SQLite 事务清除原始收件，仅保留 HMAC 店铺/正文摘要、事件 ID、主题与处理时间用于去重；数据库使用 secure_delete 并完成 WAL checkpoint。相同删除事件在重新安装后重送也不会停用新安装。

### 客户数据请求

当前仅申请 `read_products`，没有读取或保存 Shopify 客户/订单业务记录。`customers/data_request` 的导出包括实际收到的客户资料、请求 ID、订单引用和空业务记录说明；原始收件在准备导出后清除正文，导出继续加密保存在 `shopify_privacy_requests`。`completed_at` 表示收件处理完成，`delivered_at` 表示店铺所有者确认收到导出，准备完成不会自动被视为已提供。

- `GET /api/privacy/requests`：当前店铺请求列表。
- `GET /api/privacy/requests/:id/export`：下载待提供的 JSON 导出。
- `POST /api/privacy/requests/:id/delivered`：网页收到导出后确认接收，服务器清除其中的个人资料；可以重复确认。

上述接口重新交换 Shopify online session，并检查 `associated_user.account_owner`。导出 ID 与当前店铺绑定，其他店铺无法访问。网页在“客户数据请求”中提供下载入口。客户删除根据资源 ID、邮箱或电话的带密钥摘要清除本店相应请求；不会将公开创作者联系方式认作 Shopify 客户记录。对应原始收件正文同样清除。Shopify 的三个必需隐私事件、30 天处理要求和店铺卸载后的删除事件见[官方说明](https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance)。

真实店铺所有者下载、事件订阅和投递须在开发应用/店铺中验收。历史备份过期与隐私删除后的旧备份处理须在生产备份设施中接入。

## 停机备份与恢复

首版使用关闭后复制整个持久目录的方式。先正常关闭 Cloud 服务，等待任务、Chrome、SQLite 和 PGlite 完成关闭，确认所属浏览器容器停止，再复制持久目录至新的私有目录。备份包含 `cloud.key`、`cloud.sqlite`、全部 `account-*`、共享 `library` 与 `browser-snapshots`；它们必须属于同一批次，目录权限保持 0700，密钥与数据库保持私有权限。

恢复时复制到新的持久目录，保持原文件权限，使用相容的代码与浏览器镜像。启动后由原独占锁和数据库打开流程检查持久文件，运行中任务标记为中断。加密快照随原密钥恢复，由新的所属容器使用；活动浏览器目录仍为 tmpfs。

隐私删除前的备份须从可恢复版本中撤下，并按期限清除。恢复对外服务前核对备份之后的隐私请求；需要保留的旧备份先在隔离目录完成后续删除处理。当前生产服务器与团队备份设施尚未配置，此部分继续作为上线验收项。

## Linux 本地验收

当前 v16 使用既有 Linux 依赖镜像，只读挂载最终 `src` 和 `tests` 后完成类型检查及 50 项 Cloud 检查，无跳过，耗时 31,970 毫秒，日志为 `.scratch/compact-linux-accepted.log`。没有新增镜像或生产部署。以下镜像和源码哈希记录属于 v15 历史基线；新电脑须从仓库完整 Dockerfile 构建当前源码。

在仓库根目录构建并运行专用验收镜像：

```sh
docker build -f development/cloud/service/Dockerfile -t onecrew-cloud-service:linux-check .
docker run --rm --network none onecrew-cloud-service:linux-check
```

当前源码使用 paragraph classification v15，复用任务关键词、选择段落编号并由代码复制原文，命中已批准合作或优惠表达时先待核验。本次以已验证的 `onecrew-cloud-service:linux-quoted-client`（`9eed979e5829`）为依赖环境，只读挂载当前 `campaign-scoring.ts` 和 `campaign-service.ts`，Linux 类型检查与全部 49 项 Cloud 检查通过，30,726 毫秒、无跳过，日志为 `.scratch/cloud-promo-linux-check.log`。两份当前源码 SHA256 分别为 `00ad2048ebaac249276766480698371ef2321bf8958e285f9574041d1e465fcf`、`5a809b8b18616d7e5d303b7a2447f46215fc0e2dbc4996eb4dc33692745e5f57`。

本地默认验证镜像现为 `onecrew-cloud-service:linux-check` / `linux-score-v15`，ID 为 `f18a613c2af1`。它在上述已验证依赖环境中仅新增两份 Cloud 源码层；层前缀核对通过，镜像内两份源码及模型客户端的 SHA256 与已验证文件一致，因此复用上述 49 项检查证据。镜像内实际 CLI 已成功执行独立数据初始化，目录权限为 0700、密钥及 SQLite 为 0600，实际网页入口 `dist-cloud/cloud.html` 存在。验收没有提供虚构 Shopify 凭据，不代表真实安装或 HTTP 业务验收。

构建和产物记录分别为 `.scratch/service-v15-build.log`、`.scratch/service-v15-layer-check.jsonl`、`.scratch/service-v15-artifact-check.log`；构建入口为 `.scratch/Dockerfile-service-v15`。验收容器以原 `node` 用户运行并自动删除，没有挂载用户数据。此次只更新本地验证镜像，没有部署或对外发布。

上一版 `f9175d539c69` 保留为 `linux-check-previous` / `linux-score-v12`，`9eed979e5829` 保留为增量构建基准。确认没有容器引用后，已移除旧 `linux-classification-v4`（`85bb19d07276`）和 `linux-score-v3`（`c9897920e7f0`）；清理日志为 `.scratch/service-v15-old-images-cleanup.log`。当前镜像复用的依赖共享层继续保留，不将共享层计为已回收空间。

广告、水杯、防晒、无关商品及粉丝预筛选的保存响应回放通过，回放不调用模型。当前 v15 的五项真实 4B 评分及零模型粉丝预筛选也已通过：耗时 12.7–18.8 秒，每项评分一次调用，模型已正常停止。原材料和原任务不变；仅三位独立作者的小样本，不能替代批量质量、P95 或完整业务验收，详见[当前评分验证](model/README.md#当前评分验证)。

镜像使用 Linux Node 26.7.0 与 pnpm 10.32.1，按原锁文件安装依赖，从源码构建 Library 和 Cloud 网页并执行后端类型检查。容器以非 root 用户运行现有 `cloud-*.test.ts`，使用本地回环 HTTP、真实 SQLite/PGlite 与独立临时数据目录，覆盖身份拒绝、店铺隔离、任务恢复、隐私处理和冷备份恢复。固定测试数据库仅用于验证存储与投影合同；真实 Shopify、四平台账号和模型质量仍分别验收。

## 已有验证

- Linux arm64 的 v12 基线：评分规则、证据优先顺序及条件数量约束对应的 44 项检查通过，无跳过，耗时 33,358 毫秒；日志为 `.scratch/service-linux-score-v12-build.log`、`.scratch/service-linux-score-v12-check.log`。该镜像 `f9175d539c69` 现为上一版，当前默认镜像与验证以本节 v15 记录为准。此前已移除旧镜像 `7e648365e68f` 及 13 条独有缓存，回收 925 MB，日志为 `.scratch/cleanup-score-v12-cache.log`。
- 本机 9 项相关检查通过；同一免费 4B 的 Metal 真实评分约 19–23 秒。相关防晒样本为 95 分、引用说明和标题，无关工业钻床不推荐，粉丝超限由代码排除；三项通过原审核且未写回原任务。记录见 [当前评分验证](model/README.md#当前评分验证)。批量质量、性能与完整业务仍待验收，允许的纠正错误、范围和次数保持不变。
- Docker 已恢复运行。按精确缓存 ID 清理已确认属于旧 Cloud 构建、非共享且不在保留构建链中的记录，分别回收 2.712 GB 与 2.628 GB。镜像、容器、卷、账号数据和模型权重保留。证据为 `.scratch/cleanup-old-service-cache.log`、`.scratch/cleanup-replaced-service-cache.log`。后续每次新版验证后按同一清理边界处理。
- 本次服务镜像升级后，删除已被替换且无容器引用的 `7a4f1638c86c`，并按精确 ID 清理其 13 项私有缓存，另回收 925 MB。当前与上一版保留；证据为 `.scratch/cleanup-evidence-service-cache.log`。
- 当前浏览器 `onecrew-cloud-browser:worker`（`764b647f7604`）包含已批准的两份受限补丁及独立版本扩展目录，构建与类型检查通过；完整实际站点存储清理和旧快照升级复测通过，证据为 `.scratch/platform-disconnect-domain-final.log` 与 `.scratch/platform-disconnect-domain-path-upgrade.log`。上一版 `f41fa5620856` 保留为 `worker-previous`；四平台真实登录仍待验收。
- 最新服务镜像验证后，删除已被替代且无容器引用的 `f39663336456`、`be95ef683f42`，按 26 个精确缓存 ID 另回收 1.85 GB。证据为 `.scratch/cleanup-score-v3-cache.log`；当前与上一版、浏览器、模型和资料保留。
- 浏览器新版验证后已移除本轮 3 个被替代的中间镜像和 1 个已停止测试容器，按 29 个精确缓存 ID 清理 39.46 MB，证据为 `.scratch/cleanup-domain-intermediate-cache.log`。当前版、上一版、其他有容器引用的旧镜像、模型、浏览器资料和必要日志保留；清理后本机约 16 GiB 可用。
- 本轮另清理 9 个已停止的临时验收容器及其无用户账号的测试副本，保留日志和当前残留问题快照；移除两份被替代的中间镜像，并按 31 个精确 ID 回收 1.851 GB 中间服务构建缓存。证据为 `.scratch/cleanup-cloud-intermediate-cache.log`。本轮缓存合计约 2.78 GB，清理后本机可用约 17 GiB；当前版、上一版、待验收候选、模型和用户资料保留。
- 真实本地 HTTP 监听：健康检查、未授权 API、错误签名、跨 origin 请求和超大正文。
- 真实 SQLite 文件：加密会话、收件去重与冲突、事务版本、关闭重开、密钥缺失拒绝启动。
- 真实 AccountDatabases：双店铺相同 Campaign ID 独立保存、关闭重开后保留、卸载关闭本店数据库、初始化期间卸载后可重新打开完整空库。
- 真实 PGlite：双店铺表格隔离、关闭重开后保留、卸载后拒绝访问；已有 YouTube 与 Instagram 证据记录分别用 Access 和 Shopify 归属发布，重复发布保留原记录。
- 真实原执行器：云端依赖工厂、共享读取队列、YouTube 搜索与视频证据、SQLite 调用计数，以及跨进程 OpenCliError。
- 简化流程：本地 11 项相关检查通过，覆盖固定输入、粉丝上下限、模板条件持久保存、来源版本和店铺隔离；网页构建和后端类型检查通过。证据为 `onecrew_lite-app/.scratch/cloud-simple-tests.log`、`.scratch/cloud-simple-web-build.log` 和 `onecrew_lite-app/.scratch/cloud-simple-typecheck.log`。
- 真实关键词模型：当前 CPU 配置下单个平台、本地商品文字输入耗时 26,236 毫秒，输入 158 token、输出 39 token，返回 3 条关键词；选择全部四个平台耗时 58,161 毫秒，输入 166 token、输出 156 token，共返回 12 条关键词，平台集合校验通过。证据为 `.scratch/cloud-short-keywords.log` 与 `.scratch/cloud-four-platform-keywords.log`；这两次测量不证明完整 KOL 搜索、人工质量或批量延迟达标。测试后模型容器已停止。
- Campaign 故障与取消检查脚本已适配简化请求，执行命令为 `node development/cloud/check-campaign.mjs <独立数据目录> <真实商品快照JSON>`，要求浏览器镜像可用且模型服务停止。脚本检验真实连接失败、停止、重试和持久化；尚缺真实商品快照，当前版本待运行。此前 `.scratch/campaign-full-failure-verified.log` 与 `.scratch/campaign-template-runtime-verified.log` 仅证明旧入口的浏览器故障和取消处理。
- 结果与证据读取：原保存的 YouTube/Instagram 材料通过真实 PGlite/SQLite 与网页合同解码，检查跨店铺拒绝、条件版本、未准备证据和分页。另从原浏览器执行器保存的两条真实 YouTube 来源回读一位候选和 2911 字节描述，调用次数保持 2；记录为 `.scratch/saved-results-readback-verified.log`。原展示组件的 43 项相关检查通过。
- 真实镜像更新：旧镜像关闭加密保存，新镜像替换停止容器后恢复同一 profile 标记。
- 真实操作系统文件锁：不同进程不能共用数据目录，持有者退出后能再次取得所有权。
- 真实 ExecutionSupervisor：取消信号、排空期间阻止重装、重复通知共用排空、其他店铺继续操作，以及真实操作失败后保持待处理。
- 完整 Cloud 服务：关闭并重开真实持久目录，在 HTTP 启动前恢复卸载与客户数据请求，准备完成仍保持待下载状态，关闭后可重新取得数据库所有权。
- 隐私存储：客户资源 ID 大整数、实际请求导出、提供后清除、客户删除的双店隔离、全部账户/Library/任务/模板/快照清理、关闭重开、重复删除与重新安装版本保护。
- 停机备份恢复：原服务和数据库全部关闭后复制整个私有目录，再复制到新的恢复目录，实际读取另一店铺的 SQLite Campaign、PGlite 表格和加密快照；已删除店铺保持删除，重新安装后的重复事件仍安全。记录为 `onecrew_lite-app/.scratch/cloud-privacy-cold-backup.log`。
- 真实浏览器清理：`check-shop-manager.mjs` 删除已卸载店铺容器与全部加密代后，另一店铺继续返回真实 YouTube 搜索结果，记录为 `.scratch/privacy-browser-redaction-verified.log`。
- 本地存储输入仅用于验证存储合同，不冒充真实 Shopify 事件；有效令牌、商品与 Webhook 仍需实际开发应用和店铺验证。
