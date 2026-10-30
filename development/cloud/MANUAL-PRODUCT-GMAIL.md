# 手动商品与推荐表 Gmail 验收

2026-10-27。本轮只修改 `onecrew_cloud`，继续使用免费 4B Metal、8,192 窗口和原搜索流程，没有购买服务、修改公司仓库、推送或部署。

## 当前使用方式

本机工作台使用真实 OneCrew 用户，无需 Shopify 店铺。“填写商品”提供商品名称与商品说明两个必填项，品牌和链接选填；平台限定 YouTube、TikTok、Instagram，填写粉丝范围后默认寻找 10 位 KOL。Shopify 内嵌入口继续保留原身份验证和商品选择，并支持手动填写。

推荐表可勾选有作者公开邮箱的 KOL，点击“给已选 KOL 写邮件”。多邮箱作者先选择收件地址；没有公开邮箱的作者仍显示已找到的公开入口。邮件页复用原 Gmail 授权，选择发件邮箱、编辑收件人、主题和正文后预览，点击“确认发送”才进入原发送队列。取消预览会保留编辑内容，已保存草稿和发送记录由原生服务持有。

运行方式见 [Mac 运行](MACOS.md)。当前服务仅监听本机，尚未开放其他客户远程登录。

## 实际完整任务

任务 `fcdf622e-5ee1-469e-9d42-5beca32edf6a`，匹配版本 v42。

| 项目 | 结果 |
| --- | --- |
| 商品输入 | 手动填写 FreeSip® 的真实商品介绍，品牌 Owala |
| 商品与工作区身份 | `source=manual`，真实 OneCrew 用户；没有新增 Shopify 安装、商品 GID 或更新时间 |
| 平台与粉丝 | YouTube、TikTok、Instagram；10,000–1,000,000 |
| 任务结果 | 正常结束，10 位推荐，5 位待核验，23 位排除 |
| 推荐复核 | 10 位的已保存文本均支持当前 KOL 初筛条件；不是其他商品或长期准确率测量 |
| 平台分布 | YouTube 4、TikTok 3、Instagram 3 |
| 来源与耗时 | 分页读取共 108 条来源；267.842 秒，含有限联系补查 |
| 联系方式 | 6 位有作者公开邮箱；其余 3 位有其他公开入口，1 位仅有作者主页 |
| 登录恢复 | 任务后逐个平台冷恢复，三个平台均为 `logged_in`，会话继续加密保存 |

实际推荐为 Prudent Reviews、Rachel \| Finds for Moms、Critical Reviews、Amalia Stehle、Dan Bernstein、BottlePro、Jessica Ciraulo、Pack Hacker Reviews、Micah Giberson、BritHack Hub。完整粉丝、原文与联系方式在工作台推荐表中。

## Gmail 与数据检查

- 已从旧推荐表和新的手动商品推荐表分别选择真实 KOL，完成编辑与本机持久草稿预览；发件邮箱和收件地址与选择一致。多邮箱选择也已通过实际界面验证。
- 本轮三份验证草稿全部取消，单封状态均为 `cancelled`，没有 provider message ID，没有给 KOL 发信。没有重新测试实际投递；原生发送与回读的真实证据继续使用 [2026-10-25 验收](../handoff/evidence/macos-gmail-20261025/summary.json)。
- 原生 Gmail 服务重启后，两份现有邮箱授权可用，旧发送记录与取消记录保留。原发送、暂停、继续、取消、回执与结果未知不自动重发的逻辑继续复用。
- 推荐邮箱按真实工作区、任务版本、Library 推荐分组和作者公开来源核验。交叉冒用另一位作者的邮箱被拒绝；无效邮箱、空内容与空收件人不生成草稿；未授权请求返回 JSON 401。
- 旧 39 个任务、22 份模板及原 10 位验收结果保留；新增工作区使用真实 OneCrew 用户及其 Library tenant/base，旧浏览器快照按新归属重新加密保存。元数据迁移的外键检查通过，首次手动任务重启后可重新读取。
- 应用类型检查、Cloud 网页构建、入口语法检查及 `git diff --check` 通过。邮件确认页桌面与 390 像素宽度检查通过，没有横向溢出。

## 本轮实际修复

手动商品读取器已同时核对真实 OneCrew 用户或原 Shopify 店铺归属，保留 tenant/base 核验。Gmail 输入异常沿用原校验，并返回 400，避免将空内容显示为服务器故障。

首轮手动任务 `694f044c-da1f-45ff-9292-7d8a6a170f7f` 虽产生 10 条推荐，复核有一位简介明确放置商店商品链接和买赠促销的商家，准确性未通过。v42 对 Instagram 简介同时出现数字买赠促销与 `.shop/products/` 商品链接的情况，复用原直接身份核验路径，保留简介原文并暂不推荐；没有增加模型或网络调用。十份原材料回放确认该商家被拦截，其余九份不受此规则影响；随后完成上表真实完整流程，旧任务不改写。

## 私有证据

以下文件在受忽略的 `.scratch`，不上传账号数据、邮箱地址、密钥和运行数据库：

- `manual-product-results-20261027.json`、`manual-product-results-validation-20261027.log`：最新版任务、全部分页结果、逐条原材料和联系人统计。
- `manual-product-v41-results-20261027.json`、`manual-merchant-validation-20261027.log`：首轮准确性问题与真实材料回放。
- `local-owner-validation-20261027.log`、`workbench-mail-api-validation-20261027.log`、`native-mail-input-validation-20261027.log`：真实身份、归属、输入错误及记录检查。
- `manual-workflow-status-20261027.json`、`manual-login-reopen-20261027.json`：最终任务状态、取消草稿和三平台冷恢复。
- `manual-gmail-typecheck-20261027.log`、`manual-gmail-web-build-20261027.log`、`manual-gmail-ui-20261027/`：类型、构建与界面证据。

真实 Shopify 安装、店铺成员权限与远程 HTTPS 部署继续单独验收；本机模式不创建 Shopify 成员，也不展示店铺隐私管理入口。
