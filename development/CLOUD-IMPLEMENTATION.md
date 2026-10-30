# OneCrew Cloud实现说明

更新：2026-10-29；当前匹配v49。当前进度见[Goal](handoff/GOAL.md)，未完成项见[ISSUES](handoff/ISSUES.md)，上架准备见[Shopify材料](cloud/SHOPIFY-SUBMISSION.md)。原始方案与日期专题用于追溯，后续用户明确批准的范围优先。

## 结构与职责

| 目录／文件 | 当前职责 |
| --- | --- |
| `onecrew_lite-web/src/cloud/` | 独立网页与Shopify共用商品、平台账号、推荐表、Gmail批次和店主隐私处理界面 |
| `onecrew_lite-app/src/cloud/http.ts`、`web-assets.ts` | HTTP、静态资源、个人／Shopify入口与业务路由；提供公开支持页及隐私政策预览 |
| `src/cloud/account-service.ts`、`account-store.ts` | 复用OneCrew Access登录，PKCE／state及浏览器绑定；个人工作区持久化 |
| `src/shopify/client.ts`、`installation-store.ts` | 官方SDK、session token、成员商品权限；安装与加密会话；Webhook持久收件 |
| `src/cloud/campaign-service.ts`、`campaign-jobs.ts`、`campaign-planner.ts` | 商品／手动商品转现有Campaign，最多六个备用词／平台、每词最多二十条，目标十位后停止新工作；同工作区关键词复用 |
| `src/cloud/campaign-scoring.ts`、`src/discovery/` | 4B类别与作者身份判断，代码复制原文、核实粉丝和证据归属，结果进入Library；数值评分不在用户界面显示 |
| `src/cloud/discovery-reader.ts`、`docker-browser-client.ts`、`browser-worker.ts` | 复用OpenCLI平台能力；独立浏览器读取公开内容和作者资料 |
| `src/cloud/shop-browser-manager.ts`、`browser-snapshot-store.ts` | 所属工作区容器、远程登录窗口、加密profile快照与冷恢复 |
| `src/cloud/mail-service.ts`、`mail-revocation.ts`、`src/mail/gmail-bulk.ts` | OneCrew授权邮箱、草稿确认、1–100收件人逐封发送、回读；卸载仅撤销所属Cloud安装 |
| `src/shopify/privacy-service.ts`、`uninstall-processor.ts`、`src/cloud/shop-data.ts` | 隐私导出、客户请求处理、卸载及整店删除；不跨店删除数据 |

表中`src/`相对`onecrew_lite-app/`。包标识保留Lite名称，源码与数据属于独立onecrew_cloud目录；不得修改相邻Lite。

## 当前业务流程

个人从根域名登录OneCrew并手填商品；Shopify用户在后台完成安装与session token认证后选择商品或手填。选择YouTube、TikTok、Instagram及最低粉丝数，默认2000，模型生成或复用关键词；执行器搜索、读取作者和原文、去重、判断同类／直接配套与创作者身份。合格结果自动保存并补查缺少的公开联系方式，推荐表按粉丝数降序，用户可进入Gmail编辑、预览并确认发送。新任务和模板生成不设粉丝上限，旧任务保留原条件。

匹配固定使用免费Qwen3-4B Q4_K_M、Metal、8192上下文。关键词快速生成六个共享词；匹配以128 token限量推理，在一次结构化请求中输出原文物品、同类／零售配件／无关、身份和段落编号，代码复制真实原文；保留必要来源和粉丝审核。商品类别词用于证据校验，用途词用于扩搜；旧任务保留原关键词范围。同类竞品与配套可推荐，不要求品牌相同。固定规则前置；已校验关键词按实际输入、模型与规则身份在同工作区复用，新任务粉丝条件独立应用。当前实测见[商品词义与完整验收](cloud/SEARCH-MEANING-METRICS-2026-10-29.md)。

## 身份、存储与删除

Shopify仅请求`read_products`，使用October26 GraphQL API。商品请求用当前成员online token；`src/shopify/offline-sessions.ts`按需复用、刷新并加密保存离线令牌，真实失效时用当前商家身份重新交换，同店请求串行。自然到期、轮换和公网接口恢复见[验收记录](cloud/SHOPIFY-TOKEN-LIFECYCLE-2026-10-28.md)。个人身份不能借用店铺权限；任务、账号资料、模板、浏览器快照及邮件按工作区隔离。

卸载停用该店访问，清除offline session并撤销所属Cloud邮箱安装；任务和推荐暂留以支持重装。真正`shop/redact`处理该店浏览器／快照、账号证据库、Library、任务与关键词、模板、邮件绑定等；清除原始隐私请求和安装后，留下不含原始body或明文shop的去重凭据。客户请求可携带个人资料，须在隐私政策披露，不能称应用不处理任何个人数据。

## 部署与范围

主服务与免费模型运行于这台Mac，平台浏览器在Docker，固定域名`cloud.onecrewai.io`通过免费Tunnel连接；无商家桌面安装要求。运行见[统一启动说明](cloud/STARTUP.md)。现有冷备组件验证保留，完整生产恢复及容量仍待验收。

Gmail依赖公司Access／Sync／API已有授权与撤销接口，相关获批变更已由River合并并发布；后续公司代码或配置必须先审批。不购买服务，不恢复X、8B或Linux迁移，不提交上架。

导入来源：Lite `1ac72b654eaf823df6c14ce512e34c6c43ddd8f2`；GitHub仓库为https://github.com/yyq8548/onecrew_cloud.git。持久数据、密钥、模型和私有截图不随Git迁移。
