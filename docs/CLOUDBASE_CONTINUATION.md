# CloudBase 迁移续接：检索数据库与运行时保护

## 基线与本次边界

基于 `feat/cloudbase-only-platform-20261019` 的 `cff213185cbf9abe6fdb4604582ad1e7dbf149b6`。
该提交已有 `shiye-api` 事件云函数、浏览器 SDK 通道及 COS 签名服务。本次补充它调用但尚未在迁移目录实现的数据库函数，并修复超时和响应体积检查。

**这不是“全量迁移已经完成”的发布声明。** 本次没有操作线上 CloudBase/COS，没有清空 IndexedDB，没有执行数据库迁移或付费模型请求。不要将本文件或本次单元测试结果当成完整应用构建、真实多设备同步或线上数据库验收。

## 已实现的代码

- `001-platform-search.sql`：独立私有检索文档；元数据事务内增量维护；NFKC 归一化关键词子串检索、类型/系列/状态过滤；当前账号逻辑 JSON 容量统计；账号级每分钟 20、每天 500 单位的持久化向量调用预算；能力查询。
- `002-platform-vector.sql`：1024 维 pgvector；模型登记；账号/模型隔离；租约领取；内容哈希、文档版本、账号 epoch、租约过期的原子写回检查；精确余弦检索与混合检索。混合检索保留尚未向量化的关键词候选。删除素材时只级联删除其派生索引，不删除 COS 图片。
- `cloud-function-transport.js`：超时同时取消后续调用意图。认证恢复慢于请求期限时，不再迟到发起云函数请求。已经开始的远程操作不能由取消承诺回滚，业务写入仍需原有幂等收据。
- `postgres.mjs`：请求体积限制；对 Content-Length 和实际响应流字节双重检查；HTML/空正文 401、403、404、413、429 保留正确错误类别；不回传原始数据库错误内容。
- `search.mjs`：先确认 SQL 向量能力和准确的模型登记，再调用付费模型；候选身份和写回回执严格校验，不能以空回执冒充成功。

图片、Mask、原始像素仍只由 COS 存放。本次索引内容仅为受限长度的素材名称/类型/标签文本，不包含原始图片或手帐正文。**这实现的是文本语义检索，不是以图搜图。** 普通关键词检索不调用模型。没有启用 pgvector 或配置模型时，能力接口明确报告向量不可用。

## 数据库部署顺序（需要数据库所有者权限）

1. 在已有 CloudBase PG 环境做好可恢复备份；保持 COS 对象不变。
2. 在数据库测试副本运行 `001-platform-search.sql`。它是增量迁移，不运行旧的 `schema.sql`，不重新建账号，不修改业务记录。
3. 在同一副本运行可选的 `002-platform-vector.sql`。它尊重现有 pgvector 扩展 schema；扩展不可安装时整个 002 回滚，已安装的 001 关键词功能不受影响。
4. 使用真实 PostgreSQL 执行本文下方的集成测试，检查角色、跨账号隔离、租约、删除/改名/重置后的迟到回写。
5. 验证通过后才对目标环境依次应用迁移。001 对旧素材做一次派生索引回填，设置了锁等待和语句超时；若超时应在低峰维护窗口重试，不扩大锁等待阻塞正常使用。

所有写索引函数均以 `auth.uid()` 的 **text** 用户标识为准；不接受调用者提供另一账号 ID。`shiye_private` 不对 `anon` 或 `authenticated` 开放表访问，公开 RPC 逐一授予认证用户，函数内限制当前账号。公开 RPC 的 SECURITY DEFINER 所有者必须是受信任的迁移角色，不得将相关 schema 的 CREATE 权限授予普通用户。

## 向量模型配置

事件函数使用已有服务端变量：
`SHIYE_VECTOR_SEARCH_ENABLED`、`SHIYE_EMBEDDING_ENDPOINT`、`SHIYE_EMBEDDING_MODEL`、
`SHIYE_EMBEDDING_API_KEY`、`SHIYE_EMBEDDING_ALLOWED_HOSTS`、`SHIYE_EMBEDDING_VERSION`、
`SHIYE_EMBEDDING_DIMENSIONS=1024`。

只在云函数受保护的配置中填写；不提交仓库、不放入任何 `VITE_` 变量、不发送到聊天。
配置完成后，可在受控服务端运行 `node scripts/show-cloudbase-vector-model.mjs` 得到不含密钥的 modelKey。
然后由数据库所有者登记模型：

```sql
insert into shiye_private.embedding_models(model_key,description,enabled)
values('<由配置计算出的64位modelKey>', '已验证的1024维文本嵌入模型及版本', true)
on conflict(model_key) do update set description=excluded.description,enabled=true;
```

不要把不同模型或版本的向量写入同一个 modelKey。未登记模型不会调用付费模型。向量服务未启用时保持关键词可用，不伪造向量结果。当前领取批次最多 4 件；预算失败不会调用模型，失败租约两分钟后可重领。衍生索引不改变业务同步 revision。

## 事件函数与图片

沿用基线分支的 `node scripts/build-cloudbase-functions.mjs` 和 `cloudbaserc.json` 构建 `shiye-api`。本次修改没有增加该函数打包允许列表以外的运行时依赖。SQL 不会随静态网站或事件函数发布自动执行，需单独验证和应用。

浏览器通过 `app.callFunction` 调用事件函数，不依赖静态站点 `/api/cos` HTTP 路由或 Vercel 转发。COS 的存储桶、地域、服务端角色权限/凭据依旧需要在函数环境正确配置。已有 COS 原图不搬迁；授权和 CORS 不能由静态构建替代。

## 本次实际验证与发布门槛

运行时测试使用真实 Node.js 的 Blob/Response/AbortController，CloudBase/COS 网络和数据库返回用合成夹具代替，不接触私人数据。

```bash
node --test tests/cloudbase-continuation-runtime.test.mjs
```

完整数据库验证**不能由源码正则检查代替**。在全新、可删除的本地数据库（需 PostgreSQL + pgvector + psql）中：

```bash
SHIYE_DB_TEST_DISPOSABLE=true \
SHIYE_TEST_DATABASE_URL='postgresql://postgres:<本地测试密码>@127.0.0.1:5432/shiye_cloudbase_test' \
node scripts/test-cloudbase-platform-db.mjs
```

该脚本拒绝公网/CloudBase 连接、非测试库名称和非空既有业务表，不删除原库。数据库测试没有实际运行或缺少 psql 时以非零状态退出，不把“跳过”显示成通过。脚本重复应用两次增量迁移，以验证幂等性。集成脚本包括跨账号读取、NFKC 查询、匿名权限、预算、改名/删除/过期租约/账号 epoch 的迟到写回检查。

完整仓库还必须运行：

```bash
node scripts/audit-cloudbase-platform.mjs
npm test
npm run build
```

审计仍发现旧平台依赖、配置或运行路径时必须继续迁移，不能宣称 CloudBase-only。此审计只输出路径、行号、类别，不打印源码或密钥；它不会代替人工权限审查。

## 仍未在本次补丁完成

- 完整仓库中旧平台依赖及所有残留接口的删除、调用方适配与全量构建回归。
- 素材库/搭配页面的可见搜索模式入口以及用户级自动索引调度。
- CloudBase 账号清空和 Storage 文件回收已经迁入 `deploy/cloudbase/007-account-reset-gc.sql`；持续离线运行的定时任务尚未配置，当前仅在网页打开后限量续跑。
- 现有统计界面对新容量结果协议的适配、日志控制台仪表板和告警配置。
- 真实环境部署、登录恢复、现有图片读取/新素材上传和多设备同步验收。

`accountReset` 由新版函数实现；以测试环境实际应用 SQL 和完成专门账号验收为启用条件，不得仅凭源码声称功能已上线。

## 参考（2026-10-19 核对）

- CloudBase PG 模式、JWT/GRANT/RLS/SQL 与扩展： https://docs.cloudbase.net/quick-start/pg-overview
- pgvector 官方用法、余弦距离与精确/近似搜索： https://github.com/pgvector/pgvector
