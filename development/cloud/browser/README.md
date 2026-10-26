# 店铺浏览器运行环境

在 onecrew_cloud 根目录构建：

```sh
docker build -f development/cloud/browser/Dockerfile -t onecrew-cloud-browser:worker .
```

该镜像保留 OpenCLI 1.8.8、同标签源码中的扩展与有界面 Chromium/Xvfb，非 root 用户运行。Linux 入口复用原目录独占锁、私有目录校验、适配器安装器和 OpenCLI 进程执行器；确认 daemon 与真实扩展连接后才执行读取。宿主按店铺分配容器；活动 `/data` 使用私有 tmpfs，关闭浏览器后保存加密快照，再停止容器。

用户已批准的受限站点清理补丁随镜像保存，并在构建时应用和重建扩展。`tsconfig.opencli-build.json` 检查实际扩展代码；上游测试文件原有的类型错误单独记录在 [清理审批与验收](../PLATFORM-DISCONNECT-APPROVAL.md)。Cloud 启动使用原 `OpenCliAddons.repair(true)` 原子更新快照内的旧适配器，保留浏览器资料与原修复备份。

[域 Cookie 补充补丁](../DOMAIN-COOKIE-CLEANUP-APPROVAL.md)已获批准并接入。扩展使用 `1.0.24.1` 版本及 `/opt/opencli-source/extension-cloud-1` 独立目录，旧快照恢复后能够使用新清理逻辑。最终镜像已通过实际 HttpOnly Cookie、localStorage/IndexedDB 清除、其他平台 Cookie 保留、旧快照删除与恢复复核，以及未授权请求拒绝。当前本地 `worker` 为 `764b647f7604`，上一版 `f41fa5620856` 保留为 `worker-previous`。真实四平台账号仍待验收。

容器内通过 `/data/worker.sock` 接收固定的搜索和资料读取任务，直接使用原 OpenCliReader 校验和解码，只接受 YouTube、TikTok、Instagram、X。读取方法由应用白名单限制，参数使用原方法合同，JSON 传输保留大整数。控制目录权限 0700，socket 权限 0600，不发布 TCP 端口。每次只执行一项操作；取消会等浏览器实际关闭，下一次操作按需重新启动。

Discovery 云端代理共享原公开方法合同和错误类型，按店铺签发逻辑 profile 并串行安排读取。原搜索和视频证据执行器已真实运行，结果写入原 Campaign SQLite。通用网页读取仅接受宿主验证来源后的私有任务，网页接口不接收该授权。该通用读取仍需完整任务实测。

镜像更新使用固定本地 image ID。已停止的所属容器重建后，从原加密快照恢复；当前和上一代快照继续保留。`check-image-upgrade.mjs` 已验证升级后 profile 标记仍存在。

登录视图通过已验证 Shopify 身份创建短时单次凭据，网关只连接当前店铺。x11vnc 使用容器内回环反向连接，经 Docker exec 数据流进入 WebSocket，不发布宿主端口；禁用剪贴板和文件传输。关闭视图后等待加密保存。真实验证已覆盖 VNC 数据流及权限，尚未连接商家账号。

没有关闭 Chromium sandbox。若目标运行时不支持所需 sandbox，应记录具体失败并提交环境调整审批，不在入口中静默添加 `--no-sandbox` 或特权模式。

本目录不代表 Shopify 应用或四平台验收已经完成。具体行为、真实验证与剩余工作见 [Linux 生命周期](LINUX-LIFECYCLE.md) 和 [HTTP 服务](../SERVICE.md)。
