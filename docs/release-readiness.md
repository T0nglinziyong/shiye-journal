# 发布核验与环境配置（基础工程）

- GitHub 长期分支：`test` 验收、`main` 生产。两个 Vercel 项目必须分别连接正确的 Production Branch。项目 Git 设置位于 Vercel 控制台，仓库 `vercel.json` 无法单独指定项目的 Production Branch。
- 使用 GitHub Actions 的 **Audit deployed commit** 手动工作流核验 GitHub 最新 SHA 是否在对应 Vercel 项目达到 READY；过时 READY 必须失败。需要 GitHub Secret `VERCEL_TOKEN`，以及 Variables `SHIYE_VERCEL_TEST_PROJECT_ID`、`SHIYE_VERCEL_MAIN_PROJECT_ID`。永远不要放在浏览器环境变量或聊天中。
- 不开启自动发布到生产的 GitHub Actions：只有 PR 合并并通过验收后才进入 `main`。
- `/api/cos` 的允许来源严格限定 HTTPS：默认测试域名和 shiyejournal.vip，以及明确的 `SHIYE_APP_ORIGINS`（逗号分隔）和 Vercel 当前部署的 `VERCEL_URL`。账号管理 Edge Function 另有相同名称的服务端环境设置。不要设置通配符 `*.vercel.app`。
- `supabase/functions/shiye-account-admin/index.ts` 的源码修改**不会**由 Vercel Git 部署自动更新到 Supabase；需要由授权部署流程单独发布函数后才能生效。
- Service Worker 更新处于 waiting 状态，用户点击“更新拾页”并成功本机暂存后才会激活；绝不在编辑过程中自动刷新。
- 运行中的压缩、同步、识别处理不能因无关后台任务获得优先级；出错时保留原始未同步数据。
- 发布前核验：CI、实际 Git SHA、Vercel Ready 目标与网络 API 鉴权；并实机验证 iPad Safari 和 Apple Pencil（本 PR 不声称已完成）。
- GitHub `main` / `test` 分支保护仍需仓库管理界面启用必过检查、PR 合并要求、禁强推。
