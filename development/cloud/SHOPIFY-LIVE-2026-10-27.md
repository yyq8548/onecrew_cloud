# Shopify 开发店铺完整流程验收

2026-10-27：开发店铺的实际安装、商品读取与更新、三平台搜索、10 位推荐、真实卸载通知和重新安装均已通过。任务耗时 407.811 秒，重装后原工作区、推荐依据和联系方式完全保留；三个平台分别实际恢复并检查为已登录，无需本人重新登录。结果表已在重装后的工作台打开，没有提交上架申请。

## 范围与完成条件

按用户授权创建开发应用和免费的测试店铺，在当前 Mac 验证真实安装、商品读取与更新、三平台搜索推荐、卸载和重新安装。只修改 onecrew_cloud，继续免费 4B；不购买服务、不提交上架、不修改公司仓库或 Lite，不发送邮件。

使用 context-mode 处理查询、日志和验证证据，使用 Stop That Shit 控制范围。优先复用现有内嵌服务、managed installation、token exchange、商品 Reader、Campaign、Library 和卸载队列；只修复实际流程中遇到的问题。

完成依据为真实 Shopify 会话与商品、有效签名的实际卸载 Webhook、三平台任务结果和重新安装后的状态。既有本机验收继续有效，不替代本轮真实 Shopify 结果。

## 已创建的资源

- 开发者组织：`243258009`。
- 开发应用：[OneCrew Cloud](https://dev.shopify.com/dashboard/243258009/apps/440808570881)，当前测试配置版本为 [dev-20261027-webhooks](https://dev.shopify.com/dashboard/243258009/apps/440808570881/versions/1184325337089)，配置当前 HTTPS origin、卸载通知与三个隐私通知。
- 测试店铺：[OneCrew Cloud Test](https://admin.shopify.com/store/onecrew-cloud-test)，dev 类型、Basic 功能预览，未生成系统示例数据。
- 测试商品：[Owala FreeSip®](https://admin.shopify.com/store/onecrew-cloud-test/products/15439346270441)，厂商 Owala，草稿状态。应用先读取到 FreeSip®，随后在 Shopify 保存带品牌的标题 Owala FreeSip®，刷新内嵌工作台后实际读到并选中更新后的商品。
- 真实应用配置为仓库根目录的 `shopify.app.toml`，仅申请 `read_products`。客户端加密密钥只保存在受忽略的私有环境文件中。
- 独立 Shopify 服务使用本机 8788，新临时 HTTPS origin 与服务环境同步更新；服务、HTTPS 和免费 4B 的实际健康检查均为 200。本机工作台和邮件服务保持独立。

临时域名在停止或重建隧道后失效，需要同时更新开发应用配置和服务 origin。这是开发验收入口，正式公开运行仍需单独准备稳定地址。

## 验证进度

| 步骤 | 当前状态 | 验收要求 |
| --- | --- | --- |
| 创建资源 | 已创建应用、dev 店铺和独立持久目录，服务、HTTPS 与 4B 已恢复 | dev 类型、最少配置权限与独立目录已确认 |
| 安装与 Webhook | 真实安装、App Bridge、token exchange 和离线会话保存通过；实际卸载事件已接收并完成处理 | 卸载及三个隐私订阅的开发配置有效；本轮实际投递验证为卸载事件 |
| 商品 | 真实商品读取、标题更新刷新，以及任务中保存的 Shopify 商品快照均通过 | 已核对实际商品 ID、标题、厂商、说明与采集时间 |
| 搜索推荐 | 任务 `1a154c45-ac76-475f-bf7f-cd2c843df1b5` 自行结束，407.811 秒，共 10 位；已核对原文、粉丝与界面结果表 | YouTube 4 位、TikTok 6 位；本轮 Instagram 有参与采集，未产生入选账号 |
| 联系方式 | 5 个已确认公开邮箱，1 个邮箱归属待核实，另 2 位有公开网站入口，2 位只有主页 | 待核实邮箱不能勾选发送；没有发送邮件 |
| 卸载与重装 | 用户批准后实际卸载，再从 Dev 页面重新安装，通过 | 卸载时离线会话为 0、无活动任务；重装后新安装有效、离线会话为 1，原工作区和十位结果完全一致 |
| 平台会话恢复 | 重装后逐一打开并保存检查，YouTube、TikTok、Instagram 均为已登录 | 恢复原加密资料，无需本人重新输入账号 |

真实 Shopify 店铺分配独立 tenant/base，现有本机账号的加密浏览器快照不能直接复制过去。测试店铺需由本人完成三平台登录；保存后按原机制加密恢复。卸载与店铺隐私删除按现有各自规则处理，不改变数据清理职责。

## 私有运行记录

本机配置、实际商品记录、日志和截图保存在受忽略的 `.scratch/shopify-live-20261027/`。独立运行数据位于其中的 `data/`，环境配置为 `runtime.env`。凭据、JWT、Webhook 原始正文和账号目录不进入公开文档或 Git。

## 恢复入口

新的临时 origin 已写入 `shopify.app.toml`、`runtime.env` 和实际开发应用版本。安装、商品更新与搜索使用已登录网页；CLI 使用用户本次批准的单应用服务账号发布通知配置，命令正常退出，Dev 页面确认当前版本有效。

已核对 Chrome 中的现有会话：开发后台和测试店铺当前账号均可继续使用，店铺账号为 `info@onecrewai.io`。安装目标固定为 OneCrew Cloud Test；用户已批准页面列出的商品与店主资料读取权限，实际安装成功。独立店铺的 YouTube、TikTok、Instagram 均显示已登录并加密保存。

用户已批准并创建 `OneCrew Cloud dev verification` 服务账号：仅 OneCrew Cloud 的应用部署与管理权限，有效期一个月，未授予开发商店管理权限。凭据保存在受忽略、权限 0600 的本机文件中。现有安装权限未增加，不修改公司服务或其他商店。

安装与商品更新证据为私有目录中的 `actual-install-state.json`、`post-install-dom.txt`、`product-sync-passed.txt` 和 `product-sync-passed.png`；登录与通知配置证据为 `shop-platforms-after-login.txt`、`webhook-deploy.log`、`webhook-version.txt` 和 `webhook-version.png`。任务已保存真实 Shopify 商品 ID、更新标题、厂商、说明及采集时间。

## 真实搜索结果

本轮商品为 Shopify 草稿 Owala FreeSip®，三个平台共同搜索，粉丝范围 10,000–1,000,000，目标共 10 位，按用户确认的不同频道分别计数。实际得到 10 个不同平台账号，均满足粉丝条件，已有审核引用均通过；逐项核对的原文包括实际水杯评测、使用与同类饮水产品内容，符合当前已批准的初筛标准。

任务、完整候选证据与界面行保存在 `final-results.json`，数量和联系方式核对为 `verification-summary.json`，界面为 `shop-results-completed.txt` 与 `shop-results-completed.png`。`before-uninstall.json` 保存原工作区、结果 ID 和摘要；重装后的十位界面行与原表逐字一致。

## 卸载与重装结果

用户批准后，Shopify 页面实际执行卸载。服务收到 API 版本 2026-10 的 `APP_UNINSTALLED`，事件 `0f87e545-9619-5039-916a-2bf90098544a` 已完成处理。安装变为未安装，离线会话清零，无活动任务；原候选和依据摘要保持一致。随后通过同一开发应用重新安装，实际权限保持不变，生成新的安装时间和离线会话，继续使用原 tenant/base。

新授权可读取 Owala FreeSip® 商品。原十位推荐的 ID、原始依据摘要、界面行和联系方式均与卸载前一致。重装后逐一实际打开 YouTube、TikTok、Instagram，分别保存检查为已登录，无需用户再次登录。

生命周期核对记录为 `after-uninstall-state.json` 和 `lifecycle-verification.json`；真实界面证据为 `uninstall-completed.png`、`reinstalled-products.txt`、`reinstalled-result-rows.json`、`reinstall-instagram-result.txt`、`platforms-after-reinstall.png` 和 `final-reinstalled-results.png`。最终结果表留在重新安装后的 Shopify 工作台中。本轮验证没有修改应用业务代码、Lite 或公司服务。

## 登录界面

已按用户要求完成[三平台登录界面优化](LOGIN-UI-2026-10-27.md)：启动前禁用保存，保存与检查有明确处理状态，主动关闭远程画面不再误报断开。三个平台在 Shopify 入口均完成真实保存与冷恢复检查。用户现已要求暂停后续工作，邮箱配对链接报错留待恢复后核对。
