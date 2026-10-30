# OneCrew Cloud

OneCrew Cloud复用Lite的创作者搜索、Campaign、原文核实、Library和Gmail能力，提供Shopify内嵌界面及独立网页。非Shopify用户也可以登录OneCrew后手动填写商品。

- 使用入口：https://cloud.onecrewai.io/
- 同事测试：[简单使用说明](development/cloud/TEAM-TESTING.md)
- 当前进度：[Goal](development/handoff/GOAL.md)、[未完成事项](development/handoff/ISSUES.md)
- 上架准备：[Shopify材料](development/cloud/SHOPIFY-SUBMISSION.md)，尚未提交审核
- 换电脑开发：[交接入口](development/handoff/README.md)

## 当前功能

平台为YouTube、TikTok、Instagram。填写商品、选择平台和最低粉丝数后，目标寻找十位，新搜索不设最高限制；按频道分别计数，来源不足时可能少于十位。匹配使用免费Qwen3-4B：同类商品、其他品牌同类商品或直接配套均可，结果显示符合／不符合及真实原文，保留粉丝和身份核实。

推荐表保存粉丝观察、匹配依据、来源和公开联系方式。Gmail复用OneCrew授权，支持选择联系人、编辑邮件、预览确认、批量逐封发送及回执。平台会话加密保存，个人与店铺工作区独立。

网站提供[使用与支持](https://cloud.onecrewai.io/support)和[隐私政策预览](https://cloud.onecrewai.io/privacy)。预览尚未生效；上架所需文件、步骤和缺少资料见[材料入口](development/cloud/SHOPIFY-SUBMISSION.md)与[一次清单](development/cloud/SHOPIFY-REQUIRED-INPUTS.md)。

2026-10-29网站v49以默认最低2000粉丝且无上限完成两轮真实任务：纸巾十位、五个公开邮箱，306.139秒；Monster饮料十位、四个公开邮箱，344.942秒。两轮均选中三个平台，达到十位后停止，结果来自YouTube与TikTok；全部推荐均有主页链接，表格按粉丝数从高到低排序。商品词义、统计保存和继续搜索已修复，见[当前验收记录](development/cloud/SEARCH-MEANING-METRICS-2026-10-29.md)。不同平台、条件、候选和历史材料影响耗时，不承诺固定速度或任意商品都找满。

Shopify真实安装、商品同步、卸载重装、第二店铺隔离及邮箱独立撤销已有证据；[离线令牌自然到期、刷新和失效后接口恢复](development/cloud/SHOPIFY-TOKEN-LIFECYCLE-2026-10-28.md)已验证。真实整店删除通知、新用户从零流程及最终上架检查仍有缺项，见当前进度。

## 运行与开发

当前部署在运营方这台Mac：已安装用户LaunchAgent，开机并登录后自动启动Docker、网站与免费4B，以及固定公网Tunnel。确认Metal模型就绪后开放网站，模型意外退出时自动恢复。服务期间Mac需保持唤醒联网。停止、重启及手动开发入口见[运行说明](development/cloud/STARTUP.md)；私人环境配置、模型权重、浏览器资料及密钥通过私有渠道保管。

仓库：https://github.com/yyq8548/onecrew_cloud.git。导入自Lite提交`1ac72b654eaf823df6c14ce512e34c6c43ddd8f2`。包名保留`onecrew_lite-*`以便复用，本仓库不依赖相邻Lite源码或账号目录。

仅修改onecrew_cloud；公司Access、Sync、API后续源码或配置变更须先取得具体审批。合并发布遵循[工作区流程](docs/release/合并与部署流程.md)，不购买付费服务。
