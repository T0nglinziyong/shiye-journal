# 拾页项目交接

开始工作前先读 `CODEX_HANDOFF.md`、`SWIFT_PARITY_AUDIT.md`、`README.md` 和 `DEPLOYMENT.md`。主要 Swift 对照源码是用户新解压的 `../../ShiyeJournalFresh.swiftpm`（`ShiyeJournal_2.0.2_Journal_Layouts.zip`）；`../../Swift原项目/ShiyeJournalFresh.swiftpm` 仅保留为旧参考。PWA 源码在本目录。若只从 GitHub 克隆本仓库，需另取完整项目包才能核对 Swift 与本地数据。不要复制 Swift 包内的个人 API 凭据。

以用户较新的明确修改要求为准。目标是核心页面、控件位置关系、导航与数据结果和 Swift 一致，容许控件尺寸随网页视口调整。不要把 DOM 路由测试当成真实浏览器视觉验收，也不要把现有差异清单当作完成证明。修改后运行 `npm test && npm run test:ui`，并在真实手机、iPad 横竖屏及桌面浏览器检查相关页面。

不要将 API 密钥、服务令牌、私人素材、作品或 `数据备份/实时数据` 提交 Git。修改服务器存储逻辑时保留已存数据，先验证完整备份恢复；公开自托管模式必须使用 HTTPS 与强访问令牌，服务器连接失败不得静默改写浏览器本地数据。

分支与发布必须遵循 `DEVELOPMENT_WORKFLOW.md`。普通开发默认在 `test` 或从 `test` 新建 `feature/*` / `fix/*` / `experiment/*`；完成后先进入 `test`，通过 CI 和测试站验收后再用 PR 将 `test` 合并到 `main`。除紧急 hotfix 外，不得直接在 `main` 开发普通功能；hotfix 进入 `main` 后必须立即回灌 `test`。不得强推或覆盖两个长期分支。Vercel 正式项目为 `shiye-journal`（只接受 `main`），测试项目为 `shiye-journal-test`（只接受 `test`）；其他分支不自动部署，历史临时项目不得作为发布目标。每次发布仍需核对准确 Git SHA、对应 Vercel Project 和部署状态，不能把 push 成功当作已发布。