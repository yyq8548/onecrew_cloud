# OneCrew Cloud Shopify 上架材料

核对日期：2026-10-28。对应代码：Cloud v47；当前阶段为内部测试与上架准备，尚未提交审核。本文件是填写稿与缺项清单，未填写项不能视作已完成。

## 材料入口

| 材料 | 当前状态 |
| --- | --- |
| 本文：商店填写稿、官方要求对照、提交缺项 | 已更新 |
| [审核步骤与英文录屏脚本](SHOPIFY-REVIEW-GUIDE.md) | 已写好；专用账号、视频链接待补 |
| [隐私政策与数据处理草稿](SHOPIFY-PRIVACY-DRAFT.md) | `/privacy`预览可访问；主体、联系、保存期限与正式生效待确认 |
| [图片与录屏素材清单](SHOPIFY-MEDIA.md) | 已列拍摄内容；正式素材未完成 |
| [公司资料与账号清单](SHOPIFY-REQUIRED-INPUTS.md) | 缺少的主体、联系、保存安排和审核访问统一在此收集 |
| [兼容性与公开页面验收](SHOPIFY-COMPATIBILITY-2026-10-28.md) | 桌面、窄屏、匿名隔离及Chrome隐身＋阻止第三方Cookie的实际访问／恢复通过；有限成员、新用户仍待 |
| [同事测试说明](TEAM-TESTING.md) | 可用于当前内部测试 |
| [当前进度](../handoff/GOAL.md)、[验收证据](../handoff/EVIDENCE.md)、[未完成事项](../handoff/ISSUES.md) | 当前状态入口；日期专题记录保留为证据 |

## 商店填写稿

以下中文文案可在资料齐全后填写；后台字段和名称可用性以提交时实际页面为准。当前界面语言只有简体中文，英文审核说明不表示已支持英文界面。

| 字段 | 填写稿／当前值 |
| --- | --- |
| 应用名称 | OneCrew Cloud；与当前应用配置一致，商店名称可用性待核对 |
| 应用介绍 | 根据商品寻找相关创作者，查看内容依据和公开联系方式，并通过 Gmail 编辑和发送合作邮件。 |
| 应用详情 | 在 Shopify 后台选择商品，或手动填写商品说明，按平台和最低粉丝数寻找相关创作者。查看推荐所依据的公开内容、粉丝观察和联系方式，保存搜索结果。连接 Gmail 后，可选择联系人、编辑邮件、确认发送并查看发送记录。支持 YouTube、TikTok 和 Instagram；需要平台账号时由本人登录并保存会话。 |
| 功能一 | 根据店铺商品或手动说明搜索相关创作者 |
| 功能二 | 按平台和最低粉丝数筛选，查看原文依据 |
| 功能三 | 保存推荐结果，补查公开邮箱、网站和社交入口 |
| 功能四 | 连接 Gmail，编辑、确认并逐封发送合作邮件 |
| 功能五 | 保存搜索条件和平台会话，继续使用已有结果 |
| 集成候选 | YouTube、TikTok、Instagram、Gmail；属于浏览器访问或授权连接，不宣称平台官方合作 |
| 搜索词候选 | 创作者搜索、网红营销、合作邮件、商品推广、联系方式；提交时按后台允许的语言与选项核对 |
| 主语言／支持语言 | 简体中文 |
| 类别 | 普通嵌入式应用；在后台选择与创作者／影响者营销最相关的实际类别，尚未选定 |
| 价格栏目 | 免费；当前没有订阅或收费实现。价格只填价格栏目 |
| App URL | https://cloud.onecrewai.io/ |
| Shopify redirect | https://cloud.onecrewai.io/ ；按当前managed install与token exchange配置，非传统OAuth授权码回调 |
| 隐私政策 URL | `https://cloud.onecrewai.io/privacy`已实现为明确标注的预览；资料未确认、尚未生效，不能作为已完成的正式政策 |
| 支持邮箱、支持 URL | `https://cloud.onecrewai.io/support`已提供说明和常见问题；支持邮箱、负责人和服务时间待确认 |
| 开发者／经营主体 | 待提供法定名称、地址和对外联系信息 |
| API 联系人与紧急联系人 | 待负责人核对邮箱与电话，不能用私人验收邮箱代填 |
| 审核凭据、录屏 URL | 见审核说明；凭据仅在审核表单私下提供，禁止写进 Git |

本稿不宣传固定耗时、准确率、保证找满或营销收益。目标是寻找十位，实际数量取决于公开来源、粉丝条件及平台可用性。只有公开且可确认的邮箱才可用于邮件。

## 当前代码与数据流

| 层次 | 当前实现与代码入口 |
| --- | --- |
| 网页 | `onecrew_lite-web/src/cloud/`：个人入口、商品、平台账号、结果、邮件、店主隐私处理界面 |
| 公开说明 | `onecrew_lite-web/public/privacy.html`、`support.html`：免登录访问的隐私预览与支持说明；登录页和工作台均有入口 |
| HTTP 与身份 | `onecrew_lite-app/src/cloud/http.ts`、`account-service.ts`：个人 OneCrew 登录与 Shopify session token 分别验证，按工作区访问 |
| Shopify | `src/shopify/client.ts`、`installation-store.ts`：官方 SDK，GraphQL API October26，online 成员权限，expiring offline session 加密保存 |
| 搜索与匹配 | `src/cloud/campaign-service.ts`、`campaign-planner.ts`、`campaign-scoring.ts`：复用执行器与 Library，4B 一次请求判断品类和身份，代码复制引用；同工作区复用相同输入的关键词 |
| 平台浏览器 | `src/cloud/shop-browser-manager.ts`、`browser-worker.ts`：OpenCLI读取三平台；每个工作区独立容器资料，加密快照保存和恢复 |
| 联系与 Gmail | `src/cloud/mail-service.ts`、`src/mail/gmail-bulk.ts`：公开联系补查、OneCrew邮箱配对、批次确认、逐封发送和Gmail回读；批次支持1–100个收件人 |
| 隐私与卸载 | `src/shopify/privacy-service.ts`、`uninstall-processor.ts`、`src/cloud/shop-data.ts`：验签收件、撤销对应安装、处理客户请求和整店删除 |

上表中 `src/` 均相对 `onecrew_lite-app/`。服务目前运行在运营方这台Mac：主服务与4B Metal原生运行，平台浏览器在Docker内，免费固定Tunnel提供HTTPS。商家在网页使用，无须安装桌面应用或扩展。机器休眠、断网或进程退出会影响服务；持续可用和恢复仍待验收。

## 官方要求与当前证据

下列为官方通用要求在本项目的适用判断，不代表Shopify已批准具体实现。

| 核对项 | 当前证据与缺项 |
| --- | --- |
| 网页使用、安装与身份 | 店内安装、商品同步、卸载重装通过；商家无桌面安装步骤。Chrome隐身＋阻止第三方Cookie下的商品、表单、已有推荐／证据、邮箱连接、YouTube浏览器保存及刷新恢复通过。依据：[要求1.1.1、1.1.11–12与安装要求](https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements) |
| Expiring offline tokens | 已请求`expiring:true`，按需复用／刷新及终态失效重新交换已实现；自然到期、真实旧refresh失效、公网接口恢复与保存后商品读取通过，见[验收记录](SHOPIFY-TOKEN-LIFECYCLE-2026-10-28.md)。商品仍用成员online token。依据：[令牌迁移说明](https://shopify.dev/docs/apps/build/authentication-authorization/migrate-to-expiring-offline-access-tokens) |
| 最小权限与客户数据 | 仅`read_products`；不查询客户、订单业务数据，按PCD Level 0准备表单。隐私通知、店主和Gmail仍可能含个人资料，政策必须披露。依据：[Protected customer data](https://shopify.dev/docs/apps/launch/protected-customer-data) |
| 隐私通知 | 三个必需主题已配置，真实卸载收件与独立邮箱撤销通过；真实`shop/redact`最终删除仍待。当前权限不具备两个客户事件的投递条件，不把本地检查当实收。依据：[Privacy law compliance](https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance) |
| 审核访问 | 专用OneCrew、平台与Gmail审核访问尚未准备完整；须避免审核被OTP、2FA、SSO阻塞。不能删掉现有账号安全措施来代替审核方案。依据：[审核准备](https://shopify.dev/docs/apps/launch/shopify-app-store/best-practices#G.-App-review-preparation) |
| 文案、图片与语言 | 本稿按当前中文界面准备；正式图片和英文或英文字幕的实际操作录屏待制作。尺寸与字段限制见[官方最佳实践](https://shopify.dev/docs/apps/launch/shopify-app-store/best-practices)与[素材清单](SHOPIFY-MEDIA.md) |
| 可提交状态 | 仍有真实验收、主体资料、政策与素材缺项；未运行最终后台自动检查，未提交。依据：[提交指南](https://shopify.dev/docs/apps/launch/app-store-review/submit-app-for-review)、[审核前检查](https://shopify.dev/docs/apps/launch/app-store-review/pass-app-review) |

Shopify通用要求没有为OpenCLI这项具体实现给出许可结论。三平台访问条款、品牌使用、Google OAuth发布／验证状态须由负责人另行确认；现有登录成功不等于这些项目已通过。当前不新增权限或购买服务。

## 提交前缺项与责任

| 缺项 | 完成条件 | 责任／边界 |
| --- | --- | --- |
| 整店删除实收 | 第二店铺收到真实`shop/redact`，确认所属数据清理且原店铺不受影响 | Cloud；第二店铺保持卸载，最早2026-10-29 22:00:49洛杉矶时间之后等待，不保证届时送达 |
| 新用户与成员兼容 | 另一真实新用户从零完成及有限成员权限核对；隐身＋阻止第三方Cookie场景已通过 | 需本人真实账号操作，禁止伪造验收 |
| 登录界面最终页面 | 当前文案、导航、窄屏及隐身访问已核对，三平台原保存／冷恢复证据继续有效，本轮另验证YouTube浏览器保存 | [兼容性记录](SHOPIFY-COMPATIBILITY-2026-10-28.md) |
| 第三方与审核账号 | 专用测试账号能覆盖搜索、账号连接及邮箱收据，审核无需等待本人动态验证码；确认各平台与Google OAuth要求 | 主体负责人；如涉及公司Access/Sync/API源码或配置，先审批 |
| 主体与公开政策 | 补齐主体、联系人、期限和所在地，确认政策生效并补齐支持联系 | 页面已实现，缺少事实与承诺统一见[资料清单](SHOPIFY-REQUIRED-INPUTS.md) |
| 素材 | 标准图标、真实去敏截图、英文解说或字幕录屏及有效链接 | 依据素材清单；私人测试截图仅为内部证据 |
| 持续运行 | Mac运行、并发容量及备份恢复的最终可用安排 | 复用现有设备，不采购；保留已有冷备组件检查，尚无完整生产恢复验收 |
| 最终后台核对 | distribution资格、名称、权限、联系人、listing、自动检查与审核说明全部齐全 | 仅用户明确授权后才进入提交操作；本轮不提交 |

已完成与证据明细统一见[当前进度](../handoff/GOAL.md)，未完成项不以材料草稿替代实际验收。

## 要提交或填写的文件

| 文件／内容 | 当前入口 | 最终使用方式／状态 |
| --- | --- | --- |
| 应用配置 | 根目录`shopify.app.toml` | 核对最终应用版本、URL与三项隐私订阅，保留`read_products` |
| 商店文案与联系资料 | 本文填写稿 | 填入review／listing表单；类别和主体资料尚待确认 |
| 隐私政策 | `onecrew_lite-web/public/privacy.html`与[正文草稿](SHOPIFY-PRIVACY-DRAFT.md) | 正式HTTPS URL；当前只是预览 |
| 支持页与邮箱 | `onecrew_lite-web/public/support.html` | 支持URL已可访问；联系渠道待确认 |
| 英文审核说明 | [SHOPIFY-REVIEW-GUIDE.md](SHOPIFY-REVIEW-GUIDE.md) | 填入私有审核说明，当前UI为中文 |
| 审核凭据 | [一次清单](SHOPIFY-REQUIRED-INPUTS.md) | 仅通过Shopify私有测试字段交付，不写入Git |
| 标准图标 | [SHOPIFY-MEDIA.md](SHOPIFY-MEDIA.md) | 1200×1200 PNG／JPEG；品牌权利与正式导出待确认 |
| 桌面截图 | 同上 | 3–6张1600×900不同真实功能画面；专用演示资料就绪后拍摄 |
| 实际完整录屏 | 审核说明中的英文脚本 | 英文解说或字幕、可访问的视频链接；最终视频尚未录制 |
| 内部验收记录 | [进度](../handoff/GOAL.md)、[证据](../handoff/EVIDENCE.md)、[问题](../handoff/ISSUES.md) | 仅供内部核对，不向listing上传私人日志或会话 |

## 上架流程

1. 按[一次清单](SHOPIFY-REQUIRED-INPUTS.md)补齐公司资料、审核访问、组织注册和第三方条件。核对注册费用／豁免，本轮不付款、不接受新协议。
2. 完成新用户、有限权限成员的实际验收；等待第二店铺真实`shop/redact`，核对删除和原店保留。复用仍有效的核心功能与Chrome隐身／阻止第三方Cookie证据。
3. 确认并发布正式政策，补齐支持渠道。保存期限必须与实际清理能力一致，需补实现时先完成验证；核对Mac持续运行、容量和备份恢复安排。
4. 使用获准公开的真实演示身份制作图标、截图和录屏，填齐英文审核步骤和私有凭据。
5. 在Dev Dashboard核对App Store注册和public distribution资格、目标应用、名称、语言、URL、权限和API联系人。分发方式不随意切换；开发店不购买套餐。
6. 完成review页面的配置、listing、数据声明、审核访问和自动检查。当前商品权限按无客户／订单业务数据如实说明，保留三个隐私主题；检查失败先修复。
7. 资料和检查齐全后交用户最终审批，得到明确授权才提交。审核反馈涉及公司Git或配置时继续先审批。本轮不提交、不付款、不合并公司代码。

字段、尺寸和限制以实际提交时[官方最佳实践](https://shopify.dev/docs/apps/launch/shopify-app-store/best-practices)及[提交页面](https://shopify.dev/docs/apps/launch/app-store-review/submit-app-for-review)为准。另见[审核前检查](https://shopify.dev/docs/apps/launch/app-store-review/pass-app-review)、[分发方式](https://shopify.dev/docs/apps/launch/distribution)、[注册费用](https://shopify.dev/docs/apps/launch/distribution/revenue-share)。

## 公司Git与配置

Access的Cloud配对／固定回调、Sync的Cloud独立撤销、API的对应路由已由River合并并发布，目前没有新增且已确认必需的公司源码修改。公共页面在onecrew_cloud内实现，不改DNS、Tunnel路由或公司服务配置。

Google OAuth状态、实际范围与验证要求仍待负责人确认。若后续确需改公司OAuth品牌／政策URL／scopes、Access／Sync／API、DNS或运行配置，先列具体差异、影响及验证方式取得审批，再执行。
