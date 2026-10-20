# 拾页 CloudBase-only 部署说明

**唯一云平台：腾讯 CloudBase（身份认证、PostgreSQL、私有云存储与静态网站）。** `test` 对应 CloudBase 静态测试项目，`main` 只在单独正式配置完成后发布。本文件代替之前的其他托管平台说明。

## 测试环境
- CloudBase envId: `shiye-pg-test-d1gg723f7fb356ccc`
- 网页：`https://shiye-journal-test-shiye-pg-test-d1gg723f7fb356ccc.webapps.tcloudbase.com`
- 静态前端：`npm ci`，`npm run build`，目录 `dist`，网站根目录 `/`，GitHub `test`。
- 前端公开配置：`VITE_SHIYE_CLOUDBASE_ENV_ID`、`VITE_SHIYE_CLOUDBASE_PUBLISHABLE_KEY`。
- 认证：维持邀请制，CloudBase 控制台关闭自助注册；受邀身份先在 Auth 创建，再以同一 Auth user ID 写入 `shiye_accounts`。网站支持用户名/邮箱/手机号加密码、邮箱验证码和中国大陆短信验证码；验证码请求均使用 `shouldCreateUser:false`，最终仍须通过 `shiye_accounts` 核验。受邀用户登录后，可在“账号与登录方式”通过验证码绑定邮箱或手机号；绑定完成前不能用该方式登录。仅在控制台开通并完成回调域名配置的第三方提供商可写入前端公开变量 `VITE_SHIYE_OAUTH_PROVIDERS`（例如 `wechat,github`），未配置不显示；已有受邀用户须在账号菜单将第三方身份绑定到当前 Auth user ID。不要用不同 Auth user ID 自动合并资料。
- 实时通知：现有个人版 PostgreSQL 环境缺少 `realtime` schema 和 `cloudbase_realtime_admin`，不能执行 `deploy/cloudbase/003-realtime-revisions.sql`。腾讯云文档要求该环境由服务端先开通；公开 API 名称 `EnablePGRealtime` 在当前 CloudBase API 版本返回 `InvalidAction`，不可自行创建空 schema/角色冒充已开通。待腾讯云实际开启 PG CDC 后再应用迁移并设置 `VITE_SHIYE_REALTIME_ENABLED=true`；订阅成功时改为每 60 秒兜底核对，订阅故障时恢复 5 秒轮询。当前不能宣称实时通知已上线。前台活跃时每 5 秒检查一次修订与账号代际，匹配/导入页只查版本，不下载集合；账号清空标记仅在登录和代际变化时读取。页面隐藏或超过 90 秒无输入后停止定时数据库核对；重新操作或聚焦页面时恢复。后台同步被唤醒但本机队列为空时不读 PostgreSQL。已打开的旧版标签页不会自动获得新逻辑，需要完成安全更新或关闭旧标签页。
- 云存储：先执行 `deploy/cloudbase/004-private-storage.sql` 创建 `shiye-private` 和 `shiye-presets` 两个私有桶及 RLS 策略。将 70 张预设图迁入 `shiye-presets/journal-presets/source/`，将账号对象迁入 `shiye-private/<user-id>/`，逐件下载核对 SHA-256，再改数据库引用。旧 COS 对象在新站和各设备完成验收前保留，不作为新站读取回退。
- 引用切换：完成对象复制核对后执行 `deploy/cloudbase/005-switch-object-references.sql`；该事务更新 blob provider 和同步修订，并阻止旧客户端重新提交 COS blob 引用。执行后分别核对 70 个预设、全部私有对象及 `shiye_records` 中没有 COS blob 引用。
- 现有网站是 CloudBase App `shiye-journal-test`（`webapps.tcloudbase.com`），通过其 Git 构建发布。当前配置下，合并 `test` 未自动触发新版本；须在现有应用上手动触发 Git 构建，保留 GitHub 仓库 `T0nglinziyong/shiye-journal`、`test` 分支、安装/构建命令和前端环境变量。不要把 `tcb hosting deploy` 到另一个静态托管入口当成该网站已更新。测试构建 `npm run test:ui` 使用模拟 CloudBase 会话，产物仅供测试，绝不能发布。
- 后端：`node scripts/build-cloudbase-functions.mjs` 产生 `.cloudbase-build/functions/shiye-api`；部署为事件云函数 `index.main`，Node.js 20.19，`256 MB`、`60 秒`。
- 云函数独立配置 `SHIYE_CLOUDBASE_ENV_ID`。图片由浏览器凭 CloudBase 登录会话直连云存储，旧 COS 签名配置不再是网站上传的依赖。
- 在 CloudBase 网关允许测试站 Web 来源；私有桶通过账号 RLS 授权，无需为新站签发旧 COS URL。

## 单一数据源
CloudBase Auth 管理身份，PostgreSQL/RLS/事务 RPC 管理元数据和同步状态，CloudBase 私有云存储保存原图、Mask 和作品文档。IndexedDB 存储本机缓存和未确认写入，**不是第二个云数据库**；断网时不能降级到一个来源不明的远端。保留已有账户、图片和原始本地队列；不要重跑基础 `schema.sql`。

## 发布门槛
1. 从短期分支经 PR 合入 `test`，在现有 CloudBase App 上触发 Git 构建，确认成功，并核对该网站 `/version.json` 的 `commit` 与 `test` 的准确 SHA 一致。CloudBase Git 构建工作区未提供 `.git`，本项目实测不能靠 `git rev-parse` 自动取得 SHA；每次构建须把该次 `test` 的完整 SHA 配为 `SHIYE_BUILD_SHA`，并设 `SHIYE_BUILD_BRANCH=test`。本地/其他 CI 仍可由构建脚本读取 `GITHUB_SHA` 或 Git HEAD。若部署版 `commit` 为 `null` 或旧 SHA，不得宣称已核对版本。
2. `npm ci && npm test && npm run build && npm run test:ui`，且 `node scripts/audit-cloudbase-platform.mjs` 通过。CI 若失败、被阻断或没有执行步骤，不能标记全量已验收。
3. 真机：登录恢复、迁移后的原图及预设图读取、新图片上传、原图/缩略图、离线队列、跨设备修改、413 与 403，以及应用诊断报告 v3。
4. 账号容量菜单依赖只读迁移 `deploy/cloudbase/006-account-usage.sql`；它可独立于搜索迁移执行。数据库增量迁移 `001-platform-search.sql`、可选 `002-platform-vector.sql` 及 `006-account-usage.sql` 必须先在隔离库测试并备份线上资料后才执行；静态站构建不会自动运行 SQL。未执行 `006` 时账号容量会明确提示缺少迁移。
5. `pgvector` 当前只保留禁用入口。没有 Embedding 模型和索引，不调用付费模型；关键词检索部署与启用也要单独验收。
6. 登录验收：受邀账号密码登录、邮箱和短信收码及验证、密码找回四步流程、未受邀身份拒绝、退出后重登、多个设备分别登录。第三方登录逐个核实控制台启用、回调域名和受邀身份绑定；只有实际验收通过后才设置 `VITE_SHIYE_OAUTH_PROVIDERS`。账号菜单逐项检查容量、服务状态、改密、旧资料导出和退出。短信验证码区域仅支持上海配置。

## 账号清空与文件回收
账号清空与云端文件回收需先执行 `deploy/cloudbase/007-account-reset-gc.sql`，再部署同一提交的 `shiye-api` 和网页。SQL 为 `shiye-private` 添加仅限本账号过期孤立文件或旧代目录的 DELETE 策略；不修改共享 `shiye-presets`。详见 `docs/ACCOUNT_GC_WORKER.md` 的测试账号验收。网页活跃且空闲时分批核查；只有服务端明确返回还有下一批时才在 10 秒后继续，否则最多每天例行检查一次。网页关闭后不持续运行。跨账号用户管理仍不开放。可从用户菜单查看**当前账号**元数据统计和平台健康，云存储用量以 CloudBase 套餐用量为准。

## 回滚
回滚静态版本前检查同步协议和真实队列；用户本机的 IndexedDB 属于所在网址 origin。旧网址的未同步操作不会自行出现在新网址。不得通过清除浏览器缓存或重置云数据库来“修复”上传错误。
