# CloudBase 同步 413 / COS 无响应修复（test）

## 来自实际诊断的证据
用户上传的 2026-10-19 13:08Z 诊断报告：16 项待同步，15 项重试，云端 revision=50；主要失败为 `编码与上传 trash` 的 413；COS 签名请求成功后，不少 PUT 已报告全部字节发送，却返回 `NetworkError` 和空 HTTP 状态。它们是两条不同的故障链，并不能因上传进度达到 100% 就认定对象已保存。

## 本次代码变更
- `cloudMetadataRecord('trash', deletedAsset)` 移除**上传副本**中的冗余 `sourceRegion` 和 `sourcePixels`，不修改 IndexedDB 中的回收站原稿；ID、日期、图片引用、可恢复的其他资产字段保留。独立素材使用同一处理。
- 超出上限的其他回收站记录（例如大型作品）**不会自动截断或标记提交成功**；明确保留并报告 413，等待后续将大文档移动到 COS。旧的 oversized 项不再被另一项后台提交意外唤起；用户主动重试仍可验证修复效果。
- 401/403/413 等确定性拒绝，不作为作品冲突的证据，避免因服务器拒绝而复制、分叉作品。网络响应不明仍走已有收据核对。
- iOS XHR PUT 已发送完整字节但没有可读取 HTTP 响应时，产生 `SHIYE_COS_NO_RESPONSE`，不能认定上传完成；依然保留原图及待同步队列。上传失败后应核查 COS 桶 CORS 是否允许该静态网站来源的 PUT、`content-type` 和 `x-cos-forbid-overwrite` 请求头，以及 COS 请求签名。
- 诊断导出 v3：413 正确分类为 oversize，记录已白名单化的 CloudBase 错误码、请求编号及最近界面提示。不会导出签名 URL、作品内容、密钥和完整原始错误消息。

## 验证及限制
执行单元测试：`node --test tests/cloud-record-guard.test.js tests/cos-upload.test.js tests/project-sync.test.js tests/sync-diagnostics.test.js`。当前合并前以隔离 V8 smoke 复现并通过：回收站像素剥离、未知超大项目被拒绝、旧 413 后台隔离与其他项继续、403 不分叉且保留原始操作、诊断 v3。完整浏览器 CI / 真实 CloudBase、COS 仍需单独验收，不能据此保证线上自动恢复。

本变更只更新静态前端，不改变 `shiye-api` 云函数、数据库 schema 或 COS 对象，不需要重新上传素材。部署之后先在**原故障设备**保留队列、打开应用观察已卡住记录是否继续提交，导出新版 v3 诊断核对。若仍发生 COS no-response，应在 COS 控制台核对 PUT 跨域允许请求头；未获取明确 COS 响应前不能清除本机缓存。
