# CloudBase test 集成与启用检查

测试站使用 CloudBase Auth、PostgreSQL、事件云函数与私有 COS。网站由 CloudBase App `shiye-journal-test` 的 Git 构建发布；`shiye-api` 是独立部署单元。代码合并不等于网站/函数已部署，更不等于增量 SQL 已执行或真机同步已验收。

## 验证入口

- `node --test tests/cloudbase-continuation.test.js tests/cloudbase-client-contract.test.js`：本地 Node 22 内置运行时测试，无真实用户、COS 或付费模型请求。
- `.github/workflows/cloudbase-platform.yml`：运行时、函数打包和独立 PostgreSQL + pgvector 集成测试。SQL 服务仅绑定临时 CI 本机，未使用线上密钥。
- `node scripts/audit-cloudbase-platform.mjs`：完整仓库旧平台残留审计。此阶段应通过；出现旧路径、旧 SDK、旧部署变量时失败并阻止宣称纯 CloudBase。
- `npm test` 与 `npm run test:ui`：后者在测试模式注入内存 CloudBase 夹具，验证首屏、路由与多视口交互。它的 `dist` 不能发布；上线前必须重新执行 `npm run build`。旧浏览器脚本中直接写本地 IndexedDB、假设无登录资料库的场景还需逐项改造成 CloudBase 夹具，不能把它们的启动失败算成真实服务验收。

## 网站与图片服务

前端已经直接通过 CloudBase SDK 的 `callFunction` 调用 `shiye-api`。静态部署不包含云函数，不能把静态站点下 `/api/cos` 的 HTTP 成功与否当作新事件函数健康检查。

1. 合入 `test` 后在现有 CloudBase App `shiye-journal-test` 上手动触发 Git 构建，保留 `test` 分支、安装/构建命令及原前端公开变量，并设置本次 `SHIYE_BUILD_SHA`。核对新构建及实站 `/version.json`；`commit` 必须与 GitHub `test` HEAD 一致，且网站实际可打开。
2. 函数代码发生变更时运行 `node scripts/build-cloudbase-functions.mjs`。
3. 按 `cloudbaserc.json` 部署 `.cloudbase-build/functions/shiye-api`。入口 `index.main`、事件函数、Node.js 20.19；不要只上传仓库中未打包的 index.js。
4. 在函数的服务端配置 `SHIYE_CLOUDBASE_ENV_ID=shiye-pg-test-d1gg723f7fb356ccc`，以及原来的 `SHIYE_COS_BUCKET`、`SHIYE_COS_REGION`。前端的 `VITE_` 环境变量不会自动成为函数配置。
5. 配置具有所需 COS 权限的执行角色；代码支持运行时临时凭据。若使用显式 COS 凭据，限定存储桶和所需操作，只放在受保护服务端配置，不发到聊天或提交仓库。不要混合不同来源的临时 Token 和长期 Key。
6. 检查当前 CloudBase 环境的 FunctionsHttpApiAllow 调用策略允许已登录用户访问该函数。函数内部仍重新核验用户和账号权限；不要仅凭浏览器提交的 owner 字段授权。
7. 保持原来的 COS 私有权限和已配置 CORS，不搬迁图片、不删除原对象。验证原素材读取、缩略图、原图、一次小批量上传，再进行真实多设备同步验收。

## 检索与向量启用

`001-platform-search.sql` 与 `002-platform-vector.sql` 是增量迁移文件，不会随网站构建自动执行。必须先通过独立 SQL 测试及备份检查，再由 CloudBase 数据库所有者应用。不要重新运行初始 `schema.sql`。

只在配置了有效 1024 维模型、版本和服务端密钥，且登记对应 modelKey 后启用向量功能。无模型或迁移未完成时明确报未启用，不调用付费模型。当前功能是素材名称/标签的文本语义检索，不是以图搜图。参考 `CLOUDBASE_CONTINUATION.md` 的部署顺序与权限要求。

## 尚不能标为完成的项目

账号清空和安全后台 GC、前端云搜索/自动索引、监控告警配置及真实线上验收仍待逐项完成。不要因为 GitHub 合并成功就声称这些能力已经上线。
