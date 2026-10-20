# 拾页分支与发布规则（CloudBase）

| 分支 | 用途 | 发布 |
| --- | --- | --- |
| `test` | 开发和真机验收 | CloudBase 测试静态网站 |
| `main` | 已验收稳定版本 | 需单独配置 CloudBase 正式发布项目后才部署 |
| `feat/*`、`fix/*` | 独立开发、PR 检查 | 不自动替代测试站 |

## 代码工作流
所有修改从 `test` 建分支，经 PR 合回 `test`。未经完整验证不宣称上线；不要将 `test` 自动合入 `main`。提交前保留用户数据与待同步队列，不自动迁移 COS 路径、账号或删除对象。

## CloudBase 平台
- 只有 CloudBase Auth、PostgreSQL、事件云函数 `shiye-api` 和腾讯 COS 是远端服务依赖。
- 不再启用其他部署提供方及其后台代理。不要用另一套服务接收云端写入。
- 客户端首屏可读缓存，离线编辑先进入账号隔离的 IndexedDB 唯一待同步队列；服务端依旧以数据库事务和操作收据确认提交。
- COS 原图、候选框、Mask 和大型作品不放到数据库里。
- 服务端密钥仅存在 CloudBase 云函数受保护配置，前端不可持有；启用新增数据库迁移前先备份并隔离测试。
- `pgvector` 暂不启用；用户 UI 仅显示预留入口。

## 验收
每次完整迁移必须执行 `npm test`、`npm run build`、`npm run test:ui` 和 `node scripts/audit-cloudbase-platform.mjs`。测试失败或 CI 没有执行步骤都不是成功。图片和编辑器回归须检查实际设备，尤其 iOS Safari。结果分别注明“代码已提交、函数已部署、SQL 已执行、真机已验收”，不可混为一谈。

`npm run test:ui` 会产生含模拟 CloudBase 会话的 `dist`，不能用于发布；发布前重新运行生产模式 `npm run build`。测试站是 CloudBase App `shiye-journal-test` 的 Git 构建；当前合并 `test` 不会自动部署，需在现有 App 上触发 Git 构建，设置本次 `SHIYE_BUILD_SHA`，再核对该应用版本状态及实站 `/version.json`。不能只凭 GitHub 合并判断上线。

## 同步与数据安全
403/413 应明确诊断并保留原始队列；结果不明的网络请求必须先核验幂等收据/私有对象再决定重试；明确冲突时保留两份可恢复的作品。账号清空和 COS GC 仅在 CloudBase 服务端独立实现、权限校验、审计及备份恢复验证后开放，任何未完成的危险操作不应出现在可执行 UI 中。

参考：`DEPLOYMENT.md`、`docs/CLOUDBASE_TEST_ROLLOUT.md`。
