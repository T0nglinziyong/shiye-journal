# CloudBase-only 浏览器与 COS 接入

浏览器通过 `@cloudbase/js-sdk` 直连 CloudBase Auth/RDB，并使用 `app.callFunction({name:'shiye-api'})` 获取 COS 签名与服务能力。不存在托管平台同源 HTTP 代理。

## 配置
浏览器仅使用 `VITE_SHIYE_CLOUDBASE_ENV_ID`、`VITE_SHIYE_CLOUDBASE_PUBLISHABLE_KEY`。COS 桶与地域、执行角色权限和私有签名全部位于 `shiye-api` 云函数；使用既有桶，不能把明文密钥提交到 GitHub。

## 读写安全
数据库存业务记录、修订、操作收据、检索元数据；COS 存原图、Mask、派生图和大型完整作品。上传先确认图片 PUT、再提交 PostgreSQL 元数据，未确认对象的原稿留在 IndexedDB。本机队列以账号和 origin 隔离；换域名不会共享 IndexedDB。浏览器不得在 CloudBase 异常时写入另一个远端服务。

## 未启用能力
`/api/platform-health` 展示实际后端可用性；`/api/storage-usage` 只读当前账号。语义检索 UI 预留，但 Embedding 模型未接入，不能按已启用展示。账号清空/后台 GC/跨账号管理在服务端安全实现和验收前禁用。

## 故障诊断
看同步诊断 v3 的 `lastDisplayedFailure`、413 类别、请求编号和 COS PUT 阶段。POST 签名调用成功并不证明 COS PUT 成功；收到 HTTP 0 或浏览器 NetworkError 时，先查桶 CORS（GET/HEAD/PUT、所需请求头）与签名，再验证 COS 对象是否存在。不能删除待同步队列来掩盖故障。
