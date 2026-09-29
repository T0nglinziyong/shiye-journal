# 拾页：大陆访问与托管迁移

## GitHub 自动更新与固定测试网址

用户要求后续验收通过的代码全部提交、推送至私有仓库 `T0nglinziyong/shiye-journal`。生产入口固定为 `https://temporary-fleet-oxygen-f2279rt.vercel.app`，继续使用现有 Vercel 项目 `temporary-fleet-oxygen-f2279rt`，不创建新项目、不改变网址，也不改 `shiyejournal.vip` 的 DNS。

2026-09-29 检查：仓库访问正常，Vercel CLI 登录正常，现有项目的 Git `link` 为 `null`；`vercel git connect` 因无法访问此私有仓库而失败。**自动部署尚未接通**。需要用户在该项目 Settings → Git 中连接 `T0nglinziyong/shiye-journal`，并在 GitHub 授权 Vercel App 仅访问该仓库。连接成功后确认 Production Branch 为 `main`，框架 Vite、构建 `npm run build`、输出 `dist`；以实际 Git 提交触发的 `READY` 部署与相同生产别名为验收依据。不要通过更换项目或借用密钥绕过授权。

新增 `.github/workflows/verify.yml`：推送 `main` 或 PR 时以只读权限运行 Node.js 24 单元／构建／UI 冒烟，以及合成 Swift 备份转换测试；不读取私人备份、不配置服务密钥。这个检查与 Vercel 的 Git 构建是独立的，不宣称它自动阻止生产发布。每次本地仍须验收后再推送。自动构建／发布的官方说明见 [Vercel GitHub 集成](https://vercel.com/docs/git/vercel-for-github)。

## 2026-09-29 临时 Vercel 测试发布

用户要求暂时发布最新本地改动进行测试，使用 Vercel CLI 60.1.3 的 `vercel deploy --temporary --yes --json` 创建可认领的匿名部署，不连接 GitHub、不覆盖旧站点、不修改 `shiyejournal.vip` 的 DNS。构建为纯静态 Vite；未部署 Node 数据服务，线上默认仍是当前网址／设备的 IndexedDB。

本次生成的测试网址是 `https://temporary-fleet-oxygen-f2279rt.vercel.app`。该项目后来已由用户认领，本机通过正常登录关联到同一项目，并通过 `vercel build --prod`、`vercel deploy --prebuilt --prod` 发布；当次返回 `READY`。它不再是未认领的 60 分钟匿名部署。认领链接、认证文件与令牌均不写入 Git 或文档。**后续导入／素材检查／筛选及新 Swift 基准的本地改动尚未再次发布**，不能用线上旧版本验收这些改动。

部署技能用于核对上传范围和构建：新增 `vercel.json` 固定 Vite 构建与 `dist` 输出、Service Worker 不缓存旧版本；`.vercelignore` 仅允许静态程序构建输入，排除环境文件、服务器代码、交接文档、密钥配置与备份。CLI 生成的 `.vercel/anonymous.json` 含临时凭据，整个 `.vercel/` 已被 Git 忽略，勿提交或公开。部署前 `npm test && npm run test:ui` 再次通过；上线后的真实浏览器检查使用隔离上下文和合成数据，不读取私人资料。

默认样例及浏览器测试基线不是用户 iPad 的私人数据。若用户要迁移旧网址资料，请先在原设备原网址导出完整备份；新 URL 不会自动读取旧域名的 IndexedDB。测试期间也应自行导出备份，托管项目不提供浏览器私人资料的备份保证。

## 当前发布模型

`npm ci && npm run build` 生成纯静态 `dist/`，可发布在 Vercel、Cloudflare Pages 或其他能提供 HTTPS 的静态站点。PWA 需要 HTTPS 和站点根路径。静态前端、样例图片、Service Worker 都随构建输出，不依赖某个托管商的运行时。用户新导入的私有素材、作品和笔迹保存在浏览器的 IndexedDB 中；部署更新不会自动同步不同设备。

2026-09-28 的线上验证：同一 Vercel 网址导入一张素材后刷新，数量从 202 增至 203，新增项仍在；新建草稿后刷新，作品从 4 增至 5，草稿仍在。这里验证的是同一浏览器、同一 HTTPS 来源的重开持久性。Safari 私密浏览、手动清除网站数据、系统空间回收、卸载浏览器或更换域名仍可能让本机数据不可用；请定期在「设置 → 数据与诊断」导出完整备份。当前没有账户云同步，不能承诺数据在设备丢失后自动恢复。

Vercel 和 Cloudflare Pages 的构建命令均为 `npm run build`，输出目录均为 `dist`。目前 AI 在用户主动提供密钥后直接请求 DeepSeek 官方接口；该请求的跨境可达性、CORS 和模型服务稳定性与页面可达性是两件事。不要把任何私有 API 密钥写入 `public/`、`dist/` 或前端环境变量。

## 中国大陆免代理访问

1. 给当前 Vercel 项目绑定自有域名，并把字体、图像、脚本保持同源。请在中国移动、电信和联通的真实网络上分别测试首次访问、PWA 安装、离线重开，以及模型 API。Vercel 明确表示境外托管无法保证大陆可达；自有域名只是提高可达机会。
2. 如果需要稳定的大陆访问，准备自有域名与合规的境内静态托管/CDN。面向境内部署时先通过实际服务商完成相应 ICP 备案或许可，获批后在首页展示备案号。Cloudflare 中国网络是独立的企业级服务，也要求有效 ICP；普通 Cloudflare Pages 不等于境内节点。
3. 若保留 Vercel 面向境外访客，可从相同的 `dist/` 同时发布境内镜像，并使用自有域名分流。每次版本号和静态资源保持一致。不能用服务商的默认域名和海外 CDN 来承诺免代理访问。

## 未来迁移 Cloudflare

在 Cloudflare Pages 中选择 Vite 项目，构建命令 `npm run build`，目录 `dist`；先使用测试域名检查 `/manifest.webmanifest`、`/sw.js`、`/cece/collection.json` 和 42 张素材图的 200 响应，再切换自有域名。保留旧域名供用户导出完整备份，切换域名后从设置页导入备份。IndexedDB 按站点来源隔离，DNS 或托管切换若保持完全相同的域名与 HTTPS，浏览器数据通常仍处于同一来源；换域名则必须迁移数据。切换时先导出备份验证可恢复，不把浏览器缓存当作备份。

未来同步服务使用与前端隔离的标准 HTTPS JSON API（账号隔离、版本与冲突处理、私有对象上传），前端只依赖接口协议。Worker、R2、D1 可以作为一种实现，但不应把平台 SDK 放进领域模型；若接入 4090 主机，也走相同的 API。当前仓库尚未实现账号、跨设备同步或 AI 请求代理，不应在 UI 中声称已经具备。

官方依据：Vercel 的 [大陆访问说明](https://vercel.com/kb/guide/accessing-vercel-hosted-sites-from-mainland-china)、Cloudflare 的 [Pages 构建配置](https://developers.cloudflare.com/pages/configuration/build-configuration/) 和 [中国网络 ICP 说明](https://developers.cloudflare.com/china-network/concepts/icp/)。


## 数据服务与部署边界
Vercel 和 Cloudflare 上的静态 PWA 只有在设置中连接可达的 HTTPS 拾页数据服务时才使用 4090 机器作为唯一数据源；本地 Node 服务是标准 HTTP/JSON，不绑定托管商。公网代理需配置 SHIYE_TOKEN 和 SHIYE_ALLOWED_ORIGINS，并备份 SHIYE_DATA_DIR。未经网络配置，线上版本继续使用各浏览器 IndexedDB。

若整个站点直接部署在 4090 上，改用 `deploy/self-host/` 中的 Caddy、systemd 与环境文件模板。网页和 API 同源，`SHIYE_ALLOWED_ORIGINS` 不需要设置，令牌与数据目录留在 4090；Vercel 项目不再参与新域名的发布。旧 Vercel 网址独立保留，不自动迁移原有浏览器资料。
