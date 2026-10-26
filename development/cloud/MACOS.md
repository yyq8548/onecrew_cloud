# 本机 Mac 运行与 Gmail 验证

当前部署主机采用用户这台 Mac。Cloud 主服务原生运行，免费 4B 使用现有 Metal 入口；搜索浏览器继续复用本机已有 Docker 环境，不新增 Linux 服务器，不执行 Sync 的 Linux 迁移。

## Gmail 本机工作台

在仓库根目录使用 Node 26.7.0、pnpm 10.32.1。已有 Library 构建可直接复用；首次准备按 [开发交接](../handoff/README.md) 完成依赖和 Library 构建。

```sh
pnpm --filter onecrew-web build
pnpm cloud:mail:local
```

该命令复用仓库已有 Mac 登录和邮件模块，数据独立保存在本仓库 `.scratch/macos-gmail-live/`，包含加密凭据、邮箱记录和持久发送状态。该目录属于账号数据，必须保留，不作为缓存清理，也不上传 GitHub。Lite 原目录和安装不变。

服务运行后取得一次性网页登录入口：

```sh
node onecrew_lite-app/src/cli.ts workspace --data-dir "$PWD/.scratch/macos-gmail-live"
```

在网页完成 OneCrew 登录及 Gmail 授权。发信仍沿用原预览和确认流程，结果未知时不重发。

2026-10-25 已完成一次用户明确授权的真实自发自收测试：原 Mac 配对、邮箱授权、草稿、单封发送与 Gmail 回读均通过，批次 `completed`、单封 `sent`。只确认了一封邮件，原有其他邮箱连接保留。实际邮箱、凭据、批次及 Gmail message ID 留在私有目录；公开证据见[验收摘要](../handoff/evidence/macos-gmail-20261025/summary.json)。

## Shopify Cloud 主服务

Shopify 内嵌服务继续使用 `pnpm cloud:serve`，Gmail 配对与登记按实际主进程系统选择平台，本机为 `macos`；Mac 的默认模型版本为已验证的 4B Metal 版本。

正式运行需真实 `SHOPIFY_API_KEY`、`SHOPIFY_API_SECRET`、`SHOPIFY_APPLICATION_URL`、独立持久目录及可访问的 HTTPS 入口，见 [服务说明](SERVICE.md)。本机 Gmail 测试没有使用虚构 Shopify 身份，也没有绕过现有店铺成员权限；这次没有验证 Shopify 内嵌页面的完整邮箱绑定。

本机工作台使用原本机端口回调，可以复用公司已上线的 Access 和 Sync。远程 Shopify 商家通过网页授权时，仍需 [Access HTTPS 回调与 CSP 补充](ACCESS-CLOUD-APPROVAL.md)，公司代码保持未新增修改，等待单独批准。Sync 的 Linux 六文件草稿保留为历史记录，不属于当前 Mac 部署范围。

这台机器正式提供服务时需要保持开机、联网和服务运行。当前未设置系统自动启动、未更改休眠设置、未发布公网入口。
