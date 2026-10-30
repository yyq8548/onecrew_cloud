# 新用户平台登录窗口修复

日期：2026-10-28。仅修改onecrew_cloud，未改公司GitLab、DNS、Tunnel或第三方授权配置。

## 原因与修改

新用户打开平台浏览器时，运行配置仍引用已不存在的`development/cloud/browser/seccomp-profile.json`。Docker创建容器实际返回125，提示无法打开该文件；网页只显示浏览器连接中断。已有工作区可以复用已创建容器，因此旧账号验证未覆盖这项失败。

将原受限配置作为运行资源放在`onecrew_lite-app/src/cloud/assets/browser-seccomp.json`，CLI默认使用此路径，本机受忽略运行配置同步更新。SHA-256仍为`8009f0da5bb7a293a5fa7b34de074ec82b61c1e2f800573364d44c6a8c48ab48`，保留原沙箱、权限和完整性检查。网关日志保留具体CloudHttpError代码，避免创建失败统一显示为viewer_failed。

本机Cloud服务已正常重启并使用新路径。未恢复已删除的开发脚本和文档目录，未改模型、搜索、评分或发信逻辑。

## 验证

- 原缺失路径创建容器实际失败；新路径创建全新隔离容器成功。
- 同一全新容器依次打开YouTube、TikTok、Instagram，三个真实画面连接均返回RFB 003.008，合计9.902秒；验证后停止并删除该无账号的检查容器。
- `pnpm typecheck`和`git diff --check`通过。
- 公网健康检查、现有个人工作区登录恢复和YouTube实际画面显示通过。
- 私有证据：`.scratch/remote-login-20261028/`中的`fresh-browser.log`、`fresh-browser-result.json`、`typecheck.log`、`service.log`和`public-youtube-connected.png`。

本轮没有代替同事输入平台密码或完成本人登录，未发送邮件。上述结果验证容器创建和登录窗口传输；同事继续使用时需刷新页面后重新打开浏览器。新用户从零注册及完整搜索流程仍按原问题表单独验收。
