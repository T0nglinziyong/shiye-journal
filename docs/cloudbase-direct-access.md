# CloudBase 直连与同步

浏览器通过 `@cloudbase/js-sdk` 直连 CloudBase Auth、PostgreSQL 和云存储。`shiye-api` 云函数只承担仍需服务端执行的业务能力；图片读写不经过它，也不使用独立 COS 的签名接口。

## 配置与存储

浏览器配置 `VITE_SHIYE_CLOUDBASE_ENV_ID` 和 `VITE_SHIYE_CLOUDBASE_PUBLISHABLE_KEY`。`shiye-presets` 存放 70 张预设模板图片；已登录用户只能读取指定的 `journal-presets/source/` 路径。`shiye-private` 存放用户原图、派生图和作品图片；浏览器只能读取和写入自己账号编号前缀下的对象。权限脚本是 `deploy/cloudbase/004-private-storage.sql`。

上传先等待云存储确认，再提交 PostgreSQL 图片引用。对象路径按内容哈希固定；失败的原稿和待同步修改仍保存在本机队列中。`storageProvider` 必须是 `cloudbase`；旧 COS 引用已一次性转换，日常读取没有旧存储回退。换网站域名不会共享浏览器 IndexedDB。

## PostgreSQL Realtime

客户端已经能订阅 `public.shiye_revisions` 的账号修订通知；消息只提示版本变化，实际数据仍通过版本化增量读取。当前环境须由 CloudBase 服务端先开通 PostgreSQL Realtime，确认 `realtime` schema 和服务端创建的 `cloudbase_realtime_admin` 连接角色存在，然后运行 `deploy/cloudbase/003-realtime-revisions.sql`，最后设置 `VITE_SHIYE_REALTIME_ENABLED=true` 并重新构建部署。

未收到订阅成功状态时，客户端保留 5 秒增量检查；订阅成功后以实时通知为主，并每 60 秒兜底核对。不要手工创建同名 schema 或角色来代替服务端开通，否则逻辑复制服务仍不会运行。

2026-10-20 已向 CloudBase 官方社区提交[个人版开通咨询](https://cnb.cool/tencent/cloud/cloudbase/community/-/issues/1647)。在平台确认开通前，不能将 Realtime 视为已上线，也不能移除断线时的版本核对。

## 排障

模板卡片应能从 `shiye-presets` 解码为图像。新素材或作品的数据库记录应出现 `storageProvider: cloudbase`，其 `storagePath` 对应 `shiye-private` 中的对象。先看应用的详细同步诊断，再分别核对浏览器上传结果、云存储对象和 PostgreSQL 事务；不能清空待同步队列来掩盖故障。
