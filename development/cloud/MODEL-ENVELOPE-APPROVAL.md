# 模型响应外层数字解析修复

状态：用户已批准，客户端修复已实现。本机与 Linux 类型检查、5 项解析合同检查、全部 49 项 Cloud Linux 检查及真实 4B 短请求通过。原文理由另行验收。

## 实际故障

真实水杯评分返回 HTTP 响应后，`ServerSemanticClient.structured` 在解析响应外层时抛出 `JSON number cannot be represented without loss`，尚未解析模型的内容字符串。日志为 `.scratch/cloud-quoted-v3-water.log`。同一材料再次请求通过了响应解析，说明这项故障并非固定输入校验失败；具体小数字段仍需保存真实原始响应确认。

当前外层与模型内容共用 `parseApplicationJson`。外层只消费 `choices` 与整数 token 用量，但任何额外字段的小数不能无损转成 JavaScript Number 时，整个响应都会失败。

## 实现范围

仅修改 `onecrew_cloud/onecrew_lite-app/src/discovery/server-semantic-client.ts` 及相关真实响应检查：为响应外层使用现有 `lossless-json` 4.3.1 保留不能精确表示的小数；复用严格 JSON、重复键和 Unicode 检查，再由现有响应 schema 选取需要的字段。额外元数据不进入业务结果，整数 token 用量继续校验。

模型生成的内容字符串仍使用原 `parseApplicationJson`、原输出 schema、来源核对与审核。原生数据合同、其他客户端和 Lite 仓库不改；不降低业务数字精度要求、不吞错、不增加重试、不换模型、不购买服务。

真实 4B 响应已保存至 `onecrew_lite-app/tests/fixtures/cloud-score/model-envelope.json`，内容字符串与整数用量保持一致，额外元数据不进入业务结果。9 次短请求的真实数字均可被旧解析器接受，没有复现原故障字段；诊断记录为 `.scratch/model-envelope-capture.log` 与 `.scratch/model-envelope-timings.log`。

`cloud-model-envelope.test.ts` 的 5 项检查使用上述真实响应，并明确区分派生的解析边界输入：额外高精度小数、上溢和下溢数字可保留；非法 JSON、重复键、无效 Unicode、错误结束状态和非法用量继续拒绝；模型内容中的精度限制保持不变。边界输入用于验证合同，不视为真实模型输出。不能将这些结果表述为已经捕获原故障的具体字段。

Linux 验证镜像为 `onecrew-cloud-service:linux-quoted-client`（`9eed979e5829`），包含当前客户端、原文校验与新增解析检查，49 项全部通过、无跳过，耗时 31,467 毫秒。日志为 `.scratch/service-quoted-client-build.log`、`.scratch/service-quoted-client-check.log`。此结果不代表引用语义或完整业务验收通过，未替换默认镜像。

这涉及原文理由批准范围之外的模型客户端文件，因此按用户要求另行审批。
