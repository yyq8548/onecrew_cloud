# Shopify离线令牌生命周期与真实验收

日期：2026-10-28。仅修改onecrew_cloud，未改公司Git、权限、Gmail或Shopify上架配置，未提交审核。

## 实现

- `onecrew_lite-app/src/shopify/client.ts`复用官方SDK的`auth.refreshToken`。交换和刷新返回值统一核对店铺、offline类型、商品scope、访问期限及refresh字段，再加密保存。
- `src/shopify/offline-sessions.ts`复用有效会话；到期前60秒以内或已经到期时刷新。同店并发请求共用一次处理，避免刷新与重新交换相互作废。
- Shopify明确返回401且`error=invalid_request`时，旧refresh token不可继续使用；有当前店铺身份则重新交换，没有则明确要求重新授权。网络、限流或其他刷新失败返回503，保留旧会话，不用重新交换掩盖失败。
- `src/cloud/http.ts`安装入口保留成员online商品权限检查、异步后的安装生命周期检查，再调用上述逻辑。商品请求仍使用成员online token，不用offline token提升权限。
- 不增加定时器、后台轮询、刷新HTTP端点或数据库表。当前业务没有后台Shopify API读取，按需维护会话即可；内部无商家身份的调用遇到不可恢复刷新时明确失败。

表中`src/`相对`onecrew_lite-app/`。官方依据：[令牌交换与刷新](https://shopify.dev/docs/apps/build/authentication-authorization/implement-token-exchange)、[轮换规则](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens#how-refresh-token-rotation-works)、[公开应用迁移要求](https://shopify.dev/docs/apps/build/authentication-authorization/migrate-to-expiring-offline-access-tokens)。

## 真实验收

使用原测试店铺`onecrew-cloud-test.myshopify.com`，保留第二隐私测试店卸载状态。未改系统时间、未伪造token或Shopify响应。

| 场景 | 实际结果 |
| --- | --- |
| 自然到期 | 原访问令牌到期时间2026-10-28 07:46:36 UTC，检查时已自然过期，refresh token仍在期限内 |
| 无活跃商家身份的刷新 | 直接运行真实服务实现及SDK，成功取得并加密保存新令牌对；GraphQL商品读取成功 |
| 并发与有效期复用 | 两次同店并发调用共用同一Promise；有效会话再次调用未改变refresh token |
| 轮换与旧令牌失效 | 使用新refresh token再次真实轮换，旧refresh token被Shopify实际拒绝；客户端判为需要重新授权 |
| 无商家身份时明确失败 | 真实旧凭据在隔离数据库副本中运行，返回`shopify.reauthorization_required`，不重试为成功 |
| 当前商家身份恢复 | 在原测试店回放该真实旧会话后，从Shopify当前页面取得真实短时身份，调用实际公网安装接口：200；商品接口：200，返回一件真实商品 |
| 恢复后的保存 | 新访问期限为2026-10-28 22:36:52 UTC，refresh期限为2027-01-26 21:36:52 UTC；仍只有`read_products` |
| 持久化 | 关闭并重开存储后，用保存的刷新结果实际读取商品成功；服务正常重启 |
| 数据保留 | 工作区标识不变；安装2项、快照2项、任务9项、模板0项、邮箱绑定5项，验证前后数量一致；第二店铺无offline session且保持卸载 |

真实接口恢复使用当前页面的ID token通过生产HTTP处理路径验证，不把本地函数检查当店铺接口验收。本轮浏览器工具重新导航后Shopify内嵌文档加载挂起；未把该页面标为新的端到端页面通过，也未将其误记为令牌刷新失败。最新店内界面核对仍在原待办中。

没有等待90天制造refresh token自然到期；本轮验证的是自然到期的access token及真实被轮换废弃的refresh token。未来时间、网络503／限流等未发生场景不记作真实通过。

私有证据目录：`.scratch/offline-token-20261028/`。包括`refresh-result.json`、`install-recovery.json`、真实旧会话的加密数据库副本、类型与网页构建日志。临时ID token文件验证后删除，不提交任何凭据。

## 最低粉丝数简化

按用户要求删除最高粉丝数输入，新搜索默认只有最低条件。内部沿用现有数字范围合同，以`Number.MAX_SAFE_INTEGER`代表无可触及上限，不增加新筛选机制；用户界面与任务说明不展示这个内部数字。旧任务及已有API显式范围继续兼容；从模板生成的新任务取消旧上限。

使用已保存的真实商品、关键词和原计划生成新计划，确认最低值10000、无上限、六个关键词保留、原任务1000000上限未被改写。网页实际只出现一个最低粉丝数输入，类型与Cloud网页构建通过，设计检查无新增问题。本轮未额外启动搜索或模型调用。

商品说明继续用于生成搜索词和判断商品用途，写清商品是什么、做什么即可；品牌辅助识别官方账号，商品链接保留来源，两项选填。
