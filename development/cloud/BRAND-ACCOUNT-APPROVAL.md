# 商品品牌同名账号处理

状态：用户已批准，已在 onecrew_cloud 实现；不修改公司仓库。

真实 YouTube 任务 `bc2efc67-8ae4-4ef2-9bd4-1e55f81788eb` 将 Owala 自己介绍 FreeSip 并链接自家商店的视频推荐为 KOL。明确账号类型提示后，4B 仍未正确排除。其他个人分享和店铺材料继续分别验证，不能把本轮 7 个程序推荐都当作人工确认的 KOL。

建议只加一条确定规则：读取商品已有的 Shopify `vendor`；作者名称与非空 vendor 在去除首尾空白、忽略大小写后完全相同时，标记为“账号与商品品牌同名，身份待核验”，不进入推荐。保留原文、模型分类和原审核；不直接认定该账号是官方账号。可能将同名个人暂缓推荐，这是该规则的限制。缺少 vendor 的旧记录保持原流程，不猜测品牌。

具体范围：

- `onecrew_lite-app/src/shopify/client.ts`：在现有商品查询中读取 vendor，无新增权限或调用。
- `onecrew_lite-app/src/cloud/campaign-jobs.ts`：商品快照保存 vendor，兼容已保存的旧快照。
- `onecrew_lite-app/src/cloud/campaign-service.ts`、`campaign-scoring.ts`：现有最终结果处理读取所属任务的商品 vendor，应用上述待核验规则，保留模型与证据职责。
- `development/cloud/check-workflow.mjs`、`development/cloud/model/check-score.mjs` 和相关测试：从真实公开商品记录读取 vendor，验证品牌同名、普通作者和缺少 vendor 的旧记录。

真实 Owala 商品 vendor 与实际误判响应回放已通过：最终身份和评分均为待核验，原审核通过；普通作者和缺少 vendor 的旧记录保持兼容。三项回放没有追加模型调用。保持免费 4B、8,192 窗口、单次评分调用、原粉丝条件与 95/85/70/40 分数，不测试 8B，不购买服务，不推送或修改公司 Git。
