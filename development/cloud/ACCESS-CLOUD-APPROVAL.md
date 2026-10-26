# Cloud Gmail 接入修改范围

状态：Cloud 接口与页面已接入。用户已批准按最新主分支进行隔离本地适配与验证，Access 十一个文件、Sync 六个文件已完成该批准范围，类型检查、构建、合同、本地迁移与五项匿名入口检查通过。确认页的 Cloud 表单跳转仍有 CSP 缺口，补充修改尚待审批。公司服务没有推送、MR、合并或部署，没有发送邮件。

用户最新安排：先完成本地功能，允许查看和核对公司 Git；公司代码改动前提交具体范围审批，获批后在独立目录实施验证，之后由 River 合并。

本次适配基准：Access `onecrew@91c4f9826a5f6736c43275a8a8ff765c36a5483a`，Sync `onecrew@d7f70460e176dc94bef3a60370e3f2493e7940b4`。保留了最新安装来源登记、发布变量、产品列和管理端改动。Sync 使用新的 `0011_linux_installations.sql`，旧草稿不可直接应用。

当前私有交付入口位于 `.scratch/company-gmail/CURRENT-DELIVERY.md`，批准范围见 `LATEST-REVIEW.md`，待审批补充见 `CSP-CLOUD-APPROVAL.md`。新补丁为 `access-current-cloud-gmail.patch`、`sync-current-linux-installations.patch`，摘要位于 `current-patch-sha256.txt`。旧 `APPROVAL.md` 与旧 patch 仅保留为历史记录。公司源码和补丁不上传公开 GitHub，跨电脑时须私下携带；公共仓库只保存验证摘要和文件哈希。发布流程位于 `docs/release/合并与部署流程.md`。

## onecrew-access：增加 Cloud 登录配对回调

Gmail 的 Google OAuth 回调已是 HTTPS `/integrations/gmail/callback`。需要扩展的是 OneCrew 登录配对：现有 `/pairing/authorize` 接收 `callback_port`，完成授权后固定返回本机 `127.0.0.1`。

- 在 `src/routes/pairing.ts`、`src/pairing/contracts.ts` 增加 `callback_url`，与原 `callback_port` 二选一；只接受配置中精确允许的 Cloud HTTPS 地址。
- 在 `src/pairing/crypto.ts` 中把回调类型和目标纳入原授权参数签名，在 `src/pairing/service.ts` 中按已验证类型完成跳转。
- `src/config/env.ts`、`src/types/bindings.ts` 增加可选 `CLOUD_PAIRING_CALLBACK_URL`，值为实际 Cloud origin 加 `/mail/pairing/callback`；批准时复查当前允许地址。
- 同步 `web/src/lib/access-api.ts`、配对确认页及合同检查。保留用户确认、PKCE S256、state、一次性授权码、有效期、Lite/Pro 产品字段及现有桌面回调。
- 复用 `src/integrations/providers/mail/` 中已有 Gmail 授权、令牌加密保存、刷新和撤销能力。

## onecrew-admin / Sync：允许登记 Linux 安装

本地适配已在公司原有 `macos/windows` 合同和数据库基础上增加 Linux：

- 增加 `linux` 平台值，同步安装登记、读取和管理端筛选合同。
- 最新已有 `0009_admin_user_operations.sql` 和 `0010_installation_product.sql`。已新增 `0011_linux_installations.sql`，更新平台约束，明确列名复制并保留 `product`、`system_info_json` 及原约束和索引；引用安装表的变更记录在同一迁移中保存、重建和恢复，旧迁移不变。
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

Cloud Linux 类型检查、相关检查、页面类型检查和构建通过，见[验收证据](../handoff/EVIDENCE.md)。最新公司本地适配的[验证摘要](../handoff/evidence/company-local-20261025/summary.json)与[源码哈希](../handoff/evidence/company-local-20261025/source-sha256.txt)已保存。

Access worker/web 类型检查、真实 WebCrypto 合同及页面构建通过；Sync runtime types、worker/admin 类型检查及管理端构建通过。本地 D1 已应用 Access 全部 22 个迁移、Sync 全部 11 个迁移；Sync 原生 SQLite 十到十一升级前后的列、外键、索引及空库记录一致，实际 D1 完整性正常，外键违规为零。使用实际 Access 和 Sync Worker，经原生 service binding 验证五项匿名入口：合法 Cloud 和桌面输入要求登录，未允许地址、两种回调同时出现及 HTTP 回调均被拒绝。该检查没有伪造用户或服务响应。

确认页仍使用原 HTML 表单，而 CSP 的 `form-action` 只允许自身和本机回调，尚未加入 Cloud。表单重定向存在浏览器差异，见 [MDN 原始说明](https://github.com/mdn/content/blob/main/files/en-us/web/http/reference/headers/content-security-policy/form-action/index.md?plain=1)。申请仅在配对确认页追加配置中的 Cloud origin，涉及 `src/security/access-boundary.ts` 和 `src/routes/pairing.ts`，公司源码尚未实施该补充。

D1 使用空数据库，尚未验证公司存量数据迁移。真实桌面配对兼容、Cloud 批准与回调、Linux 远端登记、Shopify 成员归属、Gmail 授权/撤销、确认后真实发送与回执、重启与卸载集成验收仍待完成。实际邮箱测试需使用经用户授权的账号、明确收件人和发送内容。
