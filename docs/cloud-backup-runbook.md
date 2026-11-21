# 独立云端快照（只读、不中断前端）

## 范围

脚本：`scripts/cloud-backup-cli.mjs`，完全运行在可信的独立 Node.js 服务器/定时任务中，**不属于 Vercel 浏览器前端**。当前采用 **Supabase + 私有腾讯 COS**；不需要启动 4090 自托管数据服务。

脚本只从云端读取用户记录、账号及版本/提交日志，下载所有**当前元数据引用**的 COS/Supabase 私有文件，并写入一个本地权限受限的目录。不会修改、删除、锁定生产数据，也不会抢占用户的浏览器主线程。大量读取仍会产生网络流量和 COS 请求费用，建议避开高峰、限制运行频率。

## 使用

在你信任、具备足够磁盘空间且加密存储的主机，安装 Node.js 20+ 和项目的 `npm ci`，然后以安全方式设置环境变量：

- `SHIYE_BACKUP_ROOT`：独立备份目录，**不要放在 git/Vercel 部署目录**。
- `SHIYE_SUPABASE_URL`
- `SHIYE_SUPABASE_SERVICE_ROLE_KEY`：仅服务端，绝不能以 `VITE_` 开头。
- `SHIYE_COS_SECRET_ID`
- `SHIYE_COS_SECRET_KEY`
- `SHIYE_COS_BUCKET`
- `SHIYE_COS_REGION`

执行：

```sh
node scripts/cloud-backup-cli.mjs
node scripts/cloud-backup-cli.mjs verify /private-backups/snapshot-<id>
```

不建议将备份直接上传为公开的 GitHub Actions artifact。最小权限凭据、备份目录加密、备份独立副本和访问控制应在部署时配置。脚本本身不创建 Cron、不要求你公开长期 COS Key。

## 安全边界

1. 分页备份关系数据，逐对象流式下载；每个对象单独 SHA-256 校验，清单最后写入。
2. 备份前后读取账号 revision，发生变化则拒绝发布这份快照；不伪称数据一致。
3. 仅备份当前可达元数据引用的私有对象；如果 COS 私有对象无法读取则整体失败。不包括浏览器**尚未同步到云端**的修改，请另用应急恢复包。
4. 完整目录只在全部对象下载且版本比对成功后通过 rename 发布；失败只清理本次临时目录。
5. 当前包含校验工具，**没有自动覆盖生产环境的恢复工具**，恢复演练应使用隔离项目与只读快照再验证，禁止直接清空现有账号或 COS。
6. 正式上线前需要在非生产数据库测试服务权限、COS 多地区、历史 Supabase Storage 对象、备份频率、用户账号恢复、实际数据量和费用。

目标：先建立可验证、与前端完全解耦的备份，再按可访问的安全存储目标单独配置定时执行。
