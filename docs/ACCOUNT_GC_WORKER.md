# 拾页账号重置：独立服务端 COS 垃圾回收

## 协议
- 用户主动二次确认后，`POST /api/account-reset`、`mode=start` 仅执行 **一笔原子业务重置**，写入私有 `shiye-reset-barrier`，返回 HTTP 202，**不逐张删除 COS**。
- 服务端任务始终从经过验证的 Supabase `shiye_records` 读取目标 user_id/resetId，严禁调用方自定义文件路径、桶或任意账号。
- 所有新文件保存至 `<user_id>/reset-<resetId>/...`。 COS 签名端拒绝旧客户端继续 PUT 旧版目录，GC 跳过当前 Reset ID 目录；浏览器无需等物理删除完成即可创建新作品。
- `POST /api/account-gc` 用当前登录账户触发一轮**服务端**限时清理（非长时间前端轮询）；`GET /api/account-gc` 是定时任务，用 Vercel `CRON_SECRET` 且服务端 service-role 客户端查询数据库中所有待完成标记。
- 每轮最多若干批次，COS 每批最多 400 个，Supabase Storage 经 Storage API 删除（不能 SQL DELETE 文件元信息）。
- 进度持久写入同一账号的元数据标记（`gcCursor/gcCosDone/gcCosDeleted/gcStorageDeleted`）；旧手机、电脑的 IndexedDB 在登录前按 Reset ID 清理。
- 完成后标记 `phase=complete`，保留 Reset ID 不删除。失败后 cron 会重新处理，不要求用户在前台等待。
- 原有 `lrx` 重置任务如果仍是 `deleting`，配置好服务端密钥并触发 Cron 后，也会被自动扫描。

## 测试站部署前必需的环境变量
只在 Vercel 服务端项目环境设置，不要放入 `VITE_*` 或浏览器源码：
- `SHIYE_SUPABASE_SERVICE_ROLE_KEY`：Supabase 后台 Secret/service_role key，用于枚举待清理用户及安全更新服务端进度。仅服务端使用，切勿公开。
- `CRON_SECRET`：随机不可猜测的 Cron Bearer token（建议不少于 32 个字符），由 Vercel Cron 自动携带。
- 现有的 `SHIYE_COS_SECRET_ID`、`SHIYE_COS_SECRET_KEY`、`SHIYE_COS_BUCKET`、`SHIYE_COS_REGION`。
- `VITE_SHIYE_SUPABASE_URL` 与 `VITE_SHIYE_SUPABASE_PUBLISHABLE_KEY` 已有。切勿把 service-role key 写进它们。
可选：在非 test 发布之前，单独审核设置 `SHIYE_ACCOUNT_GC_ENABLED=true` 与 `SHIYE_ACCOUNT_RESET_ENABLED=true`。

## Vercel Cron
`vercel.json` 的 `0 3 * * *` 是 **UTC 每天一次**，兼容 Vercel Hobby 免费版。 Pro 计划可以缩短周期（例如每 5 分钟），需核实项目所属套餐后调整。Cron 精度和本次任务实际时长取决于 Vercel。
如果未配置 service-role key 或 Cron token，接口会拒绝执行，**不会宣称 COS 已清空**。UI 登录与业务重置依然可以正常访问已经清空的账户，之前启动的任务标记仍持续存在直到得到确认。

## 手工验收
1. 记录测试账户中的 2 个旧 COS 文件，再执行一次确认重置；
2. 验证 reset API 立即返回、作品/素材数据库为空、`phase=deleting`；
3. 关闭手机网页，等待 Cron 触发；检查旧 COS 文件消失、新版本目录文件未删除，元数据变为 `complete`；
4. 另一设备登录应先清理 IndexedDB；此时新设备可以正常创建新的作品和上传新目录图片；
5. 人为使 COS 一批删除失败，验证 `phase` 仍为 `deleting`，下次 Cron 继续处理；
6. 不应对旧目录外的其他用户文件发出任何 DELETE。
