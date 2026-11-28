# 拾页：开发者存储统计与安全清理 (2026-10-10)

## 目标与范围

本功能仅向 `shiye_accounts.is_admin = true` 的账户提供入口「账号 → 存储统计（开发者）」。
展示 Supabase 各业务表的条目数量和 JSON 载荷大小、PostgreSQL 含索引实际物理大小、
同步提交日志 / Tombstone / 关键版本水位线、COS 对象的实际大小。
任何普通用户既不能调用后台统计函数，也不能查询 COS 容量接口。
后端仍需独立验证，不能只隐藏前端按钮。

## Supabase 计量口径

- `appTablesBytes`：包括 7 个 `shiye_*` 业务表及索引的 `pg_total_relation_size` 之和；
  不包含 Supabase 平台内部表；并不直接等于项目的计费额度。
- `databaseBytes`：`pg_database_size(current_database())`，包含系统、平台及其他项目对象，
  不能直接与 COS 字节相加声称“数据库大小”。
- `stores[store].payloadBytes`：`sum(pg_column_size(record))`，仅 JSON 字段载荷，
  不含行元数据、索引、页面填充等。
- `commits.eligibleAfter90Days`：已超过 90 天的幂等提交回执数量；
  **不是**保证可立即释放的磁盘字节数。

## 已上线的安全清理范围

管理员在明确确认后，可通过 `shiye_storage_prune_commits(90, 5000)`
一次清理最多 5,000 条超过 90 天、其提交修订版本落后于账号最新版本的
`shiye_commits` 收据。SQL 强制至少保留 90 天，普通用户无权执行。
客户端旧的 `expected_revision` 必然因原提交已推进全局版本而不能在旧状态重复写入；
因此此处只清理已经确认且超过保留窗口的幂等回执。

**不清理**：`shiye_records` 任何用户作品/素材，永久 Tombstone，
`shiye_key_versions`、`shiye_key_watermark_start`，当前最近删除，
`shiye_changes` 的现有约 250 修订窗口（已自动裁剪），任何图片。

清理后 PostgreSQL 的 VACUUM / autovacuum 会重用页面；
物理文件不一定立刻缩小，不承诺立即节省指定容量。

## COS 对象盘点与“候选”的严格含义

`GET /api/storage-usage` 在 Vercel 服务端使用现有 COS 密钥调用只读 `getBucket`，
最多枚举 15 页 × 1000 条（结果不完整会显式标示）。
后端使用 Supabase 用户 JWT + `shiye_accounts.is_admin` 双重确认，
读取 RLS 授权的云端引用，并检查图片元数据、当前 / 历史作品文档和封面等引用。

展示：原始图片、派生缩略图、作品 JSON、其他文件，各自的数量与对象的 `Size` 字节。
仅当 COS 枚举和云端引用检查**全部完成**时才展示「90 天以上未被当前云端元数据引用」候选数量。

这**不是可安全删除量**：离线设备待上传队列、私人备份和设备外部副本不在云端引用图内，
不能只根据数据库当前不存在引用就删除 COS 的内容。
因此本版本 `safelyDeletableBytes` 恒为 0，无任何 COS 删除按钮、DELETE 票据或自动删除程序。
后续若真正引入垃圾回收，必须先有可靠的全设备同步水位线、保留期、幂等标记、二次重查、
可恢复备份及完整真机回归测试。原始图片比派生文件应更加保守。

## 部署顺序

1. 对测试 Supabase 执行 `deploy/supabase/storage-audit-retention.sql`。
2. 校验 SQL 函数已安装、普通身份调用会被拒绝，以及 `shiye_*` 数据未改变。
3. 部署 test 对应 Vercel 环境，确保该部署有现有的四个 COS 环境变量
   `SHIYE_COS_SECRET_ID`、`SHIYE_COS_SECRET_KEY`、`SHIYE_COS_BUCKET`、`SHIYE_COS_REGION`
   和 Supabase URL / publishable key。不要把 COS 密钥发到浏览器。
4. 使用管理员账号访问「账号 → 存储统计（开发者）」核验 SQL / COS 两部分，
   普通账号没有入口，并且调用 RPC/API 均 403/42501。
5. 只在 `eligibleAfter90Days > 0` 且管理员确实决定释放收据时点击清理；
   先保留备份。不要对 COS 做任何自动删除。

## 已知限制

- COS 文件枚举的 15 页上限可导致统计为**不完整扫描值**，不会误称为总量。
- COS 目前不包括移动设备本地文件和其他存储桶的内容。
- 引用图扫描只用于生成候选，不能当成安全垃圾回收证明。
- Supabase 数据库统计仅管理员可用；如同一 Supabase 服务连接正式与 test 客户端，
  新增只读函数与受保护的维护接口会对共享数据库生效，但不会自动删数据。
