# 拾页部署说明

发布分支和环境以 [DEVELOPMENT_WORKFLOW.md](DEVELOPMENT_WORKFLOW.md) 为准：`test` 进入 Vercel `shiye-journal-test`，验收后通过 PR 将 `test` 合到 `main`，由 `main` 进入正式项目 `shiye-journal`。普通功能不直接提交到 `main`，也不使用历史临时项目。

## 发布前检查

1. 在目标分支确认 `git status`、准确提交 SHA、CI 状态，并运行 `npm test && npm run test:ui`。涉及图像、编辑器或 Safari 的变更还需相应浏览器与真机检查。
2. 检查构建产物中的入口、动态块、OpenCV 运行时和 Service Worker Shell。需要加载的功能块必须能从测试站读取。
3. 检查改动未包含 API 密钥、服务令牌、私人素材、作品、备份或实时数据。
4. 如果改动数据存储或迁移，先备份并做隔离恢复；失败不能静默写入另一数据源。

## 发布后核对

核对 Git 远端 SHA、Vercel Project、部署源分支、部署状态和实际页面的 `version.json`。`git push` 成功只说明代码到达远端，不代表测试站或正式站已经完成部署。测试站验收通过后再发起 `test → main` PR。

## 环境与隐私

浏览器只配置可公开的客户端设置；服务端密钥只放在目标 Vercel Project 的服务端环境。自托管公开模式使用 HTTPS 与强访问令牌。私有图片保持账号鉴权和私有对象存储，不能通过公开 CDN 暴露。云端连接失败时保留原始资料及持久待同步队列，不自动切换为浏览器写入。

过去按日期记录的部署、迁移数量和一次性 SHA 已过期，不再作为当前发布或数据状态的依据。需要追溯时查看 Git 历史和对应部署记录。
