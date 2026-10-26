# Cloud Gmail 接入修改范围

状态：待用户审批。当前邮件仅保留未启用接口；本文件明确拟修改范围，不代表已授权修改外部仓库。

## onecrew-access：增加 Cloud 登录配对回调

Gmail 的 Google OAuth 回调已是 HTTPS `/integrations/gmail/callback`。需要扩展的是 OneCrew 登录配对：现有 `/pairing/authorize` 接收 `callback_port`，完成授权后固定返回本机 `127.0.0.1`。

- 在 `src/routes/pairing.ts`、`src/pairing/contracts.ts` 增加 Cloud 专用回调类型，使用配置中精确允许的 Cloud HTTPS 地址。
- 在 `src/pairing/crypto.ts` 中把回调类型和目标纳入原授权参数签名，在 `src/pairing/service.ts` 中按已验证类型完成跳转。
- 同步配对测试和回调配置。保留用户确认、PKCE S256、state、一次性授权码、有效期及现有桌面回调。
- 复用 `src/integrations/providers/mail/` 中已有 Gmail 授权、令牌加密保存、刷新和撤销能力。

## onecrew-admin / Sync：允许登记 Linux 安装

当前 `src/contracts/installations.ts` 的平台合同只接受 `macos/windows`；数据库中的 `creator_sync_installations` 和 `creator_sync_enrollment_operations` 也有同样的 CHECK 限制。

- 增加 `linux` 平台值，同步安装登记、读取和管理端筛选合同。
- 新增数据库迁移，更新两张表的平台约束并保留现有安装、凭据和幂等记录；保留已执行的旧迁移。
- 同步 `admin/src/features/installations.tsx` 的平台选项和相关合同、迁移测试。

## onecrew_cloud：绑定店铺、成员和邮箱，装配原邮件能力

上述两处改动完成后，Cloud 仍需完成以下接入：

- 在 Cloud HTTP 入口增加配对发起与完成回调，保存一次性配对状态及受验证的店铺、成员归属。
- 在本仓库的 `identity/access-enrollment.ts` 和 `identity/legacy-access-credential.ts` 中支持 Linux 登记，复用原凭据验证和加密保存。
- 建立 Shopify 店铺/授权成员、Access 用户、安装凭据、邮箱连接之间的明确绑定。`cloud/shop-data.ts` 当前以 Shopify tenant ID 作为账户 ID，而 `mail/gmail-access.ts` 要求 Access user ID 与账户 ID 相等；应增加受验证的映射，继续校验每次操作的归属。
- 装配已有 `mail/access-mail-client.ts` 的连接和短期令牌接口、`mail/gmail-bulk.ts` 的发送确认和持久记录、`mail/gmail-transport.ts` 的发送与真实回执；替换当前邮件状态和发送空接口。
- 支持断开、授权撤销和卸载后的绑定停用与数据清理，复用当前生命周期和任务排空流程。

## 保留的权限和数据边界

- Gmail refresh token 继续由 Access 加密保存；Cloud 只取得所需短期 access token，令牌不进入网页或日志。
- 回调目标使用固定允许列表，邮箱连接始终绑定当前店铺及有权操作的成员。
- 发送前保留人工确认；发送结果未知时不自动重发，回执来自实际 Gmail 操作。
- Lite 保持只读。实施不购买付费服务；发布和生产配置另按工作区流程执行。

## 必要验证

验证桌面原配对兼容、Cloud HTTPS 配对及错误 state/过期/重放拒绝、Linux 安装登记和旧数据库迁移、跨店铺/成员访问拒绝、实际 Gmail 授权和撤销、确认后真实发送及回执、重启后的发送状态恢复与卸载清理。实际邮箱测试需使用经用户授权的账号和明确收件人。
