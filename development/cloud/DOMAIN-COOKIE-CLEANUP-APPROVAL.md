# Cloud 域 Cookie 清理补充审批

状态：用户已批准；补丁已接入并通过真实浏览器验证，本地默认镜像为 `onecrew-cloud-browser:worker`（`764b647f7604`）。

指定会话通过 `Storage.clearDataForOrigin` 清理站点存储，再通过已有 Cookie 权限删除同域 Cookie，包含 HttpOnly；保留原剩余 Cookie 审核。

补充实现在同一受限 `Storage.clearDataForOrigin` 请求完成后，使用扩展已有的 `chrome.cookies` 权限，删除该原点主机及其子域内的 Cookie。

- 仍仅接受 `adapter` / `onecrew-cloud-session` 会话，以及先前批准的固定平台、Google、Facebook 域名。
- 不新增 CDP 方法、扩展 manifest 权限、任意主机输入或 Cookie 值输入；不提供设置 Cookie 的能力。
- 按浏览器实际返回的名称、域名、路径、storeId 和 partitionKey 删除；范围不符或删除失败直接报错。
- 只修改 Cloud 镜像中的扩展。Lite、Access、Sync 保持不变，不购买服务。

具体补丁：[opencli-domain-cookie-cleanup.patch](browser/opencli-domain-cookie-cleanup.patch)，在已批准的 `opencli-session-cleanup.patch` 之后应用。Cloud 扩展版本为 `1.0.24.1`，使用 `/opt/opencli-source/extension-cloud-1` 独立目录加载，确保旧快照恢复后使用新扩展；不改变平台浏览器资料或 manifest 权限。

最终镜像的真实检查通过：实际 HttpOnly Cookie、localStorage、IndexedDB 清除，其他平台 Instagram Cookie 摘要保持一致，全部旧加密代和上一代指针删除，恢复后再次检查通过，越权清理请求被拒绝。证据为 `.scratch/platform-disconnect-domain-final.log`。原失败快照升级后成功清除 5 个 Cookie，证据为 `.scratch/platform-disconnect-domain-path-upgrade.log`。构建与扩展类型检查通过，见 `.scratch/browser-domain-cleanup-versioned-build.log` 和 `.scratch/browser-domain-cleanup-upgrade-build.log`。这验证浏览器清理组件；四平台真实账号登录与完整业务仍需单独验收。
