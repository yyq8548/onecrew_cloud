# 简化任务粉丝条件审批

状态：用户已批准，代码已接入。粉丝条件的相关本机检查、Linux Cloud 检查及已记录真实响应的回放通过。用户后续要求放宽评分后，v12 的防晒商品与无关工业钻床检查分别返回内容相关和证据不足；同一防晒样本在 1–10 万范围仍按真实 545K 原生区间排除。三项通过原审核，未写入原任务。批量质量、性能和完整业务继续待验收；当前验证记录见 [模型文档](model/README.md#当前评分验证) 与 [服务文档](SERVICE.md)。

## 原因

真实材料含原生粉丝估算 `545K subscribers`，对应 544,500–545,500，整体高于测试条件的 100,000 上限。4B 首次评分约 198 秒，原自动纠正再耗时约 54 秒，仍判为符合条件；原审核两次拒绝，没有写入推荐。证据为 `.scratch/cloud-4b-correction-score.log` 与 `.scratch/cloud-deterministic-followers-replay.log`。

## 已批准的调整

只针对已批准的 Cloud 简化任务，明确以下分工：

- 原代码 `discoveryScale` 判断粉丝范围：可信原生数值在范围内才通过；明确超出范围则排除；缺失或舍入范围跨界则待核验。视频描述里的自报人数不能代替原生粉丝资料。
- 模型继续生成关键词，判断 KOL 身份、商品相关性和内容质量，保留全部真实材料、原质量等级及来源引用。
- 提交审核前，代码合并粉丝判断与模型判断。粉丝数未知时，模型的“符合”最多得到“待核验”，不能进入推荐；商品或 KOL 身份明确不符仍保留不符结论。
- 原身份归属、证据、条件版本、质量和引用审核继续执行。旧格式任务继续沿用原行为；修改后的规则版本进入现有缓存键。

## 具体范围

- `onecrew_lite-app/src/cloud/campaign-scoring.ts`：调整短规则，复用 `discoveryScale` 合并判断，仅接受固定简化条件。
- `onecrew_lite-app/src/discovery/semantic-match.ts`：增加提交前的可选处理入口，Cloud 才提供；保留原审核与最多一次纠正。
- `onecrew_lite-app/src/discovery/runtime.ts`、`onecrew_lite-app/src/cloud/campaign-service.ts`：传入 Cloud 处理函数。
- `development/cloud/model/check-score.mjs` 与相关检查：验证同一真实材料、上下限、舍入范围、未知粉丝数以及旧任务行为。未通过就保留失败。

继续使用当前免费 4B、运行方式、完整证据与五分钟本地检查上限。不购买服务，不修改 Lite、Access 或 Sync，不新增平台读取或伪造 Shopify 商品。

该调整改变了模型与代码的职责，已经取得用户批准。它只解决已经观察到的粉丝条件错误；模型质量、完整 Campaign、真实 Shopify 与四平台验收仍须分别完成。
