# 内嵌加载与最低2000粉丝完整流程

日期：2026-10-28。只改onecrew_cloud，无公司Git、权限、付费服务或上架提交变更；没有发信。

## 当前实现与页面验证

`cloud/web-assets.ts`此前在服务启动时保存HTML字符串。构建替换带哈希的资源后，旧页面仍可能引用已被删除的脚本；实际旧页面中的`cloud-BB-ZQlqY.js`返回404。

现在每次打开文档读取当前构建，保留启动配置检查、Shopify文档身份检查、CSP与个人工作区隔离。未增加重试、自动刷新或缓存管理模块。

服务保持运行时，实际将表单默认最低粉丝数改为2000并重新构建：文档脚本由`cloud-DVp6AK-y.js`更新为`cloud-C53lUy7S.js`，脚本和样式均200；Shopify后台实际出现新表单，只有一个最低粉丝输入，值为2000。搜索过程中再次加载，恢复同一运行任务并继续至十位，未重复创建任务。

默认值同时用于首次表单与从最近任务打开的新搜索；明确选择模板时保留模板最低值，新任务无最高限制。旧任务条件未重写。

## 真实完整任务

| 项目 | 结果 |
| --- | --- |
| 测试店 | `onecrew-cloud-test.myshopify.com` |
| 商品 | 已有Shopify商品Owala FreeSip® |
| 条件 | YouTube、TikTok、Instagram；最低2000，无最高限制；目标共十位 |
| 任务 | `44bca63a-1e68-4fe0-99fc-245b9cb4d498` |
| 完整耗时 | 250.146秒，状态completed、阶段finished |
| 推荐 | 十位：七位YouTube、三位TikTok；Instagram参与搜索但没有进入最终十位 |
| 联系 | 八个公开邮箱、一位有网站／社交入口、一位暂无公开联系方式 |
| 主任务失败 | 流水线记录为零 |
| 模型与读取 | 实际匹配模型调用十次、一次关键词生成；流水线读取二十七次，包含搜索／内容／主页／语言 |

十位已用保存的简介、内容及来源逐项复核，粉丝观察均不少于2000；支持同类饮水容器，未发现明确官方品牌、自有库存销售或下单表述。评测媒体、个人分享、联盟链接及品牌合作按当前标准处理。核对为公开文本初筛，不含视频画面或独立外部调查，不推断所有商品的长期准确率。

结果为Prudent Reviews、Adam’s Faves、wugene、arij_finds、Linz ✨ Dash ⚡️Luna ✨、BottlePro、carolyn_nichole、Jojo’s Mojo、JadeGeminiM390、Pack Hacker Reviews。具体邮箱与原文存于私有结果表，不写入上架宣传。

## 联系补查与页面恢复

主任务结束后，额外为缺少邮箱的两位点击现有补查入口。JadeGeminiM390仍没有更多公开入口；Pack Hacker Reviews最后返回“已读取2个联系页面，结果已更新”，公开网站与社交链接已更新，没有找到新邮箱。最终仍为八个公开邮箱、一位其他联系入口、一位暂无。

额外补查曾出现一次HTTP500，最终重试成功，未重现持续异常，未为其增加重试或兜底代码。浏览器工具挂起的调试连接结束后，Chrome恢复正常加载，Shopify页面显示完整十位结果；维护重启期间留下的根页面Bad Gateway经刷新恢复。清理诊断并重启服务后，再次在Chrome刷新Shopify内嵌页面，仍显示10/10及八个邮箱，未重复创建任务。公网健康检查为listening，未降低身份、权限或会话保护。

类型检查、Cloud网页构建与`git diff --check`通过。临时诊断日志已从源码移除。

私有证据目录：`.scratch/embedded-flow-20261028/`。`measurement.json`为任务与实际条件，`contacts-ui.json`为界面联系信息，`KOL-RESULTS.md`为可供用户查看的十位表，`final-results.png`为最终Shopify页面，`after-assets.json`为构建后资源状态，`stale-asset-headers.log`为旧资源404证据。含授权参数的临时文档地址不提交Git。
