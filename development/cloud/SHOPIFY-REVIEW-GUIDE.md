# Shopify审核说明与录屏脚本

更新：2026-10-28，v47。以下英文稿供负责人补齐后填写审核表单，不含凭据；当前未提交。依据[Shopify审核准备](https://shopify.dev/docs/apps/launch/shopify-app-store/best-practices#G.-App-review-preparation)与[审核指南](https://shopify.dev/docs/apps/launch/app-store-review/pass-app-review)。

## 提交前补齐

| 项目 | 状态 |
| --- | --- |
| 专用OneCrew账号 | 待提供，不能复用私人验收身份 |
| 三平台专用测试访问 | 待准备稳定、授权使用的审核方式，避免OTP／2FA／SSO阻塞；不得编造静态码或绕过账号保护 |
| 专用Gmail及自测收件邮箱 | 待准备，仅用自有测试地址进行审核发送 |
| 专用审核店与商品 | 已有开发应用、主测试店；正式审核访问与商品由负责人安排，隐私测试店不可重装 |
| 操作视频链接 | 待按下方脚本实际录制，确保审核可访问 |
| 支持联系人 | 待负责人提供 |

凭据与合法静态验证方式只填写Shopify审核表单的私有测试说明。后台仍要求动态本人操作时，不把该集成标为审核就绪。

## English reviewer instructions

App: **OneCrew Cloud**. The current user interface is in Simplified Chinese. This app helps merchants research creators from public content, review supporting evidence and public contact details, and compose email outreach through a connected Gmail account. There are no app charges in the current version.

The app runs in the Shopify admin. Browsers and the language model run on the service host; merchants do not install a desktop application or browser extension. The standalone website also supports manual product entry. Its personal workspace is separate from a Shopify store workspace.

### Setup and test sequence

1. Install the app in the review store and open it from Shopify admin. Grant the displayed product read permission. The app does not request customer or order read scopes.
2. In **KOL 搜索** (Creator search), select a store product, or choose **手动填写商品** (Enter product manually) and enter its name and main purpose. If an earlier task is displayed, choose **新建搜索** (New search) first. Choose YouTube, TikTok or Instagram and the minimum follower count (default: 2,000). New searches have no upper follower limit. Brand and URL are optional.
3. Open **平台账号** (Platform accounts). Use **打开浏览器** (Open browser) for a platform that requires sign-in. Follow the dedicated test-access instructions supplied privately. Once the platform home/profile page is visible, select **保存并检查** (Save and check). Check that the saved state is shown. Close and reopen the window to check restoration.
4. Select **开始寻找** (Start search). Watch the task phase and saved results. The target is ten qualifying channels across the selected platforms; fewer may be available when sources are exhausted or platform access is limited. Separate channels count separately.
5. Inspect the result table: creator profile, approximate follower count, matching excerpt, **查看原文** (View source), and public contact details. Products of the same type, including competing brands, or directly compatible accessories/use can qualify. The app does not require an exact brand match.
6. Use **补查联系方式** (Find more contact details) if needed. An email may be unavailable; the app can show a public website or social link instead. Reopen the task from **最近任务** (Recent tasks), or save its conditions as a template.
7. Open **邮件** (Mail) and connect the supplied dedicated OneCrew/Gmail test account. Select a sender, enter only the supplied self-test recipient, edit the subject/body and review the preview. Confirm once. Inspect the batch state and Gmail readback receipt. Do not email researched creators during review. For a batch test, use only the supplied self-owned test addresses.
8. Disconnect one test platform from this workspace, then reconnect it with the dedicated test access. Only that workspace's stored platform data should be removed. Use disposable review data for this step.
9. Uninstall and reinstall in the designated review store to check reauthorization and restoration. Uninstall disables the store and revokes its corresponding Cloud mail installation; research data can remain until Shopify's later shop deletion notification. Do not perform this step in the store reserved for privacy-event verification.
10. Open **使用与支持** (Help and support) and the privacy policy from the navigation footer. Both public pages are accessible without signing in to OneCrew. Before submission, replace the privacy preview with the approved policy and supply the support contact.

If a platform requests an unsupported dynamic authentication challenge, stop at that step and contact the supplied reviewer support contact. A prepared review account must cover these features before submission; this document alone does not resolve authentication challenges.

### Data and implementation notes

The Shopify scope is `read_products`; session tokens authenticate embedded requests and product reads also validate the current member's permission. Expiring offline sessions are encrypted, reused while valid, and refreshed on demand. Terminal refresh rejection requires token exchange with a current merchant session. Natural expiry, real refresh-token rotation/rejection, persisted product access and recovery through the live install/product endpoints have been verified; see the internal [verification record](SHOPIFY-TOKEN-LIFECYCLE-2026-10-28.md).

Public creator content and contact details are processed on the service host using a self-hosted Qwen3-4B model. Quotations are copied from saved source material. Results are a research aid; availability, follower observations and classification can vary.

All mandatory compliance webhook topics are configured. A real uninstall has been verified; final real shop-redaction delivery remains pending. Current product-only scopes do not qualify for customer/order event delivery. Do not describe these pending items as passed in the final submission.

## 英文审核录屏脚本

按真实操作录制，使用英文解说或英文字幕；无需制作额外动画。录制前填齐上述专用访问，隐藏密码、邮箱、验证码和授权URL。下列旁白为可用稿，实际视频必须与当时界面一致。

| 画面 | English narration / subtitle |
| --- | --- |
| Shopify后台打开应用 | “Open OneCrew Cloud from Shopify admin. The service runs in your browser.” |
| 选择商品／手填及条件 | “Select a product or enter its purpose, choose platforms and set the minimum follower count.” |
| 三平台连接与保存状态 | “Connect your own platform account in the isolated browser, then save and check the session.” |
| 启动任务、阶段和真实结果 | “Start the search and inspect the saved recommendations. The target is ten channels; availability can vary.” |
| 展开依据、原文与联系入口 | “Review the source excerpt and public contact details before deciding whom to contact.” |
| Gmail编辑与预览 | “Choose a connected sender, edit the message and check recipients in the preview.” |
| 仅自测发送与回执 | “Confirm the self-test message once, then check its sending status and Gmail receipt.” |
| 最近任务与恢复 | “Saved results and platform sessions remain available in the same workspace.” |

不把旧版截图拼成当前功能演示；不把实际等待剪辑成实时速度证明。可选商店宣传视频与必需审核操作录屏分别管理，见[素材清单](SHOPIFY-MEDIA.md)。
