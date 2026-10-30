# 外部登录表单

更新：2026-10-28。YouTube、TikTok、Instagram的外部网页账号／密码输入已更新到公网网站，复用OpenCLI原生填入和现有加密会话。三平台本人登录、保存与冷恢复通过，公网账号填入通过；未修改公司源码、配置或购买服务。

## 使用流程

打开平台浏览器，在平台页面选择账号密码登录。在Cloud窗口下方填写当前步骤需要的邮箱／用户名或密码，点击「填入上方登录框」。程序选择该平台当前可见的登录字段，原生填入并替换原有内容；不代替用户提交登录或完成验证。多步骤登录在平台点击下一步后，再填写密码。验证码和扫码仍在原站完成。10月29日已强化成功提示与下一步说明，见[界面记录](CONTACT-LOGIN-UX-2026-10-29.md)。

已填入的账号会清空；密码在本次请求结束后清空，关闭窗口时同样清空。保留折叠的「粘贴验证码或其他文字」，供原站其他输入使用。现有「保存并检查」、取消、工作区归属和加密恢复继续复用。

## 实现与密码处理

- [login-form.ts](../../onecrew_lite-app/src/cloud/login-form.ts)：选择当前活动页面，仅接受该平台允许的登录域名和可见字段。Google使用实际页面的`name=identifier`，Instagram支持当前页面的`name=email`与旧版`name=username`；新密码字段、禁用或只读字段不填入，找不到或出现多个字段时明确返回问题。
- [http.ts](../../onecrew_lite-app/src/cloud/http.ts)的`/api/connections/login`复用当前成员与工作区身份；[remote-browser-gateway.ts](../../onecrew_lite-app/src/cloud/remote-browser-gateway.ts)确认当前平台窗口和生命周期，传给私有worker接口。客户端不能指定目标URL、选择器或脚本。
- [browser-worker.ts](../../onecrew_lite-app/src/cloud/browser-worker.ts)直接使用镜像内固定版本的OpenCLI `Page.insertText`。凭据只在请求和输入处理的内存中传递，不拼入进程参数、页面脚本或命令结果，不经过任务存储、日志、剪贴板或模型。关闭浏览器时等待当前填入结束，再执行既有保存。
- 检查镜像内SDK、daemon与扩展实现后，确认命令日志保留ID、状态和结果，不保存本次输入参数；原生填入结果只有`inserted`标识。该路径不增加重试。
- [浏览器策略](../../onecrew_lite-app/src/cloud/assets/browser-login-policy.json)设置`PasswordManagerEnabled=false`，关闭独立Chromium新增密码保存。会话Cookie继续按原规则加密保留。此策略不删除历史密码，未修改用户自己Chrome的密码管理器设置。官方说明见[Chrome PasswordManagerEnabled](https://chromeenterprise.google/intl/en_ca/policies/password-manager-enabled/)。

构建入口：

```sh
node development/cloud/build-login-browser.mjs
```

使用现有`onecrew-cloud-browser:web-login-20261028`基础镜像，编译当前worker，更新私有请求入口，并安装上述容器内策略。没有新增依赖或扩展权限。镜像标识为`onecrew-cloud-browser:login-form-20261028`，构建中间文件在受忽略的`.artifacts/cloud-login/`。

## 当前验证

| 项目 | 状态 |
| --- | --- |
| 前后端类型和差异检查 | 通过 |
| 镜像内worker实际导入 | 通过，复用现有jsonc-parser ESM构建方式 |
| 独立浏览器密码保存策略 | 实际`chrome://policy`显示false、Mandatory、OK |
| YouTube账号与密码填入 | 真实账号202毫秒、本人密码175毫秒；填入后外部输入清空，完成Google登录 |
| YouTube保存与冷恢复 | 保存6.416秒、冷恢复9.594秒，两次均为已登录；两个Chromium密码库的保存数量均为0 |
| TikTok账号自动填入与登录 | 原站邮箱密码表单428毫秒；本人改用Google登录并完成平台登录，Google账号填入154毫秒。没有验证TikTok原站密码登录 |
| TikTok保存与冷恢复 | 保存6.774秒、冷恢复10.910秒，两次均为已登录 |
| Instagram账号与密码填入 | 当前真实表单同时填入账号和本人密码234毫秒，完成平台登录；支持`name=email`与旧字段兼容 |
| Instagram保存与冷恢复 | 保存6.610秒、冷恢复12.002秒，两次均为已登录 |
| 三平台登录后密码库 | 最后只读查询两个Chromium密码库，保存数量均为0；未读取密码内容 |
| 窄屏布局 | 390×844尺寸下输入与按钮可用，弹窗覆盖完整高度，无横向溢出；已恢复正常窗口 |
| 公网更新 | 当前构建`cloud-BsPEz2fh.js`；真实账号自动填入原站且外部两栏清空，返回保存通过；匿名请求401 |
| 网站与4B重启 | 沿用原LaunchAgent重启；模型、本机网站和公网健康检查均200，原工作区继续可访问 |

本次独立数据副本沿用原测试店铺的真实归属，但使用新浏览器登录，没有改写原店铺或同事的已有授权。它不代表另一用户从零注册的验收。私有证据位于`.scratch/login-form-20261028/`，仅记录字段名称、状态和耗时；不记录凭据正文。

本次网站使用镜像`onecrew-cloud-browser:login-form-20261028`，实际ID为`sha256:a71a13caec20391df8ec771167e04e4bcfcc29bd6f8db5268b3dd7a8451c89a1`。Cloud私有配置仅更新浏览器镜像标识，网站与4B按原启动入口运行；公司服务、Tunnel和系统权限未变。使用说明和隐私预览已同步说明即时填入及密码清空。

上一版网页和本机配置保存在私有证据目录的`previous-web/`及`previous.env.cloud`，上一版浏览器镜像保留。必要时先等待活动任务和登录窗口结束，恢复这两项旧产物及原镜像标识，再按[启动说明](STARTUP.md)重启。不要覆盖数据库或加密密钥。
