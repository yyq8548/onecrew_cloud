# 公司 Gmail 改动统一清单

2026-10-25。用户要求 CSP 暂不修改，先汇总全部必要改动后统一审阅。本轮只读核对公司代码，未增加任何公司源码修改，也未推送、创建 MR、合并、配置生产变量或部署。

已获批并完成验证的本地范围是 Access 11 份文件、Sync 6 份文件。CSP 补充尚未实施，涉及其中已有的 `src/routes/pairing.ts` 和新增范围 `src/security/access-boundary.ts`；全部实施后的公司源码清单共 **18 份不同文件**。配置与生产数据库操作另列，不包含在原本地授权中。

本轮再次只读核对远端 `onecrew`，基准未变化：Access `91c4f9826a5f6736c43275a8a8ff765c36a5483a`，Sync `d7f70460e176dc94bef3a60370e3f2493e7940b4`。

## onecrew-access：12 份文件

| 文件 | 修改内容 | 当前状态 |
| --- | --- | --- |
| `src/pairing/contracts.ts`、`src/routes/pairing.ts` | `callback_url` 与原 `callback_port` 二选一；仅接受配置中完整一致的 HTTPS Cloud 回调；保留最新安装来源登记。 | 基础改动已本地完成 |
| `src/pairing/crypto.ts`、`src/pairing/service.ts` | 完整回调地址参与原签名；批准时复查允许地址；原 PKCE、state、一次性 code、有效期及桌面回调保留。 | 已本地完成 |
| `src/config/env.ts`、`src/types/bindings.ts` | 增加可选 `CLOUD_PAIRING_CALLBACK_URL` 及格式检查，保留同事新增的发布变量。 | 已本地完成 |
| `web/src/lib/access-api.ts`、`web/src/features/pairing/pairing-authorization-page.tsx` | 同步输入合同，确认页显示 Cloud 回调地址。 | 已本地完成 |
| `test/pairing.test.ts`、`test/cloud-pairing-contract.test.ts`、`vitest.unit.config.mts` | 同步两种回调输入，核对真实参数签名与合同。 | 已本地完成并检查 |
| `src/security/access-boundary.ts`、已有的 `src/routes/pairing.ts` | 仅给配对确认页的 CSP `form-action` 追加已校验 Cloud 回调的 origin；原授权仍精确核对完整 URL，其他页面及 CSP 指令保留。 | 用户暂不修改，待统一审阅 |

确认页仍通过 HTML 表单提交，服务器以 303 跳转；原 CSP 只允许自身和本机目标。表单重定向可能被浏览器阻断，见 [MDN 原始说明](https://github.com/mdn/content/blob/main/files/en-us/web/http/reference/headers/content-security-policy/form-action/index.md?plain=1)。CSP 补充尚未写入公司代码，真实浏览器授权跳转尚未验收。

## onecrew-admin / Sync：6 份文件

| 文件 | 修改内容 | 当前状态 |
| --- | --- | --- |
| `src/contracts/installations.ts` | 安装登记接受 `linux`，保留现有产品字段和公共回读合同。 | 已本地完成 |
| `src/repositories/admin-installations.ts`、`admin/src/lib/api.ts` | 安装记录的平台类型接受 Linux。 | 已本地完成 |
| `admin/src/features/installations.tsx` | 在最新安装管理界面显示 Linux 标签，保留产品字段和同事界面改动。 | 已本地完成 |
| `migrations/0011_linux_installations.sql` | 更新两张表的平台约束；明确列名复制，保留 `product`、`system_info_json`、外键、唯一约束和索引；保存并恢复引用安装表的变更记录。旧迁移不变。 | 已本地完成，仅空库验证 |
| `test/schema.test.ts` | 在最新迁移链中追加 0011。 | 已本地完成 |

## 配置、迁移与复用边界

- Access 后续需要设置 `CLOUD_PAIRING_CALLBACK_URL`，值为真实 Cloud HTTPS origin 加 `/mail/pairing/callback`，须与 Cloud 的 `SHOPIFY_APPLICATION_URL` 一致。实际域名尚未确定，本轮未修改生产配置。
- Sync 后续需要执行 0011。当前只验证了新库 D1 和独立空 SQLite 十到十一升级；存量数据库迁移、生产执行与部署必须另行审批。
- Gmail 的 Google 回调继续使用 Access 原 `/integrations/gmail/callback`；沿用现有 Google 权限、令牌加密、刷新、撤销及短期 token 接口。Cloud 从服务器调用这些接口，不需要扩大公司浏览器 CORS。
- 配对页原登录过程在同一页面保留查询参数，无需另外放宽通用登录 `returnTo`。原设备限额及产品枚举保留，Cloud 配对当前沿用 `onecrew_lite` 产品值。
- Cloud 中的店铺成员绑定、独立邮件数据库、预览确认、发送、暂停/继续、取消、回执和卸载清理已经接入。refresh token 留在 Access，Cloud 保留加密安装凭据及实际 Access 用户归属。Lite 原目录保持只读，不购买服务。

## 已有检查与剩余验收

Access worker/web 类型、WebCrypto 合同和页面构建通过；Sync runtime types、worker/admin 类型及管理端构建通过。实际本地 D1 分别应用 22/11 个迁移，Sync 空库升级后的列、外键和索引一致、完整性正常。实际 Worker 五项匿名入口检查通过；没有伪造用户或服务响应。见[验证摘要](../handoff/evidence/company-local-20261025/summary.json)和[十七份文件哈希](../handoff/evidence/company-local-20261025/source-sha256.txt)。

CSP 修改与检查、存量数据迁移、真实 Cloud/桌面配对、Linux 远端登记、Shopify 成员身份、Gmail 授权/撤销及确认后的真实发送回执仍未验收。实际发送需明确账号、收件人、内容及用户授权。

公司源码、补丁及详细交付在私有 `.scratch/company-gmail/CURRENT-DELIVERY.md`，CSP 分析见同目录 `CSP-CLOUD-APPROVAL.md`。当前两份新 patch 只含已经批准的本地范围，**不含 CSP 补充**；旧 patch 不可直接应用。公司代码和补丁不上传公开 GitHub，跨电脑须私下携带。用户审阅后再决定统一批准范围，由 River 按 [合并与部署流程](../../docs/release/合并与部署流程.md) 合并。
