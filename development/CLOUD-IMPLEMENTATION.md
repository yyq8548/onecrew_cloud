# OneCrew Cloud 开发记录

## 当前优先事项

2026-10-25 Mac 与真实 Gmail：用户选择这台 Mac 作为当前和后续部署主机，不新增 Linux 服务器。Cloud 邮箱配对和登记已改为主进程实际平台，本机为 macOS；默认模型版本使用已验证的 4B Metal。通过独立 Cloud Mac 工作台完成真实 Access 登录、指定邮箱授权、预览、一封用户明确批准的自发自收邮件及 Gmail 内容回读，批次 completed、单封 sent。Mac 类型检查、17 项邮件相关检查和页面构建通过；本次没有新增公司源码修改或执行 Sync Linux 迁移。运行说明见 [Mac](cloud/MACOS.md)，证据见[实际回执摘要](handoff/evidence/macos-gmail-20261025/summary.json)。Shopify 成员绑定与远程 HTTPS 回调保持待验收。

2026-10-25 关键词与公司范围：已完成 50 个真实公开商品的固定输入测量，四个单平台和四平台组合各 10 份，免费 4B Metal 与 8,192 窗口保持不变。首次结构化输出 50/50 通过，中位数 2.465 秒、P95 6.913 秒、最大 7.960 秒，无重试，原条件与目标数量保留。该同品牌样本不替代人工关键词质量、评分质量和评分 P95。用户要求 CSP 暂不修改、先汇总公司全部改动，[统一清单](cloud/ACCESS-CLOUD-APPROVAL.md)已完成，未增加公司源码修改。证据见[关键词记录](handoff/evidence/keywords-50-20261025/summary.json)。

2026-10-25 Linux 历史产物：切换 Mac 前使用仓库完整 Dockerfile 构建镜像 `9174e7cd0184`，196 份相关文件哈希和实际 CLI 初始化对应当时源码。本次不重新构建 Linux 服务镜像；该记录不代表 Mac 平台和默认模型版本改动后的产物。保留上一版 `f18a613c2af1`，移除的更旧镜像及构建证据见[历史镜像记录](handoff/evidence/service-current-20261025/summary.json)。

2026-10-25 Gmail 接入：店铺成员配对、加密凭据、独立邮件数据库、预览确认、串行发送、暂停/继续、取消、回执与卸载清理已有实现。此前公司 Access/Sync 隔离草稿、类型、构建、合同和空库 D1 检查保留为历史记录。当前 Mac 本机授权和真实发送见页首，Sync Linux 草稿不再属于当前部署计划；Shopify 远程商家授权的 Access HTTPS/CSP 仍待批准，见 [Gmail 范围](cloud/ACCESS-CLOUD-APPROVAL.md)。公司没有推送、合并或部署。

2026-10-25 模板：已在独立数据副本，用 FreeSip 原模板对新的真实保温托特包完整执行关键词、YouTube 搜索、读取、4B 评分和 Library 发布。保存 60 条来源、15 位候选，匹配 1 位、排除 14 位，目标 10 位未达成；原条件、新商品快照、请求幂等、完整结果/Library/任务/新模板关闭重开验证通过。逐项核对原保存结果后确认，14 位排除候选均有已验证的粉丝低于 10,000 记录，数量为 27–9,750，商品评分为空，不能视为 14 次相关性错判。该轮从新任务开始正常结束，生产代码和评分规则未改，Shopify 身份与四平台真实账号仍未验收。

2026-10-25：用户批准精简输入并验证，当前 v16 使用同一免费 4B 和 8,192 窗口，完整材料留库。两个原超长请求降到 1,002、1,322 token 并通过原审核；护肤内容与防晒的宽泛关联仍有漏判。真实任务保存 60 条来源、20 位候选、5 位匹配、2 位待核验、13 位排除。修复关闭自动扩词设置被忽略的问题后，恢复原任务正常结束，未重新采集，Library、模板与完整结果关闭重开后一致。当前 Linux 类型检查和 50 项 Cloud 检查通过。默认目标 10 位未找满，完整上架目标未完成，线上环境暂缓。见[基础流程](cloud/BASIC-WORKFLOW.md)。

任务页继续使用已有接口显示平台连接中断、读取中断和未完成评分数量，避免任务结束但没有结果时缺少原因。使用两份实际保存的任务字段检查渲染，Cloud 网页类型检查与构建通过，模型配置保持原样。

## 来源与范围

- 云端仓库：https://github.com/yyq8548/onecrew_cloud.git。
- Lite 来源：https://github.com/yyq8548/onecrew_lite2.git。
- 固定导入提交：`1ac72b654eaf823df6c14ce512e34c6c43ddd8f2`。
- 使用 Git archive 导入该提交的受版本控制文件；没有复制 Lite 的 Git 历史、未提交文件、node_modules、账号数据和浏览器数据。
- 为便于复用，继承目录和包标识暂时保留 `onecrew_lite-*`，云端源代码和依赖均位于本仓库，不引用相邻 Lite 安装目录。
- 当前仓库是用户指定的独立开发仓库；推送、合并和生产部署另按实际交付状态与授权执行。

## 实施顺序

当前用户已批准的简化目标：商家只选择 Shopify 商品、平台和粉丝范围，默认总共寻找 10 位匹配商品的 KOL，点击开始即执行。Cloud 代码直接生成固定条件任务，模型用短请求生成搜索关键词并复用原商品匹配评分；移除自由文本需求规划及独立确认页面。模板保存平台、粉丝范围和目标数量，更换商品时重新生成关键词。Cloud 继续复用 Campaign、Library、证据、SQLite/PGlite 与店铺隔离；Gmail 复用原授权、发送确认及回执，公司后续源码修改先审批，再在独立目录实施验证，由 River 合并。简化流程已完成本地实现，平台会话清理补丁已通过浏览器组件验证。用户已批准用现有 M1 电脑的 Metal GPU 验证同一 4B 模型，Linux 云端配置继续保留。目前仅有用户这台电脑，不购买服务；真实模型、四平台与 Shopify 完整验收仍是上架条件。

1. 导入和验证现有代码；新增店铺独立运行时与服务器模型客户端。
2. Linux Chrome/Xvfb/OpenCLI/扩展运行环境，继承 YouTube、TikTok、Instagram、X 四平台读取。以用户最新修改的方案为准。
3. Shopify 安装、会话、店铺映射、商品与隐私 Webhook。
4. 内嵌工作台、远程平台登录、任务恢复和模板；Gmail 配对、预览确认发送及回执。
5. 真实平台、模型与店铺验收，准备审核材料。

不采购付费服务。方案调整和功能缩减先提交用户审批。用户最新明确要求仅使用免费 Qwen3-4B，不再测试 8B；8B 进程已停止，原权重保留。

## 验证边界

单元和契约检查验证真实业务对象、权限与状态；不以模拟接口响应声称模型、平台或 Shopify 集成已通过。完整 Linux 验收需要可运行的容器环境，模型验收需要实际模型服务，Shopify 验收需要实际开发应用凭据与开发店铺。以上未完成时保持待验收状态。

## 实施与验证记录

以下保留各阶段的实现和验证证据，当前生效范围与结果以页首及[基础流程](cloud/BASIC-WORKFLOW.md)为准。

- 固定版本源码与依赖已独立导入；保留原包标识和锁文件。
- 新增按店铺独立运行时、服务器模型合同及 Shopify 官方 SDK 客户端。
- `pnpm build:tables`、`pnpm check:contracts` 已通过。当前应用类型检查与 Shopify 网页构建通过；此前 51 项相关检查覆盖云端、进程独占锁、账号、Campaign 和 Library。本批 Campaign 改动的 13 项后端检查与 10 项网页合同检查通过，包含真实数据库、文件系统错误、HTTP 身份拒绝、任务重开、确认权限，以及大整数与原计划解析兼容。
- 浏览器 Linux 镜像构建通过；用户已批准受限 seccomp 调整，OpenCLI doctor 确认 daemon 和真实扩展已连接，未关闭 Chromium sandbox。
- Linux 生命周期已进入应用源码：复用目录独占锁、私有目录检查和适配器安装器，拥有并关闭 Chrome、daemon 与 Xvfb，检查固定版本及扩展就绪。两套独立环境的并行运行、重复启动拒绝、正常关闭、profile 重开与组件故障退出均已真实验证，见 [Linux 生命周期](cloud/browser/LINUX-LIFECYCLE.md)。
- 浏览器加密快照复用现有密钥和 AES-GCM 格式，以系统 tar 归档；真实保存并恢复约 149 MB profile，新容器重开后保留原扩展身份。已接入店铺调度：活动 profile 使用独立 tmpfs，冷启动后认证恢复，任务结束先关闭浏览器，再加密保存并停止容器。当前和上一代快照由 SQLite 指针管理。
- 容器内搜索 worker 已接通原 OpenCliReader，通过私有 Unix socket 接收四平台任务。真实验证 YouTube 搜索、重复任务复用、取消排空与取消后重开；无宿主端口映射。宿主调度已验证两个店铺分别返回两条真实结果，服务重开恢复标记，卸载停止本店铺且另一店铺继续搜索。
- 原资料读取已进入 worker 与宿主接口，固定白名单保留四平台资料、内容、语言等既有方法；原应用 JSON 编码与 lossless-json 保留大整数。真实验证 YouTube 频道资料和视频原始描述，后者 2911 字节，来源为 `ytInitialPlayerResponse.videoDetails.shortDescription`。首次运行出现未分类 worker 故障，后续运行通过；已补充不含消息正文的异常类型和源码行号，尚不能据此认定首次故障已解决。
- Discovery 已改用原 Reader 的公开业务接口，并加入云端依赖工厂。逻辑 profile 由本店铺上下文签发，worker 使用自己的真实扩展 profile；诊断副本共享同一读取队列。RPC 保留原 OpenCliError、退出码和已脱敏诊断，产品范围外的方法明确失败。真实运行原 DiscoverySearchExecutor 和 DiscoveryVideoExecutor，返回两条 YouTube 搜索结果，一份 3058 字节的真实视频描述写入 Campaign，调用计数为 2；真实无效输入错误也保留原类型。该验证没有调用模型或 Shopify。
- 通用公开页面读取保留来源授权回调，宿主在启动前及 RPC 前后检查授权，私有任务包含随机 grant，worker 检查当前任务、URL、取消状态和真实浏览器归属，再执行原公网地址与 DNS 检查。网页 `/api/read` 不接受该能力。`development/cloud/browser/check-public-page.mjs` 已使用原真实搜索任务保存的来源执行云端 `web read`，三次核对所属任务的版本、搜索结果和候选证据，实际返回 20,000 字节正文并按原上限标记截断，耗时约 10.9 秒；证据为 `.scratch/public-page-runtime.log`。该检查验证授权来源的浏览器读取链路；评分后由完整 Campaign 自动选择公开来源仍待模型验收。
- 浏览器 worker 镜像更新时，已停止的所属 tmpfs 容器可以替换为新镜像；活动旧镜像要求先完成恢复排空。真实验证旧镜像加密保存、新镜像重建及同一 profile 标记恢复。加密快照保留，未使用平台账号。
- 原 AccountDatabases 已接入店铺运行时，使用明确的 Shopify 店铺数据归属，保留 Access 邮箱要求；Campaign 最近列表与详情 API 已装配。真实 SQLite 验证同 ID 双店隔离、重启持久化、卸载关闭、初始化期间卸载后重开。
- 共享 PGlite 已装配到云端入口，使用原 tenant/base 生成方法及固定店铺归属，Library 列表、表格、创作者视图 API 已加入。原证据发布器支持没有邮箱的 Shopify 店铺身份；已完成身份解析的操作者不会在单连接写入事务中再次触发用户查询。真实验证双店隔离、重启保留、卸载拒绝访问，以及已有 YouTube/Instagram 证据记录的发布和重复发布，Access 路径仍通过相同回归。完整 KOL 搜索、评分和结果网页仍待实际任务验收。
- 远程连接复用 `openCreatorLoginPage` 与 noVNC。单次凭据有效九十秒，WebSocket 校验同源，最长会话十五分钟；不允许客户端选择主机或端口，关闭剪贴板和文件传输。真实打开 Instagram 页面并收到 x11vnc 数据流，验证凭据复用拒绝、外部来源拒绝、卸载撤销与加密保存。没有输入平台账号，不能据此声称真实登录通过。
- Shopify 网页构建入口已加入现有前端包，复用按钮、输入框、表格、弹窗与主题，提供商品选择、四平台登录与 KOL 搜索。App Bridge 每次请求提供会话令牌；HTML 使用官方 SDK 验证 Shopify 查询签名并设置店铺专属 frame-ancestors。实际构建产物、开源许可证、未签名页面拒绝和未授权 API 已用真实 HTTP 验证；真实内嵌界面尚待开发店铺。
- 简化 Campaign 入口已实现：商家选择商品、平台、粉丝上下限，目标总共 10 位 KOL。服务器读取真实商品快照，检查所属浏览器及平台能力，模型只生成每平台 1–3 条关键词；代码生成固定条件并直接调用原 DiscoveryRuntime 和 ExecutionSupervisor。网页提供进度、停止、已保存任务继续执行和条件查看，没有自由文本规划或独立确认步骤。关键词生成与自动执行共用一项持久任务，重复请求复用相同记录；重启仅标记中断，不自动重放。真实商品读取、自动执行及停止的完整网络验收仍需开发店铺。
- 商品相关性作为原 `criteria.requirements` 中的必需条件保存。粉丝范围通过但没有商品内容审核证据时保持 `pending`，由原评分、引用校验及审核回执判断是否匹配。生成条件到原筛选器的回归及原资格检查共 6 项通过，后端类型检查通过；同样 6 项在已有 Linux 镜像中只读挂入更新后的源文件和测试后通过。证据为 `onecrew_lite-app/.scratch/cloud-product-relevance-tests.log`、`.scratch/cloud-product-relevance-typecheck.log` 与 `.scratch/linux-product-relevance-check.log`。
- `development/cloud/check-campaign.mjs` 已适配必选商品、固定条件和 `semantic_unavailable` 错误；需传入已保存的真实商品快照，当前版本尚待运行。此前 `.scratch/campaign-full-failure-verified.log` 与 `.scratch/campaign-template-runtime-verified.log` 证明旧入口的真实浏览器检查、模型连接失败、重复请求、取消及持久化，不能代替简化入口的完整验收。
- 条件模板复用同一 `cloud.sqlite` 和原来源计划。保存时仅填写名称，服务器提取平台、粉丝上下限和目标数量；选择新商品后生成新关键词并直接执行。旧模板缺少完整范围时保留记录但不可用于新搜索。简化流程 11 项本地检查通过，覆盖固定输入、粉丝上下限和边界不确定性、真实 SQLite 模板保存、双店隔离、重复冲突、来源版本与授权及关闭重开；类型检查、网页构建通过。另有原保存回执相关回归 6 项通过，真实 Instagram 外部样本检查 1 项因缺少输入跳过。日志位于 `onecrew_lite-app/.scratch/cloud-simple-tests.log`、`cloud-simple-typecheck.log`、`cloud-simple-count-regression.log` 与根目录 `.scratch/cloud-simple-web-build.log`。这些证据不代表 Shopify、模型评分或四平台完整执行通过。
- 结果与证据页面已加入当前 Campaign，直接读取原候选、搜索来源、Library 推荐和审核材料。候选及来源沿用每页 100 条的 keyset 分页，推荐表格每页显示 25 条；缺少或过期的 Library 身份快照显示等待同步，原 SQLite 证据仍可查看。复用原候选卡片、条件判断、评分说明和纯文字证据展示，保留联系方式来源与归属状态。实际 PGlite/SQLite 检查验证双店隔离、版本变化、未准备证据、分页与网页合同；43 项原展示检查通过。新读取入口实际回读两条 YouTube 来源、一位候选和 2911 字节原始描述，没有增加平台调用，证据为 `.scratch/saved-results-readback-verified.log`。真实 Shopify 内嵌访问仍待开发店铺。
- 权限来源和验证记录见 [审批项](cloud/browser/SANDBOX-APPROVAL.md)。
- Qwen3-8B Q4_K_M 官方权重已按固定提交与 SHA256 核验，官方 llama.cpp CPU 容器已实际运行。现有模型客户端成功返回四平台结构化 JSON，约 13.3 秒；原 Campaign 完整规划超过五分钟并遇到 HTTP 等待超时，性能与质量门槛尚未通过。服务日志确认完整输入处理速度约 8.21 token/秒，249 秒仅处理 32%，超时发生在输出生成前；镜像架构匹配且没有内存耗尽记录。已修复模型超时错误分类，模型容器已停止。配置、证据与边界见 [免费模型验证](cloud/model/README.md)。
- 简化后的真实关键词请求已在同一模型和 CPU 配置验证：本地水瓶商品文字输入、YouTube 单平台，输入 158 token、输出 39 token，生成 3 条关键词耗时 26,236 毫秒；选择全部四个平台时输入 166 token、输出 156 token，生成 12 条关键词耗时 58,161 毫秒，平台集合校验通过。证据为 `.scratch/cloud-short-keywords.log` 与 `.scratch/cloud-four-platform-keywords.log`，脚本为 `development/cloud/model/check-keywords.mjs`。测试后模型容器已停止；这两次测量只验证关键词生成，完整商品评分、真实平台搜索与批量延迟质量门槛仍待验收。
- 用户批准的[短评分规则](cloud/SCORING-PROMPT-APPROVAL.md)已通过原评分器的可选参数接入，只有固定简化条件采用它。完整候选证据和引用保持原样，缓存键包含规则摘要，旧格式任务继续使用原规则。用户批准的[官方 4B 模型](cloud/model/MODEL-SIZE-APPROVAL.md)已核验并同步配置，8B 权重保留。四平台关键词约 32.8 秒返回；真实材料的原生粉丝估算为 544,500–545,500，高于测试上限 100,000，模型却判定符合，原审核拒绝且未写回评分。当前已按批准范围由代码合并粉丝条件；证据和验证状态见 [免费模型验证](cloud/model/README.md)。
- Shopify 真实令牌交换和四平台真实账号登录/搜索尚未完成，完整业务成功执行仍待验收。
- [粉丝条件职责调整](cloud/DETERMINISTIC-FOLLOWERS-APPROVAL.md)已按批准范围接入：复用 `discoveryScale`，在提交前结合模型的 KOL 和商品判断，保持原证据审核。真实响应回放正确排除超上限候选，简化任务的引用仅接受候选保存的编号；原纠正范围、重复编号和作者归属审核保持不变。v3 短规则对同一真实护肤材料与防晒商品约 228 秒返回中文理由和 85 分，对无关工业钻床约 234 秒返回证据不足，均通过原审核，未提交原任务。本机类型检查及 12 项相关检查通过。理由仍偏长，模型质量、批量性能和完整业务尚未通过；证据详见 [模型验证文档](cloud/model/README.md)，Linux 镜像验证范围以 [服务文档](cloud/SERVICE.md) 为准。
- 用户尚无 Shopify 开发应用与测试店铺，已明确先完成本地实现。
- 已提供 `development/cloud/shopify.app.toml.example` 待填写模板，包含嵌入式入口、`read_products`、托管安装及现有卸载/隐私 Webhook 路由。已用 TOML 库解析并核对本地 SDK 与 HTTP 路由；尚未执行 Shopify CLI 配置验证或远端部署，使用说明见 [服务文档](cloud/SERVICE.md)。
- 已按批准范围完成本机 Metal 验证：固定 llama.cpp b11804 和原 4B 权重，全部 37 层实际加载到 M1 GPU，完整证据和原审核保留。四平台关键词约 8.1 秒；相关商品、无关商品及粉丝超上限三项评分约 23.7–24.5 秒，前两项分别得到 85 分和证据不足，超上限候选由代码正确排除。该样本质量字段仍出现理由不足的 95 分，最高分判断与理由长度继续待修复；批量性能、人工质量和完整业务未通过。模型进程已停止，Linux 配置与原权重保留，详见 [Metal 验证](cloud/model/README.md)。
- 已按批准范围完成同一 Metal 环境的 8B 对比，复用现有权重与完整证据。四平台关键词约 16.2 秒；三项评分约 32.0–35.8 秒，相关和无关商品两项被原引用审核拒绝，超上限项由代码正确排除，但模型仍漏掉相关内容。本组没有显示质量改善，应用默认仍为 4B；模型已停止，详见 [8B 对比结果](cloud/model/README.md#8b-metal-对比结果)。
- 已按用户后续“适当降低评分标准”的要求接入 Cloud v12：一条真实内容与商品品类或明确使用场景相关即可支持初步入选，不要求实际使用效果、同一品牌、原创、合作经历或字幕。评分数值保留 95/85/70/40，含义按[当前规则](cloud/SCORING-PROMPT-APPROVAL.md#当前简化标准)。输出先选择证据，条件数量及编号范围绑定已保存任务；保留原审核，并增加真实模型多返回条件的回归样本。默认免费 4B Metal 的相关防晒、无关钻床、粉丝超限三个场景约 19–23 秒，分别为 95 分、相关性不足和代码排除，引用与条件审核通过。没有写回原任务，仍须批量质量、真实 Shopify 和四平台完整验收。
- 新增真实 YouTube 水杯内容样本：Prudent Reviews 与 BottlePro，原搜索和内容读取共四次调用。v12 基线对两位作者的水杯内容分别约 25.0、26.5 秒返回 95 分，通过引用审核，但误判视频中夹带的洗衣液赞助；这些记录仅对应 v12，当前有效实现和验证见下文 v15。完整材料及输出保留于 `.scratch/water-bottle-material-inspection.jsonl`、`.scratch/cloud-v12-prudent-water-bottle.log`、`.scratch/cloud-v12-bottlepro-water-bottle.log` 与 `.scratch/cloud-v12-prudent-incidental-ad.log`，没有写回评分或执行 Shopify 完整任务。
- 用户已批准[一次分类与代码评分](cloud/COMPACT-CLASSIFICATION-APPROVAL.md)、[关键词复用、段落编号和代码复制原文](cloud/QUOTED-REASON-APPROVAL.md)、[模型响应外层解析](cloud/MODEL-ENVELOPE-APPROVAL.md)及[合作或优惠摘录待核验规则](cloud/PROMOTIONAL-EXCERPT-APPROVAL.md)。当前源码为 paragraph classification v15：免费 4B 判断身份、关系并选择段落编号，代码复制原文、生成中文等级说明和原分数；命中两个批准表达的正向评分由代码置为待核验，超限候选提前排除。真实材料及保存响应回放、当前源码的 Linux 类型检查和 49 项 Cloud 检查通过；规则回放不调用模型。模型质量、批量 P95 与完整 Shopify 业务仍待验收。证据及限制见[当前模型验证](cloud/model/README.md#当前评分验证)。
- 当前 v15 已完成同一 4B Metal 的实时小样本验收：Prudent Reviews 水杯、BottlePro 水杯、赞助提及、防晒与无关工业商品五项均通过最终状态、原文及原审核检查，粉丝超限另验证为零模型调用。评分耗时 12.7–18.8 秒，每项一次调用、无纠正重试，原材料和原任务不变；广告仍被模型判为相关，但已由批准规则正确置为待核验。日志在 `.scratch/v15-live-20261024-a/`，测试模型已正常停止。本组仅三位独立作者，不能替代人工批量质量、P95 或完整 Campaign/Shopify 验收；应用源码未改动，复用已通过的 49 项 Linux 检查。
- 已准备[Shopify 提交材料草稿](cloud/SHOPIFY-SUBMISSION.md)，包含当前功能文案、对应实际中文按钮的英文审核步骤、截图与录屏范围、隐私说明的代码依据和剩余材料。未公开发布或提交；经营主体、有效联系地址、正式隐私政策、真实素材及审核凭据仍待补齐。
- Gmail 已按用户最新要求替换原空接口，装配原发送与回执模块。公司必要补丁在隔离本地目录准备，Lite 原目录保持只读；实际授权和发送仍须公司服务发布后验收。
- Shopify offline session 使用现有 Lite AES-GCM 封装加密保存，店铺分配独立 tenant/base，卸载时清除会话；真实 token exchange 尚未执行。
- 新增独立 Cloud CLI、HTTP 服务和持久目录初始化。API 从官方 SDK 验证后的店铺解析安装，商品请求使用当前成员 online token 和实际成员 scope，避免使用后台 token 提升成员权限。
- Webhook 在验签后加密收件、去重并持久保存；卸载与删除 offline session 在同一事务内完成。生命周期版本阻止卸载期间的旧令牌交换重新激活安装。
- 卸载处理器已接入现有账户上下文、任务准入和 ExecutionSupervisor；同步取消本店铺任务，等待真实排空后完成收件。排空期间阻止重装，失败保留待处理并停止服务；启动 HTTP 前恢复持久卸载收件。
- 三个隐私 Webhook 已接入原收件与串行队列，HTTP 启动前恢复待处理收件。`customers/data_request` 保存加密导出，内容包括请求携带的客户资料及当前没有 Shopify 客户/订单业务记录的说明；仅店铺所有者通过实际 online session 下载，网页收到文件后另行确认接收并清除导出中的个人资料。准备导出和提供导出分别记录，客户删除会清除本店匹配的请求资料，不以邮箱匹配删除其他来源的创作者证据。
- `shop/redact` 在停用和任务排空后删除本店浏览器容器、全部加密快照、账户目录、Library 实体表与元数据、Campaign 任务/模板、安装映射及会话。重复通知只保留带密钥摘要的最小记录和生命周期版本，旧安装请求无法恢复被删除的空间；重新安装分配新的 tenant/base。本批 34 项相关 Cloud 检查、应用类型检查、网页构建和相关 Library lint 通过。真实浏览器删除回归通过，包含服务重开、容器删除、全部快照清理与另一店铺继续搜索，记录为 `.scratch/privacy-browser-redaction-verified.log`。Library 实体表永久删除与关闭重开已有实际 PGlite 证据。
- 停机复制到新备份目录并恢复到另一个持久目录已实际通过，验证账户 SQLite、共享 PGlite、加密快照认证、已删除店铺保持删除和重装后的旧事件去重。证据为 `onecrew_lite-app/.scratch/cloud-privacy-cold-backup.log`，恢复步骤见 [Cloud HTTP 服务](cloud/SERVICE.md)。
- 隐私导出的真实店铺所有者下载、Shopify 事件订阅与投递仍待开发应用/店铺验收；生产备份设施配置、历史备份过期与后续删除处理、四平台真实账号断开与完整业务执行仍待完成。
- 平台断开补丁及[域 Cookie 清理补充](cloud/DOMAIN-COOKIE-CLEANUP-APPROVAL.md)均已获批准并完成本地实现。默认浏览器镜像 `764b647f7604` 已通过扩展类型检查、构建及完整真实存储清理检查：HttpOnly Cookie、localStorage、IndexedDB 与旧加密快照清除，其他平台 Instagram Cookie 保留，恢复后复核通过，未授权请求被拒绝。独立版本目录使旧快照使用新扩展，原残留 5 个 Cookie 的升级复测通过。组件验收未使用真实登录账号；证据见 [平台断开验收](cloud/PLATFORM-DISCONNECT-APPROVAL.md)。
- 启动方法、路由与验证范围见 [Cloud HTTP 服务](cloud/SERVICE.md)。
- 当前本地 Linux 验证镜像与完整构建记录见页首和 [服务文档](cloud/SERVICE.md#linux-本地验收)。v15 `f18a613c2af1` 保留为上一版，旧 v12 与旧增量基准已清理；历史源码层验证和日志继续保留于 [证据索引](handoff/EVIDENCE.md)。真实 Shopify、平台账号、批量质量和持续运行资源仍待完成。

## Linux/OpenCLI 实际验证

- 当前镜像使用 Node 26.7.0、OpenCLI 1.8.8、扩展 1.0.24、非 root Chromium/Xvfb，应用已批准的受限 seccomp 配置。
- 直接复用 `OpenCliAddons.install()` 的清单、锁和字节校验安装自有适配器。OpenCLI 从用户 home 发现命令，容器用户 home 已设为持久目录 `/data`，与安装位置一致。
- 验证容器包括 `onecrew-cloud-browser-four-platforms`、`onecrew-cloud-browser-lifecycle-a/b`、`onecrew-cloud-browser-snapshot-restored`、`onecrew-cloud-browser-worker-check`。均只用于本机测试，没有开放宿主端口；当前已停止，持久卷保留。
- 真实公开命令 `opencli onecrew-search-youtube search --limit 3 -f json -- skincare` 执行成功，返回三条视频结果，均带 channel_id。
- 其中一条实际结果：频道 `PENN.SMITH.SKINCARE`，视频链接 `https://www.youtube.com/watch?v=Pz2IEMQKtV8`。本记录证明搜索和频道 ID 提取，不证明资料、登录、邮件、评分或所有平台已通过。
- 新 Linux 生命周期入口再次运行原 YouTube 适配器，实际返回两条结果，其中 Doctorly 视频为 `https://www.youtube.com/watch?v=Y3EZR8Nse4w`，频道 ID 为 `UCHCZnC9akNA9pBP7aJGNKdg`。
- 上游全部命令仍随运行时存在；HTTP 搜索、连接和 worker 输入只允许 youtube、tiktok、instagram、twitter。
- 当前实际验证脚本包括 `check-shop-manager.mjs`、`check-remote-gateway.mjs`、`check-reads.mjs`、`check-discovery.mjs`、`check-image-upgrade.mjs`、`development/cloud/check-web.mjs` 和 `development/cloud/check-campaign.mjs`。店铺测试使用的 SDK Session 仅作为本地归属输入，不代表真实 Shopify 身份。
- 所有本批验证容器均已关闭；成功加密数据保留在受忽略的 `.scratch/shop-browser-manager-verified/` 和 `.scratch/remote-browser-gateway-confirmed/`，没有复制 Lite 账号。
- 四平台真实账号、完整 Campaign/Library、关键词生成与商品评分的批量性能及质量、Shopify 安装及隐私网络验收仍待完成。本地冷备份恢复已通过，生产备份配置与历史备份删除处理待部署环境确定。Gmail 本地接入与公司补丁检查见页首，真实发信尚未验收。
