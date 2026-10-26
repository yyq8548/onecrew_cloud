# Shopify 提交材料草稿

状态：本地准备稿，尚未提交或公开发布。功能范围按当前代码和用户批准的简化方案编写；真实店铺、四平台完整流程和评分质量通过验收后才能用于上架。当前证据见 [开发记录](../CLOUD-IMPLEMENTATION.md) 与 [评分验证](model/README.md#当前评分验证)。

## 商店字段

| 字段 | 草稿或当前状态 |
| --- | --- |
| 应用名称 | OneCrew；提交前核对名称可用性及后台配置一致性 |
| 副标题 | 根据商品寻找相关创作者，查看内容依据 |
| 界面语言 | 简体中文 |
| 价格栏目 | 免费；当前没有订阅或收费功能 |
| 应用类型 | 普通嵌入式应用；当前不提供销售渠道、结账或主题修改功能 |
| 申请权限 | `read_products`，用于选择店铺商品和保存本次搜索的商品资料 |
| 客服地址、隐私政策地址 | 待经营主体提供并发布有效地址 |
| 审核入口与凭据 | 待创建开发应用、测试店铺及专用测试账号；凭据单独填写在审核表单，不写进仓库 |

详情文案：

> OneCrew 根据你选择的商品、平台和粉丝范围寻找相关创作者。查看创作者的相关内容、粉丝信息、匹配理由和来源，帮助判断是否适合进一步合作。你可以查看任务进度、停止寻找，并保存搜索条件，在更换商品后再次使用。
>
> 支持范围为 YouTube、TikTok、Instagram 和 X。需要登录或验证时，在应用中的平台登录窗口完成操作。搜索结果取决于平台可访问的内容和设定条件；匹配建议需要结合原始来源判断。

功能条目：

- 从 Shopify 商品开始，选择平台和粉丝范围。
- 查看创作者内容、匹配理由与真实来源。
- 保存搜索条件，更换商品后再次寻找。

对外文案不包含邮件发送、销售效果保证、保证找到足够人数、批量性能承诺或英语界面支持。四平台仍须全部通过真实业务验收；若需要缩减对外范围，按现有要求另行审批。

## 审核操作说明草稿

以下英文说明使用当前中文按钮名称。提交前补齐实际测试商品、平台账号、登录验证方法和可用测试范围，再由真实开发店铺完整执行一次；当前不把这些步骤视作已通过。

1. Install OneCrew through Shopify and open it from the Shopify admin. The interface is in Simplified Chinese. Merchant access is through the browser; there is no merchant-side desktop installation step.
2. Under “平台登录”, use “登录 YouTube”, “登录 TikTok”, “登录 Instagram”, or “登录 X” for the platform being tested. Complete sign-in or verification inside that platform's page, then close the login view. Use the dedicated credentials supplied with the submission.
3. Under “寻找匹配商品的 KOL”, select the supplied test product in “商品”. Choose the platforms and enter “最低粉丝数” and “最高粉丝数”. The total search target is ten creators across the selected platforms.
4. Click “开始寻找”. There is no separate plan-confirmation screen. Follow progress in “最近任务”. Close and reopen the app while the service remains running, then select the same task to inspect its saved progress.
5. Open “结果与证据”. Inspect creator information, content evidence, matching reasons and source links. Verify those against the original platform content. A task can finish with fewer matching creators than its target; pending candidates are not confirmed recommendations.
6. While a task is running, click “停止寻找” and wait for it to stop. If “继续寻找” is available for that stopped task, use it to continue. Stop the task before disconnecting a platform account.
7. Click “保存条件模板”, enter a name and click “保存模板”. Select it through “使用已保存的条件”, choose a different product, then click “开始寻找”. This creates a separate task using the saved conditions.
8. Click “断开” for the tested platform. Reopen its login view and verify that the previous session was cleared. Other stores must remain isolated. Mail authorization and sending are not part of this version.
9. Uninstall the app in Shopify. Confirm that access and running work for that store stop. Reinstall through Shopify and verify authentication again. Store-data erasure is processed through the Shopify privacy deletion event; uninstall alone is not presented as immediate erasure of all business data.

后台验收另需覆盖伪造会话/签名拒绝、跨店铺访问拒绝、隐私事件投递、客户导出领取、店铺删除与备份恢复。执行方法及现有本地证据见 [服务说明](SERVICE.md)，真实投递尚未完成。

## 截图与演示录屏

待真实开发店铺可用后，使用实际界面和实际任务准备以下材料：商品与条件入口、运行进度与停止入口、结果及来源、模板复用。图片只展示需要说明的应用区域，各张展示不同功能，不填写虚构结果或账号信息。

录屏按上面的安装、平台登录、寻找、证据查看、停止和模板复用顺序操作，使用英文讲解或英文字幕。登录密码、验证码和密钥不进入公开素材。英文审核说明不表示应用已支持英语界面。

商店语言、真实界面素材、演示录屏、有效审核凭据和紧急开发者联系人要求依据 [Shopify App Store requirements](https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements)。提交时须按当时的完整要求再次核对。

## 隐私说明的代码依据

这是正式隐私政策的技术资料，不是已发布政策。经营主体、联系方式、运行地区、实际基础设施供应方和保存期限尚未确定。

| 数据 | 当前用途与处理 |
| --- | --- |
| Shopify 店铺、成员身份及访问权限 | 验证请求和店铺归属；成员商品权限用于授权读取。offline session 加密保存，卸载清除访问令牌 |
| 商品 ID、标题、说明、商品链接、更新时间 | 通过 GraphQL 读取；保存搜索采用的商品快照，用于关键词生成和内容匹配 |
| 平台浏览器会话 | 在本店铺所属的服务器浏览器中登录和读取平台；活动目录使用容器内存目录，结束后保存加密快照；断开清理指定平台站点数据和旧快照 |
| 创作者资料、粉丝观察、内容及来源 | 进行商品匹配、展示原始依据和保存搜索结果；按店铺隔离，不将平台公开创作者资料自动视作 Shopify 客户数据 |
| 搜索条件、任务、模板及评分 | 保存进度、结果与条件模板；当前模型使用应用运行环境中的免费 4B，不调用付费模型服务 |
| 隐私请求、导出及处理记录 | 验签后处理 Shopify 事件；请求可能包含客户资料和订单引用。当前未读取 Shopify 客户或订单业务记录，但不能据此声称不处理任何客户资料 |

卸载先停止工作并清除 Shopify 令牌，业务数据在 `shop/redact` 处理时删除。删除后保留带密钥摘要及最小事件处理记录用于去重。客户资料导出由店铺所有者下载并确认领取，确认后清除导出中的个人资料。生产备份保存期限、隐私删除后的旧备份处理和实际删除时限须在发布前确定并验证。

会话、收件和浏览器快照的加密不能表述为全部数据库字段已加密。远程平台登录发生在应用托管的浏览器中；政策应说明会话托管事实。当前没有 Gmail 授权或发送功能。

代码依据：[Shopify 客户端](../../onecrew_lite-app/src/shopify/client.ts)、[安装与隐私存储](../../onecrew_lite-app/src/shopify/installation-store.ts)、[Cloud 服务与数据处理](SERVICE.md)。

## 提交前剩余条件

| 项目 | 尚缺的实际交付或证据 |
| --- | --- |
| 模型质量 | 当前 v15 实时小样本及原文复制、促销待核验规则已验证；尚缺更多真实来源、人工标注、批量质量及延迟验收 |
| Shopify | 开发应用、测试店铺、真实安装/商品/成员权限/隐私投递与卸载重装验收 |
| 平台与业务 | 四平台真实账号的登录、搜索、内容读取、断开，以及完整 Campaign 到结果展示和模板复用 |
| 持续运行 | 可持续提供的 HTTPS/WebSocket 服务、运行资源及生产备份和恢复安排；不自动采购 |
| 商店资料 | 有效客服和隐私地址、经营主体与紧急联系人、实际截图、英文演示录屏及专用审核凭据 |
| 提交操作 | 填写真实应用配置、完成 Shopify 检查，并按工作区发布流程执行提交 |
