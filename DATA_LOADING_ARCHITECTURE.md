# 拾页账号数据与加载路径

当前测试站使用 CloudBase Auth、PostgreSQL 与 CloudBase 私有云存储。浏览器 IndexedDB 保存已验证账号的元数据缓存、图片缓存和待同步队列，不是独立数据源。缺少 CloudBase 配置或身份核验失败时，页面显示错误，不读取私人缓存或切换到浏览器资料库。

## 读取

1. `src/cloud-session.js` 初始化 CloudBase SDK；`src/cloud-auth-ui.js` 验证登录与账号授权后才打开 App。
2. `src/cloud-store.js` 先提供该账号已验证的本机快照，再从 CloudBase 读取修订和变更；只有受影响的记录和图片失效。`src/cloud-revision-realtime.js` 在 PostgreSQL CDC 获授权并启用后订阅当前账号的修订号；当前个人版环境缺少 `realtime` schema 和连接角色，因此保持轮询。页面回前台、恢复网络及定期轮询兜底；网络故障保留可恢复的本机状态与明确错误。
3. 卡片优先使用低清封面与本机缓存；详情和画布根据显示尺寸按需读取更清晰的私有云存储图。作品列表只取摘要，进入作品才取完整文档。预览到达后原位替换，不为单张图片重建整页。
4. 原图、蒙版与作品文件由浏览器使用登录会话直接读写 CloudBase 云存储，RLS 仅允许访问本人路径。`shiye-api` 不转发图片字节。

```text
CloudBase 登录与账号授权 → 账号隔离的 IndexedDB 快照 → 首屏卡片
                                   └→ 后台读取 PostgreSQL 修订/变更 → 局部更新
可见封面 → RAM / IndexedDB → CloudBase 私有预览
进入详情或编辑 → 按需读取高清图与完整作品文档
```

## 写入与同步

本机修改先可靠写入账号隔离的待同步队列，页面操作不等待网络。图片或作品文件先上传 CloudBase 私有云存储，确认对象存在后再调用 PostgreSQL 的 `shiye_commit_v3_guarded` 事务提交元数据引用。低清封面在空闲时补齐，不阻塞原图和元数据提交。服务端操作收据用于识别结果不明的重试；明确冲突保留可恢复版本，未确认的操作不从队列移除。浏览器完全关闭后无法持续传输，重新打开并验证账号后继续。

```text
本机修改 → IndexedDB outbox → CloudBase 私有对象上传（如需）
                           → CloudBase 事务 RPC / 操作收据 → 已同步
```

账号、图片和作品不得在迁移或部署时清空。最近删除保留恢复入口；云存储原图物理回收必须由服务端完成完整引用、备份与延迟复核，浏览器不能仅凭删除卡片直接删除对象。当前账号彻底清空和自动回收尚未验收，保持禁用。

## 发布与核对

测试环境、函数配置和部署步骤见 `DEPLOYMENT.md` 与 `docs/CLOUDBASE_TEST_ROLLOUT.md`。静态网站和 `shiye-api` 是两个独立部署单元。只发布生产模式的 `npm run build` 产物；`npm run test:ui` 生成的是测试夹具构建，不能上线。`dist/version.json` 的 `commit` 必须与 `test` 提交 SHA 和实站响应一致。真机登录、云存储读写、离线续传和跨设备同步需要单独验收。
