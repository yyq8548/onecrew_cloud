# Cloud Gmail 接入修改范围

状态：Cloud 接口与页面已接入。公司网络已恢复，本轮只读核对了最新主分支；原本地草稿尚未按最新代码适配。用户要求任何后续公司源码修改都先审批，包括本地修改；当前不推送、创建 MR、合并或部署公司服务，没有发送邮件。

用户最新安排：先完成本地功能，允许查看和核对公司 Git；公司代码改动前提交具体范围审批，获批后在独立目录实施验证，之后由 River 合并。

已成功 fetch：Access 最新 `onecrew@91c4f9826a5f6736c43275a8a8ff765c36a5483a`，Sync 最新 `onecrew@d7f70460e176dc94bef3a60370e3f2493e7940b4`。旧草稿分别基于 `a2d3e64` 和 `a1ced58`，不能当作最新适配结果。Sync 旧迁移在最新 schema 上实际报列数错误，须经审批后重新适配。

当前详细审批入口位于 `.scratch/company-gmail/LATEST-REVIEW.md`。原 `APPROVAL.md` 与两份 patch 仅保留为旧基准记录，不能直接应用；公司代码不上传公开 GitHub，跨电脑时须私下携带。发布流程位于 `docs/release/合并与部署流程.md`。

## onecrew-access：增加 Cloud 登录配对回调

Gmail 的 Google OAuth 回调已是 HTTPS `/integrations/gmail/callback`。需要扩展的是 OneCrew 登录配对：现有 `/pairing/authorize` 接收 `callback_port`，完成授权后固定返回本机 `127.0.0.1`。

- 在 `src/routes/pairing.ts`、`src/pairing/contracts.ts` 增加 `callback_url`，与原 `callback_port` 二选一；只接受配置中精确允许的 Cloud HTTPS 地址。
- 在 `src/pairing/crypto.ts` 中把回调类型和目标纳入原授权参数签名，在 `src/pairing/service.ts` 中按已验证类型完成跳转。
- `src/config/env.ts`、`src/types/bindings.ts` 增加可选 `CLOUD_PAIRING_CALLBACK_URL`，值为实际 Cloud origin 加 `/mail/pairing/callback`；批准时复查当前允许地址。
- 同步 `web/src/lib/access-api.ts`、配对确认页及合同检查。保留用户确认、PKCE S256、state、一次性授权码、有效期、Lite/Pro 产品字段及现有桌面回调。
- 复用 `src/integrations/providers/mail/` 中已有 Gmail 授权、令牌加密保存、刷新和撤销能力。

## onecrew-admin / Sync：允许登记 Linux 安装

最新公司平台合同和数据库仍只接受 `macos/windows`，拟获批后增加 Linux：

- 增加 `linux` 平台值，同步安装登记、读取和管理端筛选合同。
- 最新已有 `0009_admin_user_operations.sql` 和 `0010_installation_product.sql`。拟新增 `0011_linux_installations.sql`，更新平台约束，明确列名复制并保留 `product`、`system_info_json` 及原约束和索引；引用安装表的变更记录在同一迁移中完整保留、重建和恢复，旧迁移不变。
- 在最新 `src/repositories/admin-installations.ts`、`admin/src/lib/api.ts` 同步平台类型，在最新界面的 `platformLabel` 增加 Linux 标签；保留同事新增的产品字段和用户管理界面，同步迁移链检查。

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

Cloud Linux 类型检查、相关检查、页面类型检查和构建通过，见[验收证据](../handoff/EVIDENCE.md)。公司旧基准的类型、合同、构建与九个迁移的新库 D1 检查已有历史记录；最新公司适配尚未实施或验证。

本轮将 Sync 最新十个真实迁移应用到独立空 Node SQLite，验证旧 Linux 草稿实际报错 `table creator_sync_installations_linux has 8 columns but 9 values were supplied`；诊断事务已回滚，完整性和外键检查正常。这证明旧草稿需要适配，不代表最新 D1 或存量数据迁移通过。Access 新增配对完成后的安装来源登记和发布变量，也必须在适配时保留。现有公共安装回读和 Gmail 合同可继续复用，Cloud 不需要放宽原严格解析。

D1 使用空数据库，尚未验证公司存量数据迁移。真实桌面配对兼容、Cloud 批准与回调、Linux 远端登记、Shopify 成员归属、Gmail 授权/撤销、确认后真实发送与回执、重启与卸载集成验收仍待完成。实际邮箱测试需使用经用户授权的账号、明确收件人和发送内容。
