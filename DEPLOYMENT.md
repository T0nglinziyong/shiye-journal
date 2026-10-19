# 拾页 CloudBase-only 部署说明

**唯一云平台：腾讯 CloudBase + 现有腾讯 COS 私有存储桶。** `test` 对应 CloudBase 静态测试项目，`main` 只在单独正式配置完成后发布。本文件代替之前的其他托管平台说明。

## 测试环境
- CloudBase envId: `shiye-pg-test-d1gg723f7fb356ccc`
- 网页：`https://shiye-journal-test-shiye-pg-test-d1gg723f7fb356ccc.webapps.tcloudbase.com`
- 静态前端：`npm ci`，`npm run build`，目录 `dist`，网站根目录 `/`，GitHub `test`。
- 前端公开配置：`VITE_SHIYE_CLOUDBASE_ENV_ID`、`VITE_SHIYE_CLOUDBASE_PUBLISHABLE_KEY`。
- 后端：`node scripts/build-cloudbase-functions.mjs` 产生 `.cloudbase-build/functions/shiye-api`；部署为事件云函数 `index.main`，Node.js 20.19，`256 MB`、`60 秒`。
- 云函数**单独**配置 `SHIYE_CLOUDBASE_ENV_ID`、`SHIYE_COS_BUCKET`、`SHIYE_COS_REGION`，以及限定存储桶操作的执行角色/临时凭据。不要将 COS Secret 放到 `VITE_` 变量中。
- 访问 CloudBase 网关的授权 Web 来源和 COS CORS 要分别校验。私有 COS 字节采用短期签名**直接** PUT/GET，不经事件函数转发文件。

## 单一数据源
CloudBase Auth 管理身份，PostgreSQL/RLS/事务 RPC 管理元数据和同步状态，COS 保存原图/Mask/作品文档。IndexedDB 存储本机缓存和未确认写入，**不是第二个云数据库**；断网时不能降级到一个来源不明的远端。保留已有账户、图片和原始本地队列；不要重跑基础 `schema.sql`。

## 发布门槛
1. 分支提交、准确 SHA、CloudBase 部署 SHA 核对一致。
2. `npm ci && npm test && npm run build && npm run test:ui`，且 `node scripts/audit-cloudbase-platform.mjs` 通过。CI 若失败、被阻断或没有执行步骤，不能标记全量已验收。
3. 真机：登录恢复、旧 COS 图片读取、新图片 PUT、原图/缩略图、离线队列、跨设备修改、413 与 403，以及应用诊断报告 v3。
4. 数据库增量迁移 `deploy/cloudbase/001-platform-search.sql` 和可选 `002-platform-vector.sql` 必须先在隔离库测试并备份线上资料后才执行；静态站构建不会自动运行 SQL。
5. `pgvector` 当前只保留禁用入口。没有 Embedding 模型和索引，不调用付费模型；关键词检索部署与启用也要单独验收。

## 暂停的高风险能力
账号彻底清空、自动 COS 清理、跨账号用户管理在 CloudBase 专用服务和审计通过前不开放；浏览器不得偷偷使用旧 HTTP 接口完成删除。可从用户菜单查看**当前账号**只读存储容量和平台健康。COS 容量扫描不等于可删除对象清单。

## 回滚
回滚静态版本前检查同步协议和真实队列；用户本机的 IndexedDB 属于所在网址 origin。旧网址的未同步操作不会自行出现在新网址。不得通过清除浏览器缓存或重置云数据库来“修复”上传错误。
