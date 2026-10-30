# 公司 GitLab 修改审批清单

2026-10-26。按用户批准的“保留原逻辑，只增加 Cloud”范围，Access HTTPS/CSP 和独立 Sync Cloud 撤销入口已经 River 合并到 `onecrew`。已只读获取公司最新主分支，确认 [Access !30](https://git.digifinex.org/onecrew/onecrew-access/-/merge_requests/30)、[Sync !7](https://git.digifinex.org/onecrew/onecrew-admin/-/merge_requests/7) 的完整源码树与原验证版本相同，并重新通过 23 项真实 Worker 检查。原 Sync 撤销服务保持原样，公司迁移为零。本轮没有修改公司源码或执行生产部署，见[合并核对](COMPANY-MERGED-VALIDATION.md)与[本地验证](COMPANY-LOCAL-VALIDATION.md)。下表是原开发基准及交付范围。

当前 Mac 部署需要区分两个入口：`pnpm cloud:mail:local` 复用桌面 `callback_port` 本机配对，已完成真实 Gmail 授权、单封发送和内容回读；`pnpm cloud:serve` 的 Shopify 邮件入口使用 HTTPS `callback_url`，即使服务器是 Mac，也仍需 Access HTTPS 配对和 CSP 适配。现有本机 Gmail 证据未覆盖 Shopify 成员邮箱绑定。

| 公司仓库                   | 最新核对基准                                     | 本地分支            |
| ---------------------- | ------------------------------------------ | --------------- |
| `onecrew-access`       | `d7ab1b51997a15b23ce7b89c62a9b185715dce96` | `onecerw_cloud` |
| `onecrew-admin` / Sync | `d7f70460e176dc94bef3a60370e3f2493e7940b4` | `onecerw_cloud` |

分支名按用户指定保留为 `onecerw_cloud`。两仓工作目录为私有 `.scratch/company-gmail/access-cloud` 和 `sync-cloud`；已推送 Access `71b49ca96173c7ad128e1cf935b871d7ce8d7046`、Sync `0e80e44f41b12c311075a20972ab9c24ea5d161d`。原 `access-current`、`sync-current` 目录及暂存草稿保持原样。最新 Access 发布改动保留；Sync Linux 六文件和 `0011` 不属于当前 Mac 计划，不提交、不安排生产迁移。

## onecrew-access：12 份文件

以下是远程 HTTPS 网页授权所需的 12 文件范围，现已适配到上述最新基准；本机 Gmail 早前实测使用原本机回调，没有使用这些公司补丁。

| 文件                                                                                    | 修改内容                                                                             | 当前状态                    |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------- |
| `src/pairing/contracts.ts`、`src/routes/pairing.ts`                                    | `callback_url` 与原 `callback_port` 二选一；仅接受配置中完整一致的 HTTPS Cloud 回调；保留最新安装来源登记。     | 基础改动已本地完成               |
| `src/pairing/crypto.ts`、`src/pairing/service.ts`                                      | 完整回调地址参与原签名；批准时复查允许地址；原 PKCE、state、一次性 code、有效期及桌面回调保留。                          | 已本地完成                   |
| `src/config/env.ts`、`src/types/bindings.ts`                                           | 增加可选 `CLOUD_PAIRING_CALLBACK_URL` 及格式检查，保留同事新增的发布变量。                             | 已本地完成                   |
| `web/src/lib/access-api.ts`、`web/src/features/pairing/pairing-authorization-page.tsx` | 同步输入合同，确认页显示 Cloud 回调地址。                                                         | 已本地完成                   |
| `test/pairing.test.ts`、`test/cloud-pairing-contract.test.ts`、`vitest.unit.config.mts` | 同步两种回调输入，核对真实参数签名与合同。                                                            | 已本地完成并检查                |
| `src/security/access-boundary.ts`、已有的 `src/routes/pairing.ts`                         | 仅给配对确认页的 CSP `form-action` 追加已校验 Cloud 回调的 origin；原授权仍精确核对完整 URL，其他页面及 CSP 指令保留。 | 已本地实施，真实 Worker 页面头检查通过 |

确认页通过 HTML 表单提交，服务器以 303 跳转。仅合法 Cloud 配对页的 CSP 增加目标 origin，其他页面与非法参数不扩大许可。真实浏览器 HTTPS 接收端跳转尚未验收。

## onecrew-admin / Sync：3 份文件，增加 Cloud 独立撤销入口

公司现有服务已支持 macOS，不需要平台类型或数据库迁移。本轮发现实际生命周期缺口：Cloud 每次配对生成新安装 ID，断开和卸载只清理本地绑定，重复绑定会累积公司设备记录，可能触及 Access 每用户 20 个未撤销设备的限额。

现有 `POST /installations/:installationId/revoke` 接受安装 Bearer、revision 和幂等键，但只撤销 Sync 凭据。Access 设备管理 HTTP 接口要求浏览器登录会话，安装凭据不能直接使用。管理端已通过 `DesktopDeviceLifecycle.revokeAccessDevice` 内部 RPC 完成双方撤销，可复用该能力。

新增 `POST /installations/:installationId/cloud-revoke`，先复用原 Sync 撤销，再调用已有 Access 生命周期 RPC。原 `/revoke` 继续使用原服务，Lite、Pro 无须修改调用方式。

| 文件                                              | 修改内容                                                                                         | 当前状态        |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------- |
| `src/services/cloud-installation-revocation.ts` | 新增 Cloud 撤销服务，复用原身份、revision 和幂等校验；用安装记录中的用户、设备、配对 ID 调用现有 Access 撤销。原请求重放继续确认 Access 已完成撤销。 | 类型与真实账号联调通过 |
| `src/routes/installations.ts`                   | 增加 `/cloud-revoke`；两入口复用同一请求校验和响应处理，原 `/revoke` 仍调用原服务。                                      | 两接口分别验证通过   |
| `src/ingress.ts`                                | 将新路径加入原机器接口入口规则，沿用原域名和安装凭据要求。                                                                | 未授权请求返回 401 |

`src/services/installations.ts` 与公司基准完全一致，现有测试文件保持原样。真实账号检查已确认：Lite、Pro 的原接口在 Access 数据库不可用时仍返回 200，Access 设备及名额保持原行为；Cloud 新接口在同一故障下返回 503，恢复后使用原凭据、revision 和幂等键完成撤销并释放名额。

新入口使用既有安装凭据，未新增公司数据库字段、迁移或 Access HTTP 接口。只有显式调用 `/cloud-revoke` 才执行额外清理；它没有新增独立 Cloud 产品身份。不会删除公司用户或全局撤销共享 Gmail 连接。

Cloud 配套修改已留在 `onecrew_cloud`：断开、重新绑定和卸载接入新接口；本地 SQLite 增加加密的待撤销记录，保留原凭据、revision 和同一幂等键，成功后清除。未完成的配对也保留恢复信息。启动时恢复待处理记录，卸载继续使用现有持久队列，没有增加重试定时器。

## 配置、迁移与复用边界

- Access 后续需要设置 `CLOUD_PAIRING_CALLBACK_URL`，值为真实 Cloud HTTPS origin 加 `/mail/pairing/callback`，须与 Cloud 的 `SHOPIFY_APPLICATION_URL` 一致。实际域名尚未确定，本轮未修改生产配置。
- 当前 Mac 使用 Sync 已有 macOS 登记，不执行 0011，不修改生产数据库。原 Linux 空库 D1/SQLite 记录只作为历史证据。
- Gmail 的 Google 回调继续使用 Access 原 `/integrations/gmail/callback`；沿用现有 Google 权限、令牌加密、刷新、撤销及短期 token 接口。Cloud 从服务器调用这些接口，不需要扩大公司浏览器 CORS。
- 配对页原登录过程在同一页面保留查询参数，无需另外放宽通用登录 `returnTo`。原设备限额及产品枚举保留，Cloud 配对当前沿用 `onecrew_lite` 产品值。
- Cloud 中的店铺成员绑定、独立邮件数据库、预览确认、发送、暂停/继续、取消、回执和上述设备撤销已接入。refresh token 留在 Access，Cloud 保留加密安装凭据及实际 Access 用户归属，公司无需新增 Shopify 用户表。Lite 原目录保持只读，不购买服务。

## 无需公司改动与可选独立产品功能

- 四平台搜索、浏览器会话、4B 评分、段落引用、品牌同名和私信下单待核验、Library 与任务界面均留在 `onecrew_cloud`，无需修改公司 Pro、Lite 或服务端搜索评分代码。
- Shopify Cloud 主服务没有装配公司动态表同步、自动更新或下载统计。本机 Gmail 工作台继承了原动态表同步模块，仍按原授权与队列运行，不能声称所有 Cloud 入口都不访问 Sync。
- 当前配对沿用 `product=onecrew_lite`、显示 OneCrew Cloud。独立公司产品标识、产品统计、独立设备额度和计费不属于当前功能必需项，本次不加入。
- 如果以后明确需要 `onecrew_cloud` 产品分类，涉及 Access `src/pairing/contracts.ts`；Sync `src/contracts/installations.ts`、`src/repositories/enrollments.ts`、`src/repositories/admin-installations.ts`、`admin/src/lib/api.ts`、`admin/src/lib/utils.ts` 及相关检查，并需新增迁移扩展产品约束，不能只修改类型或改写已有 `0010`。Cloud 同步传新产品值。产品标签本身不提供店铺隔离或独立额度。
- Linux 登记、Cloud 客户端安装包、下载与更新统计当前均不需要。

## 检查与剩余验收

当前基准的类型、构建、域名边界和合同检查通过；本轮真实双 Worker 的 23 项边界检查及本人账号 Cloud/Lite/Pro 三种配对、登记、撤销检查通过。Cloud 实际客户端完成断开失败、加密记录重开、原请求恢复和卸载清理检查，详见[本地验证记录](COMPANY-LOCAL-VALIDATION.md)。

本机 Mac 的真实 Gmail 授权、用户批准的一封自发自收邮件和内容回读已有通过证据，见 [Mac 运行](MACOS.md)。本轮没有新发邮件。完整浏览器 HTTPS 回跳、真实 Shopify 成员身份和卸载 webhook 联调仍需测试店铺及可访问的 HTTPS 地址。

**当前公司源码：Access 12 文件、Sync 3 文件；公司数据库迁移为 0。** Cloud 的配套修改仅在 `onecrew_cloud`。两仓 MR 已创建，未启用自动合并。River 审核之后，合并、生产配置与部署按[合并与部署流程](../../docs/release/合并与部署流程.md)另行执行。

公司源码、旧补丁及目录状态见私有 `.scratch/company-gmail/CURRENT-DELIVERY.md`。旧基准补丁不能直接当作本次交付；公司代码和补丁不上传 Cloud GitHub。本说明本轮也未上传。
