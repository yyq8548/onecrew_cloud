# Mac自动启动配置与验收

更新：2026-10-28。两个用户启动项已安装，已批准的文件访问权限已通过系统设置开启。网站、免费4B及现有公网Tunnel当前由launchd管理；启动项重载、模型退出后的自动恢复及真实模型生成均已通过。开机并登录当前Mac用户后自动运行。

## 已批准的系统修改

1. 将[网站启动项](macos/io.onecrewai.cloud.plist)和[公网Tunnel启动项](macos/io.onecrewai.cloud.tunnel.plist)复制到当前用户的`~/Library/LaunchAgents/`，仅新增这两个文件。
2. 用`launchctl bootstrap gui/503`注册并立即启动它们。以后开机并登录当前Mac用户后自动运行；不需要再次打开终端。
3. 网站启动项执行[现有服务入口的启动脚本](macos/start.zsh)：Docker未运行时打开已安装的Docker Desktop，最多等待120秒；再启动现有免费4B，确认模型就绪后开放网站。运行期模型退出时，网站一起关闭，由launchd重新启动这一组服务，启动节流设为30秒。
4. Tunnel启动项复用现有cloudflared及本机私有令牌文件，恢复`cloud.onecrewai.io`公网访问。日志分别写入仓库受忽略的`.scratch/macos-startup/cloud.log`和`tunnel.log`。
5. 安装后重载这两个启动项，核对网站、4B、Tunnel及原有数据恢复；单独停止模型验证同组服务自动恢复。只操作本次新增的启动项及它们拥有的进程。

沿用当前Mac用户权限、8192窗口、免费4B、数据目录、现有域名和Tunnel配置。公司Git、DNS、Access、Sync、API、Shopify及现有系统启动项不变。文件中只记录私有令牌路径，不包含令牌内容。

## 运行条件

按[Apple的LaunchAgent说明](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html)，用户启动项在该用户登录时运行。开机后仍须本人解锁并登录Mac；这次不修改自动登录、FileVault、睡眠或网络设置。锁屏可以继续运行，关机或睡眠期间不能提供服务。

这两份配置使用当前Mac的绝对路径，迁移电脑时需要重新核对路径。安装后由launchd管理网站和模型，不同时手动执行`pnpm cloud:start`。

## 检查与验收

安装前检查已通过：两个plist的`plutil -lint`、`zsh -n`、差异及文档链接检查；原有配置和Tunnel令牌文件均保持600权限。使用`env -i`仅提供HOME、USER与启动项相同PATH，直接启动真实网站和4B成功，日志先出现`cloud.model_ready`，再出现`cloud.listening`。模型`/health`、本机网站及现有公网`/healthz`均返回200，公网首页返回200。Docker在本次验证前已运行，没有停用它来测试其他应用。

真实启动日志和进程记录位于受忽略的`.scratch/macos-startup/`。整机重新开机及Docker未运行时的自动打开尚未实际验证；本轮没有停用其他应用共用的Docker。

安装后实际检查：

- 两个启动项已在`gui/503`注册，网站和Tunnel的父进程均为系统launchd，模型由网站进程拥有，不依赖终端会话。原手动实例已正常停止。
- 首次后台运行时，网站进程为60005、模型为60477。单独向模型发送SIGTERM后，网站按原规则退出，launchd记录退出码1并自动启动新的网站60911、模型60930；没有执行手动启动命令。日志顺序为`cloud.model_exited`→`cloud.model_ready`→`cloud.listening`，模型、本机网站及公网健康检查均恢复200。
- 两个启动项随后正常卸载并重新注册成功。最终网站61187、模型61255、Tunnel61208均为新进程；模型就绪后网站开放，本机及公网健康检查、公开首页均返回200。实际模型请求返回“就绪”，耗时600毫秒，仅证明本次简单生成可用。
- 重载前后的六个工作区、六条邮箱绑定、十五个搜索任务、九个账号数据库中的350条候选，以及私有配置和Tunnel令牌摘要均一致。邮箱绑定比较身份字段和启用状态，不输出或改写凭据。未发送邮件，未修改公司配置。
- 私有证据：`first-cloud.txt`、`first-tunnel.txt`、`model-recovery-cloud.txt`、`reloaded-cloud.txt`、`reloaded-tunnel.txt`、`cloud.log`、`tunnel.log`、`model-inference.json`、`data-before.json`及`data-after.json`。

## 已批准的系统文件权限

当前仓库位于受保护的`~/Documents/`。用户已批准在系统设置中为以下程序开启“完全磁盘访问权限”，系统身份验证由用户本人完成，三个开关均已确认开启：

- `/bin/zsh`：读取本仓库启动脚本。
- 本仓库`.scratch/shopify-live-20261027/cloudflared`：读取现有Tunnel令牌并建立连接。
- `/Users/guanliyuan/.local/opt/node-v26.7.0-darwin-arm64/bin/node`：实际启动时也触发系统文件访问请求，已按用户批准的条件补充授权。

该权限覆盖其他受保护目录，范围大于本仓库，用户已单独批准。通过系统界面操作，未直接修改TCC数据库；自动登录、FileVault、睡眠及公司配置保留当前设置。移动仓库或更换Node可执行文件后需要重新核对路径和授权。权限入口见[Apple系统设置说明](https://support.apple.com/guide/mac-help/change-privacy-security-settings-on-mac-mchl211c911f/mac)。

## 安装命令

当前已经安装，以下命令保留用于重新安装。已注册的启动项须先正常卸载；如有手动启动的网站、模型或Tunnel，先正常停止对应进程。日常重启见[启动说明](STARTUP.md)。

```sh
mkdir -p "$HOME/Library/LaunchAgents" .scratch/macos-startup
cp development/cloud/macos/io.onecrewai.cloud.plist "$HOME/Library/LaunchAgents/"
cp development/cloud/macos/io.onecrewai.cloud.tunnel.plist "$HOME/Library/LaunchAgents/"
chmod 644 "$HOME/Library/LaunchAgents/io.onecrewai.cloud.plist" "$HOME/Library/LaunchAgents/io.onecrewai.cloud.tunnel.plist"
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/io.onecrewai.cloud.plist"
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/io.onecrewai.cloud.tunnel.plist"
```

停止自动运行时，先用`launchctl bootout`卸载这两个任务，再删除对应的两个plist文件；数据、模型、私有配置和其他启动项保留。
