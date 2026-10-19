# CloudBase 浏览器直连、COS 存储与登录排查（test）

## 当前边界

* 所有图片、Mask、候选框及大型可编辑作品文档应保存在 COS；CloudBase SQL 只能包含引用及结构化元数据。
* 浏览器现有 COS 上传是通过后端获取**短效签名**后，直接 PUT 到 COS；**不能**将 COS SecretId/SecretKey 或后端签名逻辑移动至前端。

## 前端不通过 Vercel 的 CloudBase 网关

1. 在 CloudBase 环境中配置允许的 Web 安全域名，包括实际访问 PWA 的域名和本地开发域名（具体以控制台字段和要求为准）。否则直连 Auth、RDB 会遇到跨域/安全域拦截。
2. 配置浏览器公开变量 `VITE_SHIYE_CLOUDBASE_ENV_ID` 和 `VITE_SHIYE_CLOUDBASE_PUBLISHABLE_KEY`。如前端仍由 `.vercel.app` 提供，把 `VITE_SHIYE_CLOUDBASE_DIRECT=true` 并**重新构建部署**，跳过该主机名的同源网关覆盖。若未开启，兼容代理仍生效，以免测试网站突然断开。
3. 图片签名及管理类后端接口不自动随 CloudBase Auth/RDB 直连而迁移。把对应签名/鉴权服务部署至 CloudBase 云函数或云托管，正确配置 CORS、Secret、用户身份校验，并通过 `VITE_SHIYE_API_ORIGIN` 指向服务端 API。此项需要在 CloudBase 控制台操作；现有部分硬编码 `/api/*` 管理路径仍需单独迁移/检查。
4. 在浏览器开发者工具 Network 中验证：Auth/RDB 指向 CloudBase 网关；COS PUT 指向 COS；只有 COS 签名请求发往受保护的 API。旧站点与新站点不同 origin，本地 IndexedDB 和登录会话不会自动共用，迁移域名前先确保同步完成并备份。

## 登录

CloudBase SDK 管理浏览器会话及刷新；有效会话应在重新打开网站时恢复。**会话不是无限有效的**，过期或已撤销时仍需登录。网络或账号核验失败要给出重试入口，不能将其误显示为“密码错误”或承诺永久免密码。

## 413 元数据请求和队列

代码会在远程编码阶段剔除旧素材 `sourceRegion` 像素缓存，数据库提交前验证实际序列化请求体积，明确识别 HTTP 413（不是编辑冲突）。剥离只作用在发送版本，**不会删除 IndexedDB 里原有待同步记录**。如仍有异常，先在原设备导出本机完整备份，不要清空站点数据或待同步队列。
