# Chromium sandbox：已批准的本机容器调整

## 已取得的证据

镜像已安装 chromium-sandbox，非 root 用户运行，没有使用 `--no-sandbox`。本机 Docker 测试仍失败：

```text
Failed to move to new namespace ... errno = Operation not permitted
Zygote process exited prematurely with exit code 1
```

## 请求批准的具体范围

仅对 OneCrew 浏览器测试容器使用基于 Docker 默认规则的 seccomp profile，补充以下规则：

```json
{
  "comment": "Allow Chromium to create its sandbox namespaces",
  "names": ["clone", "setns", "unshare"],
  "action": "SCMP_ACT_ALLOW",
  "args": [],
  "includes": {},
  "excludes": {}
}
```

这段是增量规则，不能单独作为完整 Docker profile。完整 profile 须保留默认拒绝策略与其他默认规则，记录来源提交和文件哈希；不设置 seccomp=unconfined、不使用 privileged、不增加 SYS_ADMIN、不关闭 Chromium sandbox、不挂载 Docker socket。

此改动允许浏览器进程调用原先受限的 namespace 系统调用，扩大了该容器可用的内核接口；目标是让 Chromium 自己建立更细的进程沙箱。仅批准这些规则不代表批准生产部署或额外容器权限。

Playwright 官方给出的非 root 浏览器抓取部署指引也使用此规则组合：

- https://playwright.dev/docs/docker#crawling-and-scraping
- https://github.com/microsoft/playwright/blob/main/utils/docker/seccomp_profile.json

## 审批后的验证

先检查完整 profile 差异，再启动无宿主端口暴露的独立测试容器；验证 Chromium sandbox 状态、OpenCLI 扩展连接、停止与目录隔离。仍失败时保存证据并提出具体下一步，不扩大权限重试。

用户已批准该受限配置。完整文件为同目录 `seccomp-profile.json`，内容与 Playwright 固定提交 `ae935a43d9e376e4759548f6b3c6905c7b282333` 的同名配置 JSON 一致（只调整排版）。源文件 SHA-256：`cc3e61cabda6bbc1e53e54d27ba4d55a9d3be829b6dd1a596f4a7b31b1cc7849`；本地文件 SHA-256：`8009f0da5bb7a293a5fa7b34de074ec82b61c1e2f800573364d44c6a8c48ab48`。

本机测试结果：Chromium 已运行，OpenCLI 1.8.8 的 doctor 验证 daemon 和扩展 1.0.24 均已连接。未使用 privileged、SYS_ADMIN、seccomp=unconfined 或 --no-sandbox；没有开放宿主端口。该配置不是本机 Docker 29 默认 profile 的逐字导出，而是官方浏览器部署指引提供的默认拒绝 profile，加三项 namespace 放行规则；后续生产环境仍须核对目标运行时。
