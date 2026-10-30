# Gmail 配对链接修复与验收

2026-10-27（America/Los_Angeles）。三项获批配置已完成，Access !32 已由 River 合并并从合并提交发布。真实 Shopify 成员已完成 OneCrew 配对回跳，复用已有 Gmail 授权；测试发件邮箱可用，Cloud 服务重启后仍可读取。用户另行批准了实际设备连接，配对修复阶段未发信；后续获批的一封自发自收及 Gmail 回读也已通过，见 [Shopify 邮件界面验收](SHOPIFY-GMAIL-SEND-2026-10-27.md)。

## 修复前确认的原因

1. 公司 Cloudflare 账户 `Dev@onecrewai.io's Account`（`2954c7c193dcf822c7aaf911153c7e91`）中，修复前生产 Worker `access` 的 22 项运行变量没有 `CLOUD_PAIRING_CALLBACK_URL`。发布前版本为 `de66c004`，承接 100% 流量。
2. 核对时的公司主分支 `36cb47d` 已包含 Cloud 配对功能。`src/routes/pairing.ts:63` 要求请求中的 HTTPS 回调与该配置完整一致；缺少配置时，HTTPS 回调请求被拒绝为 `invalid_pairing_request`。生产前端已支持 Cloud，并将查询参数原样传给此接口；前端通用错误文案会显示“链接无效或过期”。
3. Cloud 原临时地址 `lips-poet-invitation-announces.trycloudflare.com` 已无法解析，原隧道持续报告 `Unauthorized: Tunnel not found`。这会阻断后续回跳；旧失效进程已停止。本机 Cloud 的 8788 服务仍返回健康状态 200。

原错误发生在 OneCrew 配对入口，未进入 Google/Gmail 授权。临时域名失效和 Access 缺少允许回调是两个独立问题，本次已一起修复。

## 已批准的最小修改

| 范围 | 具体修改 | 目的 |
| --- | --- | --- |
| 公司 Cloudflare 域名与 Tunnel | 在现有 `onecrewai.io` 下使用 `cloud.onecrewai.io`，新增 `onecrew-cloud-mac` 固定 Tunnel，仅转发到当前 Mac 的 `http://127.0.0.1:8788` | 保持 Cloud 与回调地址固定，复用现有域名和免费 Tunnel |
| 公司 Access 配置 | `onecrew-access/wrangler.toml` 的 `[vars]` 增加下述一项；生产 Worker 设置同一变量 | 允许现有 Cloud 配对和相应 CSP 回跳，并使后续发布保留配置 |
| onecrew_cloud 与 Shopify 开发应用 | 将本机 `SHOPIFY_APPLICATION_URL`、开发应用 URL、重定向和通知地址同步到固定域名 | 三处使用同一服务地址 |

Access 的配置增量只有：

```toml
CLOUD_PAIRING_CALLBACK_URL = "https://cloud.onecrewai.io/mail/pairing/callback"
```

公司配置增量已提交到 `onecerw_cloud`，通过 [Access !32](https://git.digifinex.org/onecrew/onecrew-access/-/merge_requests/32) 由 River 合并。唯一公司源码差异为上述一行变量；Google 授权、Gmail 能力和 Sync 继续使用已有实现，无数据库迁移。

本次使用现有 Mac、已有域名和 [Cloudflare Tunnel](https://developers.cloudflare.com/tunnel/)，不购买域名、服务器或付费服务。Tunnel 只发布现有 Cloud 服务，不增加本机其他入口；凭据留在受忽略目录。

## 已完成的发布与验收

| 项目 | 实际结果 |
| --- | --- |
| 固定入口 | `https://cloud.onecrewai.io/healthz` 返回 200；官方 cloudflared 2026.10.5 连接 `onecrew-cloud-mac`，仅路由到 `http://127.0.0.1:8788`，其他 hostname 返回 404 |
| Tunnel | `d7f41e3d-352c-4804-8d75-b2a1dcd6f281`，公司账户 `2954c7c193dcf822c7aaf911153c7e91`；凭据只在本机忽略目录 |
| 公司源码 | 任务 QB-3448；MR 提交 `f0f880221f9dc2181aba48730adf1c4020709bc6`；River 合并提交 `9be2a36c9662aee263faa544a0fa37ba73936c45`，目标主分支 `onecrew` |
| Access 发布 | 从干净的合并提交目录执行 `node development/deploy.mjs`，使用 `onecrew` profile 并明确公司 account ID；正式入口的迁移完整性检查、构建和发布通过；新 Worker 版本 `fdefcd98-5bc5-483f-9ae5-4bd63d6c1d0c` |
| 配置核对 | 部署前后实际版本数据逐项比较：只增加固定回调，其余绑定及 script runtime 一致；原发布变量值保留，Access `/api/health` 返回 200 |
| Shopify 开发配置 | `dev-20261027-fixed-callback`，版本 `1184409714689`；应用 URL 和 redirect URL 使用固定域名，Webhook 继续使用原相对路径；没有提交上架 |
| 实际工作台 | `onecrew-cloud-test.myshopify.com` 内嵌页面恢复，原十位推荐和联系方式保留；切换地址后从店铺导航进入应用完成验收 |
| 配对 | 同一真实店铺成员从邮件页生成新链接；Access 正常展示固定回调确认页；用户批准实际设备连接后，Cloud 显示“授权完成” |
| Gmail | 测试 OneCrew 账号下的两个已有 Gmail 连接均可用，默认发件邮箱正确；没有重复申请 Google 权限 |
| 恢复 | 停止并重启本次 Cloud 8788 进程，保留原持久目录和密钥；同一成员刷新邮箱后两邮箱仍可用，界面无错误；配对恢复验证阶段未发信 |

验证还包括 `smol-toml` 实际解析配置并与基准比较、Cloud 配对合同检查 1 项、`check:domains` 及 `git diff --check`，全部通过。合并树与已验证 MR 树一致，复用这些检查；正式发布从合并提交独立构建。

发布前版本为 `de66c004-247a-4cee-9304-a5c634fb2c2d`，承接 100% 流量；部署和变量基线已保留。需要恢复时按工作区发布流程使用该旧版本，Cloud 账号数据及已有结果保留；删除固定回调将再次阻止 Cloud 配对。

## 当前边界与证据

旧 Access 草稿保持原样；本次在 `.scratch/company-gmail/access-fixed-callback` 实施单变量 MR，在 `access-fixed-callback-release` 固定合并提交发布。没有修改 Lite、Sync 或公司业务代码，没有购买服务。Mac 及现有 Cloud 进程、固定 Tunnel 需要保持运行；重启沿用原受忽略的 `runtime.env`、数据目录和 `tunnel.token`。

私有证据位于 `.scratch/mail-pairing-20261027/`：部署前后版本元数据、`access-release.log`、`shopify-deploy.log`、`tunnel-public.json`、`fixed-tunnel.log`、`pairing-ready.png`、`pairing-current.txt`、`gmail-restored-ui.json`、`gmail-connected.png`。原始诊断证据也保留；密钥、配对参数和隧道 token 不提交 Git，生产 secret 值未读取。
