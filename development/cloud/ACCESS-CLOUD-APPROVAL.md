# Cloud Gmail 接入修改范围

状态：用户已授权本地实现 Gmail。Cloud 接口与页面已接入；公司补丁已在隔离目录准备并完成当前本地检查，等待用户审批后交 River 合并。公司原工作目录和 Lite 未修改，没有推送、创建 MR、合并或部署公司服务，目前没有发送邮件。

用户最新安排：先完成本地；等用户连接公司 Git 后，由本代理更新公司基准并验证补丁，再提交最终审批，之后由 River 合并。当前继续保留所有公司发布边界。

公司 GitLab SSH 连接超时，Access 基准为本机缓存 `onecrew@a2d3e64814384602847bbfc421b600b9565faaf4`，Sync 为 `onecrew@a1ced58d41c2c0920e8bbe1bf13bc8b0651468a5`。River 合并前须取得最新主分支、检查差异及迁移编号，并重跑受影响检查。

本地私有补丁和详细审批文件位于 `.scratch/company-gmail/`：`APPROVAL.md`、`access-cloud-gmail.patch`、`sync-linux-installations.patch` 和 `patch-sha256.txt`。这些包含公司代码，不上传公开 GitHub，跨电脑时须单独私下携带。发布流程位于 `docs/release/合并与部署流程.md`。

## onecrew-access：增加 Cloud 登录配对回调

Gmail 的 Google OAuth 回调已是 HTTPS `/integrations/gmail/callback`。需要扩展的是 OneCrew 登录配对：现有 `/pairing/authorize` 接收 `callback_port`，完成授权后固定返回本机 `127.0.0.1`。

- 在 `src/routes/pairing.ts`、`src/pairing/contracts.ts` 增加 `callback_url`，与原 `callback_port` 二选一；只接受配置中精确允许的 Cloud HTTPS 地址。
- 在 `src/pairing/crypto.ts` 中把回调类型和目标纳入原授权参数签名，在 `src/pairing/service.ts` 中按已验证类型完成跳转。
- `src/config/env.ts`、`src/types/bindings.ts` 增加可选 `CLOUD_PAIRING_CALLBACK_URL`，值为实际 Cloud origin 加 `/mail/pairing/callback`；批准时复查当前允许地址。
- 同步 `web/src/lib/access-api.ts`、配对确认页及合同检查。保留用户确认、PKCE S256、state、一次性授权码、有效期、Lite/Pro 产品字段及现有桌面回调。
- 复用 `src/integrations/providers/mail/` 中已有 Gmail 授权、令牌加密保存、刷新和撤销能力。

## onecrew-admin / Sync：允许登记 Linux 安装

原平台合同和数据库只接受 `macos/windows`，本地补丁已增加 Linux：

- 增加 `linux` 平台值，同步安装登记、读取和管理端筛选合同。
- 新增 `0009_linux_installations.sql`，更新安装表和登记操作表的平台约束。变更记录表以 RESTRICT 引用安装表，因此在同一迁移内复制、重建并恢复该表，保留原约束与索引；旧迁移不变。
- 同步 `src/repositories/admin-installations.ts`、`admin/src/lib/api.ts`、`admin/src/features/installations.tsx` 和迁移链检查。

## onecrew_cloud：绑定店铺、成员和邮箱，装配原邮件能力

Cloud 本地已完成以下接入，真实授权与发送仍依赖公司补丁发布：

- 在 Cloud HTTP 入口增加配对发起与完成回调，保存加密的一次性 PKCE 配对状态及已验证的店铺、成员归属。
- 在本仓库的 `identity/access-enrollment.ts` 和 `identity/legacy-access-credential.ts` 中支持 Linux 登记，复用原凭据验证和加密保存。
- 建立 Shopify 店铺/授权成员、Access 用户、安装凭据、邮箱连接之间的映射；成员使用独立邮件数据库，账号 ID 仍为真实 Access user ID。保留 `mail/gmail-access.ts` 原账号相等校验，店铺搜索数据库继续使用 Shopify tenant ID。
- 装配已有连接和短期令牌接口、GmailBulkRepository、GmailBulkWorker 与实际 Gmail 传输/回执，替换原状态和发送空接口。页面提供连接、收件人、主题正文、预览确认、发送状态、暂停/继续、取消和回执查询。发送协议沿用 [Gmail 官方发送接口](https://developers.google.com/workspace/gmail/api/guides/sending)。
- 本应用断开与卸载停用绑定并排空，店铺数据删除覆盖成员邮件数据库；Access 撤销授权后原验证链拒绝发送。断开本应用不撤销 Lite/Pro 共用的 Gmail 连接。

## 保留的权限和数据边界

- Gmail refresh token 继续由 Access 加密保存；Cloud 只取得所需短期 access token，令牌不进入网页或日志。
- 回调目标使用固定允许列表，邮箱连接始终绑定当前店铺及有权操作的成员。
- 发送前保留人工确认；发送结果未知时不自动重发，回执来自实际 Gmail 操作。
- Lite 保持只读。实施不购买付费服务；发布和生产配置另按工作区流程执行。

## 必要验证

Cloud Linux 类型检查及相关检查通过，无跳过，当前记录见[验收证据](../handoff/EVIDENCE.md)；Cloud 页面类型检查和构建、Access Worker/网页类型检查、Cloud 配对合同检查及 Access 页面构建、Sync Worker/管理端类型检查通过。九个 Sync 迁移在隔离本地 D1 执行成功，完整性检查正常，外键违规为零。

D1 使用空数据库，尚未验证公司存量数据迁移。真实桌面配对兼容、Cloud 批准与回调、Linux 远端登记、Shopify 成员归属、Gmail 授权/撤销、确认后真实发送与回执、重启与卸载集成验收仍待完成。实际邮箱测试需使用经用户授权的账号、明确收件人和发送内容。
