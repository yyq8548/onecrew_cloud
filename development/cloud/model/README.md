# 免费模型本地运行

当前仅使用免费 4B，用户已明确要求不再测试 8B。评分复用已有关键词，模型选择段落编号，代码复制原文、映射分数，并按已批准规则将合作或优惠摘录置为待核验；真实响应回放见[当前评分验证](#当前评分验证)。下文 CPU、旧提示词和 8B 结果仅记录对应版本的运行证据。

用户已批准改用 Qwen3-4B 的 Q4_K_M 权重，来源为 [Qwen 官方模型](https://huggingface.co/Qwen/Qwen3-4B-GGUF/tree/bc640142c66e1fdd12af0bd68f40445458f3869b)，Apache-2.0。固定文件 `Qwen3-4B-Q4_K_M.gguf`，大小 2,497,280,256 字节，SHA256：

```
7485fe6f11af29433bc51cab58009521f205840f5b4ae3a32fa7f92e8534fdf5
```

权重保存在受忽略的独立目录，不提交仓库。下载后核对大小与 SHA256，再命名为上述文件名；许可证随权重保留。官方 llama.cpp CPU 镜像按摘要固定，不运行模型 API 付费服务。

```sh
ONECREW_MODEL_DIRECTORY=/absolute/path/to/models docker compose -p onecrew-cloud-model -f development/cloud/model/compose.yaml up -d
node development/cloud/model/check-model.mjs
```

当前 Cloud 使用简化入口，代码固定平台、粉丝范围及目标数量，模型仅生成短关键词并执行原商品匹配评分。用户另已批准[本机 Metal GPU 验证](METAL-LOCAL-APPROVAL.md)，使用方法与结果见本文末尾；Linux CPU 配置保留。关键词检查接受明确的本地商品文字输入，不代表 Shopify 网络读取：

```sh
node development/cloud/model/check-keywords.mjs 'Insulated stainless steel water bottle' 'Reusable insulated bottle for carrying water on hikes and daily commutes.' youtube
```

第三参数可选择逗号分隔的 `youtube,tiktok,instagram,twitter`。原 `check-model.mjs` 可传本地需求测试继承的完整规划器，用于记录基线；当前 Cloud 创建任务不调用该完整规划器。模型端点为 `http://127.0.0.1:8789/v1/chat/completions`，只发布到本机回环地址；模型文件只读，CPU 单并发，关闭模型网页与 slots 管理接口。

原商品匹配评分可以使用已保存的真实 YouTube 材料单独检查：

```sh
node development/cloud/model/check-score.mjs <真实材料数据目录> <Campaign-ID> <hit-ID> 'Daily sunscreen' 'Sunscreen for daily skin care and sun protection.'
```

脚本使用已批准的 Cloud 短评分规则，复用原结构化结果和来源引用校验，保留原始创作者材料与明确的本地商品文字；测试条件为 YouTube、粉丝 10,000–100,000、商品内容相关性。调用前核对新旧规则的候选输入、证据编号及引用一致，检查缓存隔离和旧格式条件路由。结果只在内存中校验，不写回原任务、不新增平台读取，也不证明 Shopify 商品来源、完整业务执行或人工质量验收。默认最多等待五分钟，失败以非零退出并保留日志。

当前 8192 上下文是本机运行检查配置；原始请求或证据超出容量时应明确失败，不截断输入。最终上下文、并发、质量与延迟须按方案的真实样本验收确定。原方案 50 份需求样本按已批准的新入口表达为商品、平台、粉丝范围输入；100 份人工评分样本与 P95 门槛仍需实际证据，一次结构化调用成功不足以证明通过。

验证后停止模型以释放内存：

```sh
ONECREW_MODEL_DIRECTORY=/absolute/path/to/models docker compose -p onecrew-cloud-model -f development/cloud/model/compose.yaml stop
```

## 8B 基线

原 8B 权重继续保留：官方提交 `7c41481f57cb95916b40956ab2f0b139b296d974`，文件 `Qwen3-8B-Q4_K_M.gguf`，大小 5,027,783,488 字节，SHA256 `d98cdcbd03e17ce47681435b5150e34c1417f50b5c0019dd560e4882c5745785`。原名称为 `onecrew-qwen3-8b-q4`，版本为 `Qwen-7c41481f-Q4_K_M:d98cdcbd:llama-8c74db29`；其余运行参数与当前配置相同。

2026-10-23，本机 Docker Linux arm64、8 个 CPU、约 7.75 GiB 可见内存。固定官方镜像报告 build 11804、commit `c7fc50941`。模型按上述配置实际启动，健康端点返回 200；权重大小和 SHA256 已核对。

通过原 `ServerSemanticClient` 返回四平台 JSON，耗时 13,346 毫秒，输入 63 token，输出 19 token。随后使用原 `DiscoverySemanticPlanner` 处理本地防晒产品需求；完整规划在五分钟 HTTP 等待后出现 `UND_ERR_HEADERS_TIMEOUT`，未生成经审计的计划，尚未达到方案的规划延迟目标。运行中记录到约 5.776 GiB 内存、约 570% CPU 占用。

适配器现已将请求超时和 HTTP 等待超时归为 `semantic_timeout`，与平台读取失败区分；同一真实模型端点的短超时检查已验证修复。证据保存在受忽略的 `.scratch/model-check.log`。测试结束后模型容器已停止，权重和许可证保留。

原容器日志进一步确认，完整规划请求在提示词处理阶段用时 249.32 秒处理了 2,048 token，进度为 32%，速度为 8.21 token/秒；超时时尚未进入输出生成。固定镜像架构为 Linux arm64，容器记录 `OOMKilled=false`。简单请求的输入处理速度为 8.47 token/秒，输出速度为 3.11 token/秒。原服务日志保存在受忽略的 `.scratch/model-server-diagnosis.log`。

按已批准的简化入口，使用同一模型、上下文与 CPU 配置执行 `check-keywords.mjs`：上述水瓶商品文字与 YouTube 单平台输入共 158 token，输出 39 token，耗时 26,236 毫秒，成功生成 3 条商品相关查询。证据为 `.scratch/cloud-short-keywords.log`。该结果验证当前短请求能完成；四平台查询质量、完整商品评分耗时及批量 P95 尚待验证。测试后已停止模型容器。

同一商品文字选择全部四个平台的真实请求也已通过合同校验：输入 166 token，输出 156 token，耗时 58,161 毫秒，每个平台返回 3 条关键词，平台集合完整。证据为 `.scratch/cloud-four-platform-keywords.log`。上述两次均为单次测量，耗时仅覆盖关键词生成；实际平台搜索、商品评分和人工质量验收仍待完成。模型容器已停止。

原商品评分请求已使用保存的真实 YouTube 描述及本地防晒商品文字实测：原规则 10,000 字节、候选输入 4,455 字节、3 项证据。输入处理约 239.57 秒完成 2,048 token（58%），请求在五分钟超时后退出，未返回评分。证据为 `.scratch/cloud-product-score.log` 与 `.scratch/cloud-product-score-server.log`。

按用户批准的[简化评分规则](../SCORING-PROMPT-APPROVAL.md)，8B 测试规则减为 1,826 字节，保留同一真实证据及引用；候选请求为 4,481 字节。调用前的材料一致性、引用编号、缓存隔离与旧条件路由检查通过。最终实测约 237.16 秒处理完 2,048 token（96%），随后进入输出，但五分钟时仍未完成评分；没有审核回执写回原任务。日志为 `.scratch/cloud-compact-product-score.log` 与 `.scratch/cloud-compact-score-server.log`。

8B CPU 评分性能未通过。用户已批准[模型调整](MODEL-SIZE-APPROVAL.md)，当前配置已切换为 4B。

## 4B 验证结果

官方 4B 权重大小与 SHA256 已核对，8B 文件保留。沿用同一 CPU、内存、上下文、镜像与非思考模式。四平台关键词请求耗时 32,777 毫秒，输入 166 token、输出 139 token，生成 12 条关键词并通过结构校验；8B 同样输入耗时 58,161 毫秒。这是单样本对比，不是批量延迟结论。证据为 `.scratch/cloud-4b-keywords.log`。

同一真实 YouTube 材料包含原生粉丝估算 `545K subscribers`，区间为 544,500–545,500，高于测试上限 100,000。首次评分约 206 秒返回，仍把候选判为符合条件，原审核抛出 `selection_quality_required_count_invalid`。使用 1,936 字节细化规则后，完整候选仍为 4,481 字节；复测输入 2,145 token、输出 197 token，耗时 220,212 毫秒，仍出现同一审核错误。两次均未写入评分或推荐，未缩减证据或放宽审核。日志为 `.scratch/cloud-4b-product-score.log`、`.scratch/cloud-4b-explicit-count-score.log` 和 `.scratch/cloud-4b-final-server.log`。

模型切换已完成，当前真实评分质量未通过。真实账号、完整业务、批量质量与延迟验收继续保持未完成。

随后把原评分器的纠正请求构造提取复用，检查脚本对已知粉丝条件错误最多纠正一次，两次共用五分钟上限。真实首次输出耗时 198,339 毫秒，被原审核拒绝；纠正后在总计 252,480 毫秒返回，仍错误地判定符合粉丝条件，原审核再次拒绝。结果未提交，没有新增平台读取。证据为 `.scratch/cloud-4b-correction-score.log` 与 `.scratch/cloud-4b-correction-server.log`。这是原请求构造与审核的组件验证，没有覆盖完整 Campaign 的事务、回执和调度。模型容器已停止。

[粉丝条件职责调整](../DETERMINISTIC-FOLLOWERS-APPROVAL.md)已获批准并接入。用日志中保存的真实 4B 响应回放，代码按原生区间正确排除该候选，原审核通过，未提交原任务，也没有调用模型。证据为 `.scratch/cloud-deterministic-followers-replay.log`。这验证条件合并，不是新提示词的模型复测。

`check-score.mjs` 的第六参数可传已保存的真实响应 JSON，仅回放、不调用模型；第七、八参数可指定测试粉丝下限与上限。实时模型模式使用空的第六参数。默认仍为 10,000–100,000；实际材料和观察数值不改变，测试条件单独标明。

当前简化任务的输出合同将 `evidence_ids` 限定为该候选已保存的编号，列表长度不超过实际编号数及原上限 8；规则要求编号不重复。首次请求与原纠正请求共用该合同，旧格式任务保留原合同。原引用、重复编号、作者归属和条件审核继续执行，不修改或补齐模型输出。该约束解决了真实模型引用商品背景编号的问题，原始记录为 `.scratch/cloud-followers-live-score.log`；合法编号枚举单独使用时仍曾出现重复引用，记录为 `.scratch/cloud-evidence-ids-live-score.log`。

最终规则 2,113 字节，完整候选仍为 4,481 字节、3 项证据。以明确标注的本地测试范围 500,000–600,000 和同一真实 YouTube 材料调用 4B：输入 2,180 token、输出 266 token，约 201,264 毫秒完成，无纠正，通过原引用与条件审核。未写入原任务、未新增平台读取；模型已停止。证据为 `.scratch/cloud-evidence-ids-distinct-live-score.log` 和 `.scratch/cloud-evidence-ids-distinct-server.log`。本机最终 11 项合同、粉丝条件与原评分检查通过，见 `onecrew_lite-app/.scratch/cloud-evidence-final-tests.log`。

此前 v3 短规则保留原质量等级，明确 95 分必须引用额外优势，普通类别相关对应 85 分，理由使用中文。完整候选仍为 4,481 字节、3 项证据，没有更换模型或截断材料。

- 防晒商品样本：规则 2,301 字节，输入 2,216 token、输出 244 token，227,718 毫秒通过原审核，无纠正；返回中文理由与 85 分。证据为 `.scratch/cloud-score-quality-v3.log`。
- 同一真实护肤材料与明确标注的本地工业立式钻床输入：规则 2,304 字节，输入 2,227 token、输出 191 token，234,188 毫秒通过原审核，无纠正；返回商品相关性证据不足、质量未知，没有推荐。该次运行期间另有浏览器构建及本机类型检查，不用于性能对比。证据为 `.scratch/cloud-score-quality-v3-unrelated.log`。

两次均未写回原任务，没有新增平台读取。模型日志为 `.scratch/cloud-score-quality-v3-server.log`，检查后模型已停止。本机类型检查及 12 项相关检查通过，证据为 `.scratch/cloud-score-v3-typecheck.log`、`onecrew_lite-app/.scratch/cloud-score-v3-tests.log` 和 `onecrew_lite-app/.scratch/cloud-score-v3-original-tests.log`。

内容质量仍待验收：中文理由仍超过短句要求，防晒理由对“具体步骤和使用场景”的概括也需人工复核；原材料是护肤视频标题和含 SPF 清单的说明。两条样本不能证明批量准确性、完整 Campaign 成功或 P95 达标。粉丝超上限的真实响应回放与缺失、边界不确定的合同检查继续保留。

## 本机 Metal GPU 运行与验证

本机 Apple M1、16 GiB 内存。采用官方 [llama.cpp b11804](https://github.com/ggml-org/llama.cpp/releases/tag/b11804) 的 `llama-b11804-bin-macos-arm64.tar.gz`，提交 `c7fc5094179bf8a9c73c18593db714f8da41a402`，与 CPU 容器报告一致。运行包 16,145,423 字节，SHA256 与官方发布元数据一致：

```
f54ecd2d9a552a1b4b55ba6ecad51694ce8e737e61061bbbe28fc71507777985
```

运行包和许可证保存在 `.scratch/llama-macos-b11804/`，没有全局安装。4B 权重已再次核对本文开头的 SHA256。官方程序实际报告 `MTL0: Apple M1`。启动日志确认 37/37 层加载到 GPU，模型缓冲约 2,375.91 MiB、KV 缓冲 1,152 MiB、计算缓冲 102.33 MiB。证据为 `.scratch/model-metal-score-server.log`；这不是进程峰值内存统计。

在仓库根目录、原 CPU 模型已停止时启动：

```sh
sh development/cloud/model/start-metal.sh "$PWD/.scratch/llama-macos-b11804/llama-b11804/llama-server" "$PWD/.scratch/models/Qwen3-4B-Q4_K_M.gguf"
```

该入口仅用于 macOS arm64 本地验证，显式选择 MTL0，监听 `127.0.0.1:8789`，保持 8192 上下文、单并发、非思考模式。结束时用 Ctrl+C 停止。Linux 浏览器和服务仍使用当前 Docker 配置。检查脚本默认 CPU；Metal 检查需要显式设置运行方式：

```sh
ONECREW_MODEL_RUNTIME=macos-metal node development/cloud/model/check-keywords.mjs 'Insulated stainless steel water bottle' 'Reusable insulated bottle for carrying water on hikes and daily commutes.' youtube,tiktok,instagram,twitter
```

`check-score.mjs` 使用相同环境变量和既有参数。Metal 模型版本身份为 `Qwen-bc640142-Q4_K_M:7485fe6f:llama-c7fc509-macos-metal`，与 CPU 身份不同；将本地 Cloud 服务连接到此模型时，也应通过已有的 `ONECREW_MODEL_REVISION` 配置此版本，避免沿用 CPU 评分缓存。

实际检查结果：

| 检查 | Metal 耗时 | 结果 |
| --- | --- | --- |
| 同一水瓶输入、四平台关键词 | 8,137 毫秒 | 166 输入、143 输出 token，全部四平台共 12 条查询 |
| 完整真实护肤材料与防晒商品，粉丝范围 50–60 万 | 24,485 毫秒 | 2,216 输入、209 输出 token，85 分，通过原审核，无纠正 |
| 同一材料与无关工业钻床 | 23,805 毫秒 | 2,227 输入、228 输出 token，相关性证据不足、质量未知，通过原审核，无纠正 |
| 同一防晒样本，粉丝范围 1–10 万 | 23,691 毫秒 | 2,214 输入、229 输出 token，代码按真实原生区间排除，原审核通过，无纠正 |

证据为 `.scratch/cloud-metal-keywords.log`、`.scratch/cloud-metal-score-related.log`、`.scratch/cloud-metal-score-unrelated.log`。完整候选仍为 4,481 字节、3 项证据，商品文字明确作为本地输入；没有写回原任务或新增平台读取。防晒评分日志记录输入处理 12.78 秒、约 173 token/秒，输出约 17.85 token/秒。

粉丝超上限检查证据为 `.scratch/cloud-metal-score-followers.log`。模型质量字段仍给出 95 分，理由仅为产品相关和商品链接，未说明原等级要求的额外优势；代码正确排除该候选，未写入结果。这个检查证明粉丝条件合并生效，同时表明最高分判断仍不稳定。

CPU 对应前三项单样本约为 32.8 秒、227.7 秒和 234.2 秒；GPU 数值计算产生的输出文本与长度有所变化。上述结果表明本机单条检查明显加快，仍不能证明批量 P95、100 份人工质量样本、真实 Shopify 或完整 Campaign 验收通过。理由仍偏长，最高分理由不足，模型质量保持未通过。检查结束后原生模型进程已停止，权重、运行包和日志保留。

## 8B Metal 对比结果

以下是[已结束的对比](METAL-8B-COMPARISON-APPROVAL.md)，用户最新要求不再测试 8B。该次复用保留的权重，核对上述 SHA256，沿用 b11804、8192 上下文、单并发和非思考模式。8B 版本身份为 `Qwen-7c41481f-Q4_K_M:d98cdcbd:llama-c7fc509-macos-metal`，与 4B 分离，应用默认配置没有切换。

同一 v3 规则、完整候选 4,481 字节和 3 项真实证据的结果：

| 检查 | 耗时 | 结果 |
| --- | --- | --- |
| 同一水瓶输入、四平台关键词 | 16,159 毫秒 | 166 输入、168 输出 token，全部四平台共 12 条查询 |
| 护肤材料与防晒商品，粉丝范围 50–60 万 | 35,773 毫秒 | 2,216 输入、140 输出 token；误判缺少相关内容，条件判为不符合且无引用，原审核拒绝 |
| 同一材料与无关工业钻床 | 31,975 毫秒 | 2,227 输入、144 输出 token；没有推荐，但条件判为不符合且无引用，原审核拒绝 |
| 同一防晒样本，粉丝范围 1–10 万 | 33,790 毫秒 | 2,214 输入、142 输出 token；代码正确排除超上限候选，原审核通过；模型仍误判缺少相关内容 |

前两项实际审核错误均为 `review_requirement_citation_invalid`，检查以非零状态结束。第三项最终校验总耗时 33,812 毫秒；通过粉丝条件审核不能证明商品判断正确。原材料包含护肤标题及 SPF 产品清单，8B 对相关商品的判断仍漏掉这些内容。

日志为 `.scratch/cloud-metal-8b-keywords.log`、`.scratch/cloud-metal-8b-related.log`、`.scratch/cloud-metal-8b-unrelated.log`、`.scratch/cloud-metal-8b-followers.log`。启动日志 `.scratch/model-metal-8b-server.log` 确认 37/37 层加载到 GPU，Metal 模型缓冲合计约 4,455.34 MiB、KV 缓冲 1,152 MiB、计算缓冲 112.01 MiB；这些数值不是进程峰值内存。

本组样本没有显示 8B 的速度或准确性优势，默认保留 4B，评分质量继续保持未通过。检查没有写回原任务、新增平台读取或调用 Shopify。结束后 8B 进程已停止；现有权重、运行包、许可证和必要日志保留，没有产生新的 Docker 镜像或购买服务。

## v12 评分证据

用户要求适当降低评分标准后，Cloud v12 按[当前品类与使用场景规则](../SCORING-PROMPT-APPROVAL.md#当前简化标准)判断，不要求实际使用效果、同一商家品牌、原创、合作经历、字幕或多条内容。保留 95/85/70/40 与未知等级、完整证据和原审核。默认仍为同一免费 4B，运行身份与上述 Metal 4B 一致。

模型先输出证据编号，再输出结论与理由；字段名称和含义保持不变。条件数组的长度及编号上限从保存的任务条件生成，防止模型添加不存在的筛选条件；原条件审核继续执行。旧格式任务仍使用原合同。`check-score.mjs` 对不允许纠正的错误直接抛出原审核错误。已保存真实模型多生成一条条件的响应为 `onecrew_lite-app/tests/fixtures/cloud-score/extra-requirement.json`，对应回归检查通过。

同一完整 YouTube 材料为 4,481 字节、3 项证据，所有商品文字仍明确作为本地测试输入：

| 检查 | 模型耗时 | 结果 |
| --- | --- | --- |
| 防晒商品、粉丝范围 50–60 万 | 23,421 毫秒 | 2,284 输入、181 输出 token；内容相关、95 分，引用视频说明 e2 和标题 e3，原审核通过 |
| 工业立式钻床、粉丝范围 50–60 万 | 19,225 毫秒 | 2,295 输入、145 输出 token；相关性不足、质量未知，未推荐，原审核通过 |
| 防晒商品、粉丝范围 1–10 万 | 20,898 毫秒 | 2,282 输入、172 输出 token；内容相关、95 分，引用 e2/e3；代码按真实 545K 粉丝区间排除，原审核通过 |

三次均无纠正，没有写回原任务、增加平台读取或调用 Shopify。相关样本理由使用中文，引用覆盖说明与标题；无关样本仍附带粉丝信息，但没有凭粉丝数认定内容相关。样本核对脚本检查最终入选状态、评分、中文及相关样本的说明引用，三项通过；它不代替人工批量验收。

证据为 `.scratch/cloud-metal-v12-related.log`、`.scratch/cloud-metal-v12-unrelated.log`、`.scratch/cloud-metal-v12-followers.log`；服务器日志为 `.scratch/model-metal-v7-server.log`，同一进程用于本轮验证后已停止。本机 9 项相关检查通过，日志为 `onecrew_lite-app/.scratch/cloud-score-v12-tests.log`。关键词流程未修改，已有验证继续适用。

随后通过原 YouTube 搜索和内容读取取得 Prudent Reviews、BottlePro 两位创作者的真实水杯内容。4B v12 对水杯商品分别在 25,025、26,529 毫秒返回 95 分，中文理由和引用通过核对；同一 Prudent Reviews 视频中的洗衣液赞助感谢则在 21,612 毫秒被误判为直接相关、95 分。格式审核未发现这项语义错误，因此内容质量保持未通过。

完整材料见 `.scratch/water-bottle-material-inspection.jsonl`，结果见 `.scratch/cloud-v12-prudent-water-bottle.log`、`.scratch/cloud-v12-bottlepro-water-bottle.log`、`.scratch/cloud-v12-prudent-incidental-ad.log`。后续提示词试验没有稳定解决主要内容与夹带广告的区分，未替换当前 v12。所有模型进程已停止，当前源码与已通过 44 项 Linux 检查的镜像中的评分文件 SHA256 一致。

上述样本不代表批量准确性、P95、真实 Shopify 安装或完整四平台业务通过。

## 当前评分验证

用户已批准[关键词复用、段落编号与代码复制原文](../QUOTED-REASON-APPROVAL.md)及[合作或优惠摘录待核验规则](../PROMOTIONAL-EXCERPT-APPROVAL.md)。当前 paragraph classification v15 使用完整候选材料，关键词只辅助选择摘录；最相关五段及各来源开头和标题组成可选编号，没有命中时保留全部段落。模型输出内容关系、段落编号、创作者身份，代码取回逐字原文及所属证据，生成中文等级说明，并保留原 95/85/70/40 映射、粉丝预筛选和审核。命中两个已批准促销表达的正向评分置为待核验，不生成分数。

当前 v15 已在本机同一免费 4B Metal 模型上完成实时小样本验收。使用完整保存的真实材料及明确标注的本地商品输入，没有 Shopify 网络调用、平台重新采集或评分写回。五项评分均一次调用，另有一次零模型的粉丝预筛选：

| 真实材料与输入 | 耗时 | 内容分类与结果 |
| --- | --- | --- |
| Prudent Reviews 水杯视频，商品为水杯 | 17,913 毫秒 | 引用真实 Owala 水杯商品清单，70 分，原文还原与审核通过 |
| BottlePro 水杯视频，商品为水杯，粉丝范围 1–10 万 | 18,785 毫秒 | 引用作者实际测试 22 款水杯及防漏、保温等测试项目的原文，70 分，原审核通过 |
| Prudent Reviews 水杯视频，商品为赞助品牌 Laundry Sauce | 13,844 毫秒 | 模型仍判为品类相关，但代码根据所选合作及优惠原文置为待核验、不评分 |
| 护肤视频，商品为防晒，粉丝范围 1–100 万 | 14,351 毫秒 | 引用真实护肤视频标题，40 分，原文还原与审核通过 |
| 同一护肤视频，商品为工业钻床 | 12,680 毫秒 | 证据不足，不评分，保持待核验 |
| 同一护肤视频和防晒商品，粉丝范围 1–10 万 | 无模型调用 | 代码按真实粉丝区间提前排除，不评分 |

本次实时记录为 `.scratch/v15-live-20261024-a/{water,bottlepro,ad,sunscreen,unrelated,followers}.log`，汇总为 `.scratch/v15-live-20261024-a-status.log`。五次实际评分耗时 12.7–18.8 秒，中位数 14.4 秒，合计输入 14,424 token、输出 100 token；没有纠正或重试，原材料及原任务调用计数不变。测试模型已正常停止。检查脚本为 `.scratch/check-v15-live.sh`，复用现有 `check-score.mjs`，逐项核对最终推荐状态和真实原文，不强制重复旧模型标签。

本组只有三位独立作者、四种本地商品目标与五次实际评分，不能替代约定的广泛输入、人工标注、等级一致率或批量 P95 验收；也没有执行完整 Campaign 或 Shopify 安装流程。旧版长文本规划与条件提取已由用户批准的固定输入流程替代，不恢复旧模型或旧规划入口。

此前 `.scratch/cloud-promo-{ad,water,sunscreen,unrelated,followers}-verified.log` 的真实响应回放仍作为代码规则回归证据。本次实时广告样本再次确认：保护效果来自已批准的代码规则，模型本身仍会误判。该保守规则只覆盖两个批准表达，即使同段有有效商品介绍也先待核验，其他表达继续由原模型判断。批量人工质量与完整业务验收仍未完成。

客户端仅调整外层数字解析。真实 4B 短请求、5 项解析合同检查、本机与 Linux 类型检查、全部 49 项 Cloud Linux 检查通过；9 次短请求未复现原偶发小数字段。真实响应与派生边界输入在测试中明确区分，不声称已捕获原故障字段。业务内容仍使用原严格 JSON、输出 schema 和审核。当前验证镜像为 `linux-quoted-client`（`9eed979e5829`），没有替换默认版本。

粉丝超限的测试不应调用模型。`check-score.mjs` 复用 `discoveryRequiredCountFindings`，与 matcher 的实际预筛选一致；超限时验证原审核及材料未改变，报告 `modelCalled: false`。原约定的不同品类、人工标注、批量质量与 P95 验收继续待完成。

当前两份 Cloud 源码只读挂载到 `linux-quoted-client`（`9eed979e5829`）后，Linux 类型检查与全部 49 项 Cloud 检查通过，30,726 毫秒、无跳过，记录为 `.scratch/cloud-promo-linux-check.log`。后续本地默认验证镜像已同步为 v15（`f18a613c2af1`）：继承依赖层不变，新增源码及客户端哈希与已验证文件一致，并通过镜像实际 CLI 初始化与私有权限检查，因此复用这份检查证据。上一版 v12 和必要构建基准保留，两个无容器引用的旧验证镜像已清理；详见[Linux 本地验收](../SERVICE.md#linux-本地验收)。这不是生产部署或 Shopify 网络验收。
