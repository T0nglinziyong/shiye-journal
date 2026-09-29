# 拾页项目交接

开始工作前先读 `CODEX_HANDOFF.md`、`SWIFT_PARITY_AUDIT.md`、`README.md` 和 `DEPLOYMENT.md`。Swift 对照源码位于桌面完整项目包的 `../../Swift原项目/ShiyeJournalFresh.swiftpm`；PWA 源码在本目录。若只从 GitHub 克隆本仓库，需另取完整项目包才能核对 Swift 与本地数据。

以用户较新的明确修改要求为准。目标是核心页面、控件位置关系、导航与数据结果和 Swift 一致，容许控件尺寸随网页视口调整。不要把 DOM 路由测试当成真实浏览器视觉验收，也不要把现有差异清单当作完成证明。修改后运行 `npm test && npm run test:ui`，并在真实手机、iPad 横竖屏及桌面浏览器检查相关页面。

不要将 API 密钥、服务令牌、私人素材、作品或 `数据备份/实时数据` 提交 Git。修改服务器存储逻辑时保留已存数据，先验证完整备份恢复；公开自托管模式必须使用 HTTPS 与强访问令牌，服务器连接失败不得静默改写浏览器本地数据。
