# 拾页分支与发布规则（CloudBase）

| 分支 | 用途 | 发布 |
| --- | --- | --- |
| `test` | 开发和真机验收 | CloudBase 应用 `shiye-journal-test`；目前也服务正式域名 `shiyejournal.vip` |
| `main` | 已验收稳定版本 | 尚无独立 CloudBase 正式项目，不触发网站部署 |
| `feat/*`、`fix/*` | 独立开发、PR 检查 | 不自动替代测试站 |

## 代码工作流
所有修改从 `test` 建分支，经 PR 合回 `test`。未经完整验证不宣称上线；不要将 `test` 自动合入 `main`。提交前保留用户数据与待同步队列，不自动迁移 COS 路径、账号或删除对象。

## CloudBase 平台
- 远端依赖为 CloudBase Auth、PostgreSQL、私有云存储、事件云函数 `shiye-api` 和静态网站；旧 COS 不在当前读取或上传路径中。
- 不再启用其他部署提供方及其后台代理。不要用另一套服务接收云端写入。
- 客户端首屏可读缓存，离线编辑先进入账号隔离的 IndexedDB 唯一待同步队列；服务端依旧以数据库事务和操作收据确认提交。
- 原图、候选框、Mask 和大型作品文件放在 CloudBase 私有云存储，不放到 PostgreSQL 里。
- 服务端密钥仅存在 CloudBase 云函数受保护配置，前端不可持有；启用新增数据库迁移前先备份并隔离测试。
- `pgvector` 暂不启用；用户 UI 仅显示预留入口。

## 验收
每次完整迁移必须执行 `npm test`、`npm run build`、`npm run test:ui` 和 `node scripts/audit-cloudbase-platform.mjs`。测试失败或 CI 没有执行步骤都不是成功。图片和编辑器回归须检查实际设备，尤其 iOS Safari。结果分别注明“代码已提交、函数已部署、SQL 已执行、真机已验收”，不可混为一谈。

`npm run test:ui` 会产生含模拟 CloudBase 会话的 `dist`，不能用于发布。测试站是 CloudBase App `shiye-journal-test` 的 Git 构建；`test` 的 push 检查通过后，`Deploy CloudBase test` 使用仅限测试环境的 CAM 凭证触发生产模式构建，等待版本成功并核对实站 `/version.json`。自动发布依赖 GitHub 环境 `cloudbase-test` 中的两个凭证 Secret；未配置时工作流会失败，不会绕过验证。不能只凭 GitHub 合并判断上线。

`shiyejournal.vip` 的 CloudBase HTTP 网关根路由指向上述同一个应用，阿里云根域名 CNAME 指向该网关；因此合并到 `test` 且发布任务通过后，正式域名也会更新。正式域名目前仍使用测试环境的账号和数据。将来若建立独立生产环境，须先迁移与验收数据、域名和发布凭证，再改为从 `main` 发布。

## 同步与数据安全
403/413 应明确诊断并保留原始队列；结果不明的网络请求必须先核验幂等收据/私有对象再决定重试；明确冲突时保留两份可恢复的作品。账号清空和私有文件回收仅在 CloudBase 服务端独立实现、权限校验、审计及备份恢复验证后开放，任何未完成的危险操作不应出现在可执行 UI 中。

参考：`DEPLOYMENT.md`、`docs/CLOUDBASE_TEST_ROLLOUT.md`。
