# 搜索与匹配开发暂停记录

此暂停已由用户后续“继续吧”解除。当前二元实现、真实验证和公司合并状态见[二元匹配](../cloud/BINARY-MATCHING.md)和[基础功能状态](../cloud/BASIC-FUNCTION-STATUS.md)；下文保留暂停时的实际状态。

2026-10-26。用户要求暂停并保存进度。Goal 为 `paused`；用户明确恢复前不继续开发、模型检查、平台搜索或发信。当前只更新交接文档，代码和真实运行数据保留。

## 用户最后确认的要求

- 结果简化为“符合／不符合”，原来高于 40 分的条件才推荐，40 分及以下不推荐；界面不再显示分数。
- 检查并减少影响匹配准确性、处理速度的不必要步骤，保持作者归属、粉丝范围和原文核实。
- 只改 `onecrew_cloud`，保持简单、免费 4B、Metal、8,192 窗口，不增加模型调用；公司 Git 新增改动仍先审批，X 继续暂缓。

**二元结果尚未实施。** 当前源码仍为 v25 分类和 95／85／70／40 分映射，界面仍显示分数。此前“所有评分等级零关键词转待核验＋独立缓存版本”的提案已被用户的新要求取代，没有批准或实施。

## 当前代码与已完成能力

| 部分 | 当前实现 |
| --- | --- |
| 搜索 | 同一次 4B 请求生成每平台 2 个商品词、4 个品类／用途词；每词最多 20 条，默认全局 10 位，达到目标后停止后续搜索。词用完时保存实际结果及不足原因。新关键词避免四个备用词都只是杯盖、吸管等特征变体。 |
| Instagram | 保留搜索命中的帖子及作者绑定，复用已有内容读取；每词读取上限已由 5 帖调整为最多 20 帖，已构建浏览器镜像并实际运行。 |
| 评分 | 4B 分别选择身份和商品原文的段落编号，代码复制原文；复用已有英文停用词和词形处理，弱关联且零有效词时待核验。完整材料留库，原粉丝代码判断、审核与引用核对保留。 |
| 商家与优惠 | 已批准的品牌同名、私信下单、店铺库存提示、完整优惠句、Instagram 类别及店铺开业线索、TikTok 批发／零售、Shop Online、sold worldwide 等有限规则均已实现。覆盖范围有限，仍有实际误判。 |
| 联系方式 | 推荐先写入 Library，再为缺少已确认公开邮箱的作者有限补查；每人最多两页、总共最多 20 页，找到邮箱即停。保留手动入口和来源。界面明确标记归属待核实的联系信息。 |
| 登录与界面 | 加密保存会话，保存后执行一次实际登录探针，显示状态、核验时间、原始尺寸和全屏。私有验证页修复旧授权地址和非 JSON 的 401 提示。 |
| 数据合同 | TikTok 真实读取暴露的 `nativeContentObservations` 合同缺口已修复，应用和合同复用同一 schema，保留实际观测字段。 |
| 基础功能 | Campaign、Library、条件模板、停止／恢复、请求幂等、关闭重开、证据和联系人持久化已有真实流程证据。Gmail 先前已完成本人授权、一封明确批准的自发自收和回读；本轮没有发信。 |

本轮应用类型检查、受影响的 10 项关键词／评分检查及 Cloud 网页构建通过。这些结果对应当前分数版本；尚不存在二元结果版本的实现或通过证据。

## 真实流程结果与限制

| 对应版本与平台 | 真实结果 | 当前结论 |
| --- | --- | --- |
| v20 YouTube | 4 次搜索、80 条来源、31 位候选；10 位程序推荐、2 位待核验、19 位排除，约 240.7 秒。6 位有公开邮箱，自动处理 10 个联系页面。 | Library、模板、幂等与关闭重开通过；作为该版本的完整参考，不代表新二元规则已验收。 |
| v21 Instagram，20 帖读取 | 6 次搜索、44 条来源、40 位候选；7 位程序推荐、5 位待核验、28 位排除，约 527.9 秒。2 位有公开邮箱，联系处理 6 页。 | 7 位中发现 2 个明确商家；对应补充规则后续已获批并通过真实材料检查。尚无全部新规则下的新完整任务，未达到 10 位。 |
| v23 TikTok | 因真实误判中止，47 位候选中程序标记 8 位推荐、5 位待核验、34 位排除；约 428.4 秒。 | 8 位中发现 2 个商家和 2 份无关内容；属于失败记录，不能列为 8 位合格 KOL。 |

最新 v24 五份真实材料检查整体未通过；v25 两份真实检查仍未通过。戒瘾／恢复内容被 4B 判为“商品使用场景”、70 分，所选原文有效词为 0。另一份水杯内容在 v25 为 40 分；按用户最新要求，这类弱关联以后不推荐。没有通过重试挑选成功结果，没有把人工改写的响应当作模型输出。

证据目录为 [search-score-login-20261026](evidence/search-score-login-20261026/)，关键记录：

- [YouTube v20 完整任务](evidence/search-score-login-20261026/v20-workflow-summary.json)
- [Instagram v21 完整任务及已知误判](evidence/search-score-login-20261026/instagram-v21-final-summary.json)
- [TikTok v23 中止及已知误判](evidence/search-score-login-20261026/tiktok-v23-interrupted.json)
- [v24 五份检查](evidence/search-score-login-20261026/weak-keyword-merchant-regressions-v24.json)、[v25 两份检查](evidence/search-score-login-20261026/neutral-prompt-regressions-v25.json)
- [两组新关键词的真实 4B 输出](evidence/search-score-login-20261026/category-use-keywords-v2.json)

## 登录状态与尚未解决的问题

最新独立冷恢复检查：YouTube、Instagram 为 `logged_in`，TikTok 为 `unknown / auth_signal_unavailable`。TikTok 实际恢复后只剩 9 条 Cookie，没有 `sid_guard`、`sid_tt`、`sessionid`、`sessionid_ss`；页面上下文也没有本人身份。此前成功登录时存在的 4 条认证 Cookie 是持久 Cookie。丢失发生的具体环节尚未确定，不能简单归因于探针或会话 Cookie。

私有证据：`.scratch/search-score-login-post-image-auth.log`、`.scratch/tiktok-post-image-auth-diagnosis.log`、`.scratch/tiktok-before-save-current.log`、`.scratch/tiktok-current-full-probe.log`。下次在准备好记录后，由本人重新登录 TikTok 一次，对比保存前、保存后和冷恢复，不重复要求登录已经通过的 YouTube／Instagram。旧的三平台全部登录成功记录只证明当时状态。X 按用户要求暂缓。

## 本机保留与停止状态

- 本轮模型 PID `99005` 已确认是 Cloud 私有目录内的 4B Metal 服务，并已发送正常终止信号。暂停期间不继续模型验证。
- 登录验证页 `50032` 已停止，旧标签 `/?session=79982` 不能作为当前验证入口。现有 Gmail 工作台 `50031` 保留；公司本地验证服务没有改动。
- 私有完整数据在 `.scratch/basic-workflow-20261025`；真实商品输入在 `.scratch/workflow-product.json`。保留整个数据目录、加密快照和配套密钥，不上传公开 GitHub，不复制到 Lite。
- 当前浏览器镜像 `3afa092013f7`，标签 `worker`、`instagram-20-20261026`；上一版 `d0265eeb20b1`，标签 `worker-previous`、`search-reuse-20261026`。已确认无引用的更旧 `6b9ca238` 镜像及重复候选标签已清理；当前、上一版及账号数据保留。
- Cloud 修改仍在本地工作区，没有在本轮提交或推送。只更新 Cloud 文档，未修改 Lite 或公司仓库，未合并、部署或发信。
- 公司 [Access !30](https://git.digifinex.org/onecrew/onecrew-access/-/merge_requests/30)、[Sync !7](https://git.digifinex.org/onecrew/onecrew-admin/-/merge_requests/7) 等待 River；已有交付见 [MR 交接](RESUME-2026-10-26.md)。本次暂停没有查询或改变远端状态。

## 用户恢复后的顺序

1. 按用户已明确要求改成二元匹配；删除模型选分数等级和界面分数，40 分条件不推荐。检查无需模型判断的空材料、已明确商家及重复输入是否仍浪费调用，保持原文与作者核实。
2. 更新受影响的真实验证入口，用已保存的明确商品正例、无关内容和商家材料验证，再跑新完整任务。旧结果按原版本保留，不强行修改历史或凑满 10 位。
3. 在独立数据锁空闲、验证页已准备好时处理 TikTok 本人登录与保存对照；完成后再跑 TikTok。Instagram 可先复用其实际登录继续验证。联系方式补查保持原有上限。
4. 更新基础功能验收结果；真实 Shopify、四平台最终验收、持续运行与上架资料继续保持未完成。新增方案、费用、关键权限或公司修改先审批。

跨电脑接续携带 [工作约定](WORKSPACE-RULES.md) 和 [发布流程](../../docs/release/合并与部署流程.md)。运行数据、权重、原生依赖和密钥不随 Git 迁移；按现有私有备份流程另行准备。
