# 拾页项目交接

开始工作前先读 `CODEX_HANDOFF.md`、`SWIFT_PARITY_AUDIT.md`、`README.md` 和 `DEPLOYMENT.md`。主要 Swift 对照源码是用户新解压的 `../../ShiyeJournalFresh.swiftpm`（`ShiyeJournal_2.0.2_Journal_Layouts.zip`）；`../../Swift原项目/ShiyeJournalFresh.swiftpm` 仅保留为旧参考。PWA 源码在本目录。若只从 GitHub 克隆本仓库，需另取完整项目包才能核对 Swift 与本地数据。不要复制 Swift 包内的个人 API 凭据。

以用户较新的明确修改要求为准。目标是核心页面、控件位置关系、导航与数据结果和 Swift 一致，容许控件尺寸随网页视口调整。不要把 DOM 路由测试当成真实浏览器视觉验收，也不要把现有差异清单当作完成证明。修改后运行 `npm test && npm run test:ui`，并在真实手机、iPad 横竖屏及桌面浏览器检查相关页面。

不要将 API 密钥、服务令牌、私人素材、作品或 `数据备份/实时数据` 提交 Git。修改服务器存储逻辑时保留已存数据，先验证完整备份恢复；公开自托管模式必须使用 HTTPS 与强访问令牌，服务器连接失败不得静默改写浏览器本地数据。

用户要求此后每批代码更新经过验收后提交并推送至 `T0nglinziyong/shiye-journal`，不要只留在本机。推送前检查提交范围、凭据／私人数据、远端新增提交并运行 `npm test && npm run test:ui`；不要强推或覆盖远端改动。按用户最新指定，Vercel 只使用现有项目 `shiye-journal-test`（`prj_96WRMneQ8J6gF1X7DUuzDqk5bWrE`），生产分支为 `main`，所有测试版本统一发布到 `https://shiye-journal-test.vercel.app`，不要另建项目、更换网址或修改 DNS。旧临时项目不再作为发布目标。2026-09-29 已核对该项目的 GitHub 关联、生产分支与固定域名；每次推送仍需核对实际 Git 提交的 READY 部署和固定别名，不以手动部署冒充自动部署。连接失败时如实报告，请用户正常授权。
