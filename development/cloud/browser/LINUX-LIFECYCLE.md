# Linux 浏览器生命周期

## 实现

`onecrew_lite-app/src/cloud/linux-browser-host.ts` 为服务器容器提供独立 Linux 入口，桌面 Chrome 管理模块保持原样。它直接复用现有组件：

- `verifyPrivateDirectory`、`createPrivateDirectory`：核对实际所有者、目录权限和符号链接。
- `acquireInstanceLock`：确保一个持久目录只有一个活动所有者。
- `OpenCliAddons.install(true)`：复用原清单、字节校验和安装锁。
- `runTrustedOpenCliProcess`、原版本与 bridge 状态解析器：分开处理 stdout/stderr，检查固定 OpenCLI 版本和扩展连接。

入口要求 Linux 非 root 用户，用户 home 与持久目录一致；镜像中的实际 Chromium 二进制、daemon、CLI 和扩展路径须为非符号链接的预期类型。没有传入关闭 sandbox 的参数。

启动顺序为目录所有权 → 适配器 → 固定 CLI 版本 → Xvfb 就绪 → daemon → Chrome → bridge 就绪。关闭顺序为 Chrome → daemon → Xvfb → 释放目录锁。每个子进程正常关闭最多等待十秒，超时强制终止并明确报告关闭失败。测试容器配置四十秒停止时间，避免容器运行时提前结束正常清理。

任一长期子进程意外退出时，入口取消当前启动探测，报告固定组件事件，关闭剩余所属资源并以非零状态退出。日志不包含 CLI 正文、Cookie 或访问令牌。调用者可传入 AbortSignal，已就绪环境暴露同一停止信号供后续容器内业务调用使用。

## 构建与依赖许可

Docker 多阶段构建从本仓库源文件打包 Linux 入口及其原有依赖，使用 Node 26.7.0、esbuild 0.28.2。使用依赖声明的 ESM module 入口；原 `@onecrew/runtime-contracts` 源文件随构建进入依赖解析，不以重写 JSON 解析器替代。

bundle 中 Zod 4.6.5、semver 7.8.5、lossless-json 4.3.1、jsonc-parser 3.3.1 的完整许可证分别保留在镜像 `/opt/onecrew/licenses/<package>/`。原生 fs-native-extensions 1.5.0 及其依赖保留 npm 包内容。OpenCLI 源码及其 LICENSE 位于 `/opt/opencli-source`，系统软件声明位于 `/usr/share/doc`。

## 真实验证

本机 Docker Desktop 使用已批准的 `seccomp-profile.json`；未开放宿主端口，未挂载 Docker socket，未增加 privileged、SYS_ADMIN 或 unconfined 权限。

| 检查 | 实际结果 |
| --- | --- |
| 两套容器同时启动 | `onecrew-cloud-browser-lifecycle-a` 与 `onecrew-cloud-browser-lifecycle-b` 分别使用卷 `onecrew-cloud-lifecycle-a`、`onecrew-cloud-lifecycle-b`，均连接 daemon 1.8.8 与扩展 1.0.24 |
| 身份隔离 | A 的扩展 profile 为 `qpp8fqa5`，B 为 `w8rmvsax`；各自使用容器内 19825 端口，无宿主端口映射 |
| 同目录重复启动 | 实际入口返回非零状态与 `runtime.already_owned`，原环境继续运行 |
| Linux 私有目录 | `/data` 与 `/data/profile` 均为 node 所有，权限 0700 |
| 正常关闭与恢复 | A 正常退出码为 0；B 的扩展保持连接。A 在同一卷重启后恢复原 profile `qpp8fqa5` |
| 组件故障 | 主动终止 A 内已确认的 daemon 进程后，记录 `cloud.browser_daemon_exited`，A 自行关闭并以 1 退出；B 继续连接 |
| 真实搜索 | 新入口中原 `onecrew-search-youtube search --limit 2 -f json -- skincare` 返回两条真实视频，包含频道 ID |

其中一条真实结果为 Doctorly 的 `Dermatologist Reveals His ENTIRE Skincare Routine (Morning & Night)`，来源 `https://www.youtube.com/watch?v=Y3EZR8Nse4w`，频道 ID 为 `UCHCZnC9akNA9pBP7aJGNKdg`。原 stdout 证据保留于受忽略的 `.scratch/linux-lifecycle-youtube.json`。CLI 更新提示属于 stderr；固定版本没有自动升级。

测试结束后两套环境及此前的 four-platforms 测试环境均已停止，以释放内存；持久卷与验证容器保留。没有输入平台账号，也没有执行邮件发送。

## 加密快照与真实恢复

`BrowserSnapshotStore` 使用现有私有持久目录和主密钥，沿用 Lite 的 AES-256-GCM 封装格式。按 shop、tenant/base 和快照 ID 派生密钥，逐块保存归档；每次写入新文件，不覆盖旧快照。恢复先完整认证加密文件，再输出明文。取消或失败时移除未完成文件，关闭服务等待当前保存与恢复结束。

归档由系统 tar 生成，排除 `profile/SingletonLock`、`SingletonCookie` 和 `SingletonSocket` 三个机器进程临时文件；恢复直接使用 Docker 自带 tar 接口。未自行实现归档解析器。

真实验证脚本为 `development/cloud/browser/check-snapshot.mjs`。源容器关闭后生成归档，直接流入加密存储，再认证解密到空白目标卷，全程不写明文 tar。实际加密文件为 148,582,428 字节；目标容器 `onecrew-cloud-browser-snapshot-restored` 启动成功，OpenCLI 1.8.8、扩展 1.0.24 与原 profile `qpp8fqa5` 均已恢复。测试后已正常关闭，成功快照及元数据保留在 `.scratch/browser-profile-snapshot-verified/`。

本地文件测试同时验证重开恢复、跨店铺拒绝、篡改密文不输出明文，以及取消时不留下未完成文件。当前共十八项云端和锁检查通过，类型检查通过。

## 容器内搜索入口

当前镜像为 `onecrew-cloud-browser:worker`，入口直接使用原 `OpenCliReader`，保留版本、适配器、浏览器 profile 和结果解码检查。请求只接受 youtube、tiktok、instagram、twitter，不接受客户端指定 profile 或任意命令。每个 worker 同时运行一个任务。

| 私有路由 | 行为 |
| --- | --- |
| `GET /status` | 返回固定版本、四平台列表和当前任务 ID |
| `POST /jobs` | 接受 ID、平台、查询和数量，返回 202；相同 ID 和参数复用当前任务 |
| `GET /jobs/:id` | 等待任务结束，返回真实结果或明确失败状态 |
| `POST /jobs/:id/cancel` | 取消 OpenCLI 调用并关闭所属浏览器环境，排空后返回；后续搜索按需重开 |
| `POST /connect` | 只接受四平台，启动浏览器并复用原 `openCreatorLoginPage` 打开平台页 |
| `POST /pause` | 无活动搜索时关闭 Chrome、daemon、Xvfb，保留 worker 目录锁以保存归档 |

控制接口只监听容器内 `/data/worker.sock`，目录权限 0700、socket 权限 0600。`request.mjs` 经 stdin 接收 JSON，用 Node 原生 HTTP 调用该 socket。宿主调用方必须先收到任务接受确认，再发送取消，等待 worker 返回终态。

真实验证脚本 `check-worker.mjs` 已通过：拒绝 Facebook 请求；YouTube 返回两条结果；重复提交复用任务；取消返回 `cancelled`；取消后重新启动并再次返回两条结果。实际视频来源之一为 `https://www.youtube.com/watch?v=ythV9PhG-XQ`。容器 `onecrew-cloud-browser-worker-check` 正常关闭，退出码 0，未发布宿主端口，持久卷保留。类型检查与十七项已有测试继续通过。

## 店铺调度与远程视图

`ShopBrowserManager` 使用验证后的 shop→tenant/base 映射选择独立容器。容器以冷 worker 启动，恢复归档后才打开 Chrome；活动数据在 `/data` tmpfs。归档排除 Chrome 的三个 Singleton 文件以及当前 worker 的 `server.lock`、`worker.sock`。恢复在容器内用系统 tar 解压，保留正在持有的锁和 socket。任务结束提交当前、上一代快照指针，再停止容器。

`check-shop-manager.mjs` 已实际验证：两个店铺各返回两条 YouTube 结果；容器分离且无 `/data` 持久卷；服务重开后恢复实际标记；卸载停止本店铺搜索，另一店铺仍能搜索。

`RemoteBrowserGateway` 发出九十秒单次凭据，要求相同 Origin 与固定 WebSocket 路径，最长连接十五分钟；客户端不能传入主机、端口或 shop。x11vnc 只向容器回环临时端口反向连接，经固定 Docker exec 程序转发；`-input KMB`、`-nosel` 禁止剪贴板与文件传输。浏览器环境在连接结束后关闭并保存加密快照。

`check-remote-gateway.mjs` 已打开真实 Instagram 平台页并接收到真实 RFB 数据流，验证外部来源拒绝、凭据单次使用、卸载撤销以及关闭后保存加密 profile。本地 SDK Session 只作为存储归属输入；没有输入平台账号。

## 继续实现的边界

现有证据不证明平台账号登录、Instagram/TikTok/X 搜索、模型评分或完整 Shopify 工作流已经通过。完整业务任务、平台断开清理和隐私处理仍按上架方案继续。
