# 拾页项目交接

本仓库的 `test` 是独立维护的 PWA。以当前源码、数据合同和用户最新要求为准；不再以 Swift 项目作为实现或验收基线。开始工作先读 `README.md`、`ARCHITECTURE.md`、`DATA_LOADING_ARCHITECTURE.md`、`DEPLOYMENT.md` 和 `DEVELOPMENT_WORKFLOW.md`。

改动应沿现有页面控制器、数据路由、增量更新和资源加载接口扩展，避免在 `src/app.js` 新建平行状态。数据源故障不得静默回退至浏览器资料；修改存储逻辑前先验证备份和恢复。不提交密钥、私人素材、作品或实时数据。

普通开发在 `test` 或由其派生的短期分支。修改后运行 `npm test && npm run test:ui`，并按影响范围检查手机、iPad 横竖屏及桌面浏览器。模拟视口不能代替实体 Safari / Pencil 验收。发布严格遵循 `DEVELOPMENT_WORKFLOW.md`；核对远端准确 SHA、对应 Vercel Project 和部署状态。
