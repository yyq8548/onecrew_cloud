# Cloud 平台会话清理审批

状态：用户已批准，原补丁及[域 Cookie 清理补充](DOMAIN-COOKIE-CLEANUP-APPROVAL.md)均已接入本地默认浏览器镜像，扩展类型检查、构建和真实浏览器清理检查通过。

## 已确认的限制

固定 OpenCLI 1.8.8 的扩展在 `extension/src/background.ts` 的 `handleCdp` 中维护明确的 CDP 白名单。它没有提供站点数据清理方法，实际验收已返回 `CDP method not permitted`。Page 现有 `getCookies` 可以复用，不能据此认为清理已通过。

## 请求批准的唯一改动

只在 OneCrew Cloud 浏览器镜像内，给原扩展增加[受限补丁](browser/opencli-session-cleanup.patch)：

- 仅接受 `adapter` 类型、名字精确为 `onecrew-cloud-session` 的所属会话。
- 仅允许 `Storage.clearDataForOrigin`，参数只能是 `origin` 与 `storageTypes: all`。
- `origin` 只接受默认端口的 HTTP/HTTPS 原点，域名限制为四个平台及已有登录所需的 Google、Facebook 域名与子域名。
- 不增加 Cookie 写入、原始 Cookie 读取、任意 CDP、任意主机、宿主文件或 Docker 权限。

应用调用原 Page API 和原浏览器隔离，商家先暂停任务或停止生成，再断开所选平台。清理后关闭 Chrome，保存清理后的 profile，清除当前之前的全部加密代与上一代指针；其他平台的当前站点数据保留。Google/Facebook 仅用于已有平台登录相关数据清理，不增加搜索来源。

Lite、Access、Sync 和本机用户 Chrome 均不修改。不购买服务。固定上游版本，保留许可与修改说明；重建扩展后仍需真实验收 Cookie/站点存储、其他平台保留、旧快照清除及拒绝未授权清理。

## 当前交付边界

Cloud 断开入口和快照历史清理已完成本地实现与浏览器组件验证，当前代码和镜像未用于生产。真实四平台登录与完整 SSO 域名范围仍需平台账号验收。

已验证普通会话拒绝清理、专用会话拒绝其他域名/非默认端口/额外参数/非 `all` 类型及全浏览器 Cookie 清理。请求路由已补齐 `/disconnect`，所属空白页使用原 `newTab()`。Cloud 启动复用原原子修复流程更新旧快照内的自有适配器；旧快照已实际恢复并运行到清理审核。原 Chromium 启动参数保留。

未修改上游的完整类型检查与补丁版本均存在相同的 8 项测试文件类型错误，记录为 `.scratch/opencli-unmodified-typecheck.log` 和 `.scratch/browser-cleanup-build-with-dependencies.log`。镜像使用单独配置检查实际运行代码，未修改上游测试，也不声称其完整类型检查通过。

Cookie 验收使用网站实际 Cookie 的摘要，localStorage/IndexedDB 使用明确标注的本地测试标记。最终镜像已验证普通重开保留数据、清理 HttpOnly Cookie 与站点存储、保留 Instagram Cookie、删除旧加密快照并在恢复后复核。证据为 `.scratch/platform-disconnect-domain-final.log`。旧快照升级后的清理也已通过，见 `.scratch/platform-disconnect-domain-path-upgrade.log`。这些检查没有登录真实平台账号。
