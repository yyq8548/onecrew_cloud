# Mac统一启动与重启

当前Mac已安装`io.onecrewai.cloud`和`io.onecrewai.cloud.tunnel`两个用户LaunchAgent。开机并登录当前Mac用户后，自动启动Docker、免费4B与网站，以及现有公网Tunnel，无需手动执行命令。配置、已批准系统权限和真实验收见[自动启动记录](MAC-AUTOSTART-APPROVAL.md)。

网站先等待4B就绪再开放。模型意外退出时，网站随之退出，macOS自动重新启动它们。网站与模型的共同日志为`.scratch/macos-startup/cloud.log`，Tunnel日志为同目录`tunnel.log`。

## 日常停止与重启

正常重启网站与4B：

```sh
launchctl bootout "gui/$(id -u)/io.onecrewai.cloud"
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/io.onecrewai.cloud.plist"
```

第一条命令停止网站及其模型子进程，第二条重新启动；只执行第一条可暂时停止它们，之后重新登录Mac仍会按启动项运行。Tunnel独立运行，需要维护时对`io.onecrewai.cloud.tunnel`和对应plist执行相同操作。

不同时执行手动启动命令。手动开发时，先卸载网站启动项，再从onecrew_cloud根目录执行：

```sh
pnpm cloud:start
```

命令读取受Git忽略的`.env.cloud`，先启动现有Qwen3-4B Metal，收到模型健康检查成功后再开放网站。日志依次出现`cloud.model_ready`与`cloud.listening`。模型加载期间网站保持未开放。

同一终端按Ctrl+C关闭网站及其4B子进程。再次运行上述命令即可重启，两项服务复用原Cloud数据目录、账号、邮箱绑定和平台快照。模型意外退出时，网站随之关闭并以失败状态退出，排查日志后用同一命令重新启动。

Docker和现有固定Tunnel需保持运行。此入口只管理本仓库的网站和4B；公司DNS、Access、Sync、API与Shopify配置沿用当前设置。每个实例独占8788和8789端口，重复启动会报端口占用，已运行实例继续工作。

本轮已通过启动项重载、模型退出后的自动恢复和重载后实际4B生成；整台Mac重新开机及Docker冷启动没有实际执行。开机后仍须本人解锁并登录Mac；锁屏可继续运行，睡眠或关机期间无法提供服务。

## 私有配置与文件

本机`.env.cloud`已复用原有私有运行配置。换电脑时经私有渠道迁移该文件、原数据及密钥、已验证的模型和可执行文件；配置样例见[cloud.env.example](cloud.env.example)。Git只携带源码和样例。

当前浏览器镜像为`onecrew-cloud-browser:login-form-20261028`，支持外部网页账号／密码原生填入，关闭独立浏览器新增密码保存，保留UTF-8单向粘贴。构建入口为`development/cloud/build-login-browser.mjs`，依赖本机已保留的`onecrew-cloud-browser:web-login-20261028`基础镜像；换电脑时同时迁移已验证镜像。构建命令在仓库根目录执行：

```sh
node development/cloud/build-login-browser.mjs
```

构建编译当前worker、更新既有私有请求入口并添加容器内密码保存策略，没有新增依赖或扩展权限。原VNC输入和沙箱配置保持。更新网站前等待活动搜索和登录窗口结束，保留原加密快照；修改Cloud私有配置中的镜像标识后按上文重启。当前登录和恢复验收见[记录](LOGIN-FORM-2026-10-28.md)。

默认复用当前仓库`.scratch/models/Qwen3-4B-Q4_K_M.gguf`及`.scratch/llama-macos-b11804/llama-b11804/llama-server`。文件位于其他位置时，在`.env.cloud`填写`ONECREW_MODEL_FILE`与`ONECREW_MODEL_EXECUTABLE`绝对路径。参数保持8192窗口、单并发、Metal GPU及现有4B模型标识。关键词使用快速模式，匹配使用128 token限量推理；仍为每位候选一次请求，当前实现与验收见[记录](SEARCH-MEANING-METRICS-2026-10-29.md)。

网站本机地址为`http://127.0.0.1:8788`，网站健康检查为`/healthz`，模型健康检查为`http://127.0.0.1:8789/health`，公网入口仍为`https://cloud.onecrewai.io/`。自动运行的日志见上文；手动启动时日志由同一终端接收。

## 2026-10-28验收

- 模型加载时健康检查返回503，网站8788端口尚未开放；日志确认模型就绪后才出现网站监听事件。
- 正常停止启动进程返回0，网站与所属模型均退出，两个端口释放；同一命令重新启动成功。
- 重复启动返回1并报告端口占用，原实例继续正常提供公网服务。
- 单独停止运行中的模型后，网站随之退出，启动进程返回1；再次执行统一入口后，两项服务恢复。
- 重启后原网页登录及十位历史结果恢复。新任务`2b8d804a-0293-495d-be3a-7c06d7126eb6`使用原手动Owala商品、三个平台及最低2000粉丝，156.171秒完成十位，包含十次真实模型匹配调用，任务状态为`completed/finished`。本轮复用现有关键词；Instagram未登录和一条TikTok资料无法核实由原搜索流程处理，没有模型不可用错误。未发送邮件。
- 类型检查、差异检查通过；`.env.cloud`受Git忽略，权限为600。未修改公司代码、配置或付费服务。

私有验证记录位于`.scratch/coupled-start-20261028/`：首次启动、重复启动、重启与模型退出日志，`search-verification.json`和类型检查结果。新用户本人及三个平台授权仍按原安排后续验收。
