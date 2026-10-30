# 基础流程与验证入口

更新：2026-10-28，当前网站v47。业务流程为：登录个人或店铺工作区→选择或手填商品→选择三平台与粉丝范围→搜索、核实与二元匹配→保存推荐与公开联系方式→编辑、预览、确认Gmail邮件→查看发送记录。

## 使用与验收

- 同事使用：[简单测试说明](TEAM-TESTING.md)。
- 当前结果：[基础功能状态](BASIC-FUNCTION-STATUS.md)、[完整进度](../handoff/GOAL.md)。
- 最新真实搜索与匹配：[v47验收](MATCH-AND-REAUDIT-2026-10-28.md)。
- Shopify安装／同步／卸载重装：[实际店铺记录](SHOPIFY-LIVE-2026-10-27.md)。
- 单封与批量Gmail：[店内发信](SHOPIFY-GMAIL-SEND-2026-10-27.md)、[批量自测](BULK-MAIL-AND-SIMPLIFICATION-2026-10-28.md)。
- 第二店与删除：[当前隐私验收](PRIVACY-SECOND-STORE-2026-10-27.md)。

## 开发运行

当前正式使用的本机服务与固定域名见[SERVICE](SERVICE.md)；Mac、模型及独立数据目录见[MACOS](MACOS.md)。不要为读取旧结果另启同一可写数据目录。源码检查和构建使用[开发说明](../README.md)中的实际命令，运行环境配置、密钥及模型不写入Git。

较早关键词批量检查和Linux组件测试只作为对应版本的历史证据，不表示当前三平台、模型质量或Shopify线上路径已全部验收。当前缺项集中在[问题表](../handoff/ISSUES.md)；上架文案和审核步骤见[材料入口](SHOPIFY-SUBMISSION.md)。
