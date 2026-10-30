# 纯网页登录与保存优化

更新：2026-10-28。用户已批准纯网页方案。单向粘贴、当前会话内检查与一次保存已经实现，三平台真实会话保存和冷恢复通过。只修改onecrew_cloud；不购买服务，不修改公司代码或配置。

## 当前流程

需要登录的平台打开网页窗口 → 先点远程输入框，在下方正常文本框输入或粘贴，点击「粘贴到浏览器」 → 在当前浏览器完成原身份检查 → 加密保存一次并关闭 → 后续搜索自动恢复会话。TikTok仍可选择原站提供的扫码入口。

公开可读取的内容继续按现有能力搜索；平台实际要求登录时提示对应入口。已保存会话不应被界面描述成必须重新登录。保留验证码、本人确认及平台安全验证。

## 修改依据

| 环节 | 修改前证据 | 当前处理 |
| --- | --- | --- |
| 输入 | 原界面没有粘贴入口；VNC标准剪贴板实测把中文替换成问号 | [RemoteBrowser.tsx](../../onecrew_lite-web/src/cloud/RemoteBrowser.tsx)一次发送UTF-8文本到当前窗口剪贴板，再发送Ctrl+V；登录镜像增加xclip，保留VNC的`-nosel`，不读取剪贴板回传 |
| 保存检查 | 原`/api/connections/close`先关闭并保存，再恢复浏览器检查，最后再次保存 | [http.ts](../../onecrew_lite-app/src/cloud/http.ts)、[shop-browser-manager.ts](../../onecrew_lite-app/src/cloud/shop-browser-manager.ts)在同一浏览器执行原检查，结束后统一保存和关闭 |
| 画面 | Xvfb为1280×800，noVNC默认JPEG质量6、压缩级别2，镜像使用`-noshm` | 本轮保留这些参数；整段输入通过一次请求发送，避免逐字远程操作。本机测量不足以确定同事网络上的五分钟延迟原因，不添加未经对照验证的画质参数 |
| 网关 | [remote-browser-gateway.ts](../../onecrew_lite-app/src/cloud/remote-browser-gateway.ts)通过一个WebSocket与管道转发输入和画面；身份及一次性票据检查在建连时执行 | 复用现有传输，保留身份、工作区隔离和输入权限检查；没有逐字符调用模型或反复登录鉴权的路径 |
| 登录提示 | [App.tsx](../../onecrew_lite-web/src/cloud/App.tsx)的展示用`authChecks`保存在组件状态，刷新后显示“尚未检查登录状态”；完整浏览器快照仍保留 | 明确按需登录和保存会话的含义，继续自动恢复；不要仅凭Cookie或快照存在就显示已登录 |

原保存流程中的浏览器恢复和第二轮完整归档已消除。现在先结束画面转发，保留浏览器执行原身份检查，再完成一次checkpoint；未发生再次启动。传输结束和浏览器退出分别处理，保存期间不会因主动关闭画面而误报断连。

这项保存优化改善点击保存后的等待；它不能解释输入邮箱时的五分钟延迟。登录路径不调用4B，模型提示词优化不会改善远程打字。

新增`POST /api/connections/paste`复用现有网页身份、成员和工作区校验，核对当前窗口的平台及生命周期。文本只经stdin进入当前容器的X11剪贴板，不进入命令参数、数据库、日志或快照；没有远程剪贴板读取接口。输入默认隐藏，可主动显示，发送后清空。镜像构建入口为[Dockerfile.viewer](../../onecrew_lite-app/src/cloud/assets/Dockerfile.viewer)，基于现有镜像安装Debian的xclip，不改变浏览器权限或沙箱。

## 各平台采用的方式

| 平台 | 当前方案 | 官方能力边界 |
| --- | --- | --- |
| YouTube | 保留网页登录，接通一次粘贴与现有会话恢复 | 官方Data API可用项目API Key读取公开数据，是后续减少登录的独立选择；需要配置项目、适配读取和核对配额，不能保证覆盖网页登录后的所有补查能力 |
| TikTok | 优先显示网站自身的二维码登录；保留账号输入作为替代入口 | 网站扫码登录与开发者Login Kit二维码授权是不同流程；后者提供按scope使用的API令牌，不能直接承诺替代OpenCLI浏览器会话 |
| Instagram | 保留网页本人登录，接通一次粘贴和保存优化 | 本轮Meta官方API文档返回429，未核实账号类型和搜索权限，不把官方OAuth替代当前搜索列为已验证方案 |

普通网页受同源策略限制，不能直接读取用户自己Chrome里的第三方登录状态。官方OAuth可以利用用户本机的已有登录完成授权，但提供的是相应API权限；把它等同于服务端浏览器Cookie不是这些文档承诺的能力。这里的浏览器会话边界是结合OAuth流程与同源策略得出的判断。

Google手机通行密钥跨设备登录要求近距离蓝牙验证；同事的手机通常不在运行远程浏览器的这台Mac旁，不能作为通用入口。

## 验收结果

使用原测试店铺的真实加密会话，在独立数据副本和容器中验证。副本保留原工作区归属，原店铺和其他同事账号数据不变；这次复用已授权会话，没有代替本人输入密码，也不算另一新用户从零注册通过。

| 平台 | 检查并保存 | 冷启动、恢复、检查及再次保存 | 结果 |
| --- | --- | --- | --- |
| YouTube | 7.711秒 | 13.089秒 | 两次均`logged_in` |
| TikTok | 10.741秒 | 15.912秒 | 两次均`logged_in` |
| Instagram | 7.253秒 | 12.786秒 | 两次均`logged_in` |

三个保存区间的Docker事件均只有一次停止，没有启动事件。真实YouTube页面一次粘贴`Owala 水瓶`完整回显，本机粘贴接口内部耗时74毫秒；输入发送后清空。390像素窄屏下文档无横向溢出，粘贴、显示、全屏、原始尺寸和保存按钮均在可见范围。

上述冷恢复耗时包含完整启动和归档，不能把它作为单独检查接口耗时。真实网络与页面负载会变化，不用本机数字承诺同事的输入延迟。TikTok本轮复用已有会话，没有重新扫码授权。

公网网站已更新。实际中文粘贴请求返回200，耗时344.469毫秒；Ctrl+V发送后88.747毫秒收到第一帧回传，截图确认文字完整。原个人工作区的YouTube页面显示Sign in，检查保存返回200、9.166秒，界面正确显示「尚未完成登录」，三个平台入口恢复可用。匿名粘贴请求返回401。网站和4B重启后的健康检查均正常。

前后端类型检查、正式前端构建和差异检查通过。私有证据位于`.scratch/pure-web-login/`，包括`results.json`、`checkpoint-events.json`、输入元数据和截图；没有记录密码、验证码或剪贴板正文，测试截图使用公开商品词。网站与4B沿用现有LaunchAgent，镜像为`onecrew-cloud-browser:web-login-20261028`；上一镜像及上一前端构建保留。公司Access、Sync、API、DNS、Tunnel和Shopify配置未修改。

## 当前测量及验证要求

本次从运行服务的Mac进行HTTP抽样，三次本机健康检查分别为46、3、1毫秒，三次公网健康检查为142、52、61毫秒，全部200。主机为16GiB内存、8核，抽样空闲内存比例50%；当时一个浏览器容器约1.106GiB／2GiB、CPU约53.83%。这些瞬时数据不代表同事的网络，也不包含远程按键、Chrome处理、编码和画面回显，不能据此认定五分钟延迟的根因。

同事所在网络的端到端输入时间仍需其实际使用反馈。没有发现本机输入处理的持续阻塞，因此本轮未改画质、压缩、CPU限制或系统网络配置。

## 一手来源

- [Shopify App Store要求](https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements)：1.1.11扩展只能可选，1.1.12不得依赖桌面应用。
- [noVNC 1.7 API](https://raw.githubusercontent.com/novnc/noVNC/v1.7.0/docs/API.md)：剪贴板发送、画质和压缩接口及默认值。
- [x11vnc手册](https://manpages.debian.org/bookworm/x11vnc/x11vnc.1.en.html)：`-nosel`、`-seldir recv`及`-noshm`的含义。
- [xclip源码与使用说明](https://github.com/astrand/xclip)：通过标准输入设置X11剪贴板，保持后台选择服务。
- [YouTube凭据说明](https://developers.google.com/youtube/registering_an_application)与[配额说明](https://developers.google.com/youtube/data/getting-started)：API Key与OAuth权限边界，配额需核对。
- [TikTok网站登录](https://www.tiktok.com/login)、[Login Kit](https://developers.tiktok.com/docs/en/login-kit-overview)、[Display API](https://developers.tiktok.com/docs/en/display-api-get-started)：网站扫码入口与API授权范围。
- [Google通行密钥](https://developers.google.com/identity/passkeys/use-cases)与[同源策略](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy)：跨设备近距离要求及跨站数据访问边界。
- 本轮未能读取：[Instagram Login API](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/)与[Facebook Login API](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/)，均返回429，未绕过限制。
