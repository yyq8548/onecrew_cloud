# Shopify 邮件界面自发自收验收

2026-10-27（America/Los_Angeles）。按用户授权，从真实 Shopify 开发店铺的邮件界面完成编辑、预览、确认发送和 Gmail 回读。只发送一封给本人，没有给 KOL 发信。

| 项目 | 实际结果 |
| --- | --- |
| 店铺 | `onecrew-cloud-test.myshopify.com`，固定域名中的内嵌 OneCrew Cloud |
| 发件邮箱 | 已授权的测试发件邮箱，复用现有 Gmail 授权 |
| 唯一收件人 | 发件人本人邮箱 |
| 主题 | OneCrew Cloud Shopify 邮件完整流程测试 |
| 正文 | 这是一封从 Shopify 内 OneCrew Cloud 邮件界面发送的自发自收测试邮件，用于验证邮件编辑、确认发送和 Gmail 回执。无需回复。 |
| 发送确认 | 服务生成的确认页显示上述发件人、唯一收件人、主题和正文；只点击一次“确认发送” |
| Gmail 回执 | 发送流程自动回读并核对 Gmail 原始回执，最终界面显示“发送成功”；该状态对应 `sent`，不是等待回执的 `accepted` |
| Gmail 消息编号 | `1a180684b39da863` |

界面完成发送后清空编辑框，并保留主题、收件人、成功状态和 Gmail 编号。结果页保持打开。

本次直接复用现有功能，没有修改业务代码、公司 GitLab 或配置，没有购买服务。仅在 onecrew_cloud 更新验收与交接文档。

真实页面证据保存在受忽略的 `.scratch/shopify-mail-send-20261027/`：

- `mail-native-current.txt`：实际编辑内容。
- `mail-preview-native-ready.txt`：服务生成的一人发送确认页。
- `mail-after-confirm.txt`：确认后的发送处理中状态。
- `mail-final-ax.txt`、`mail-gmail-confirmed.png`：最终成功状态和 Gmail 编号。
- `validation.json`：从实际界面证据提取的结果。

原始浏览器记录含会话参数，仅留本机受忽略目录；文档与对外答复不包含这些参数。
