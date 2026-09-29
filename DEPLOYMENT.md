# 拾页：大陆访问与托管迁移

## COS 私有对象接入（可选）

本轮功能 e8a6b772b77dab976645d433a16ef3cb60c72bbb 自动 Git 部署 dpl_EMNm2EwDXum3mVgV4U5GganYRhBp：READY/source=git/准确 SHA/原固定别名已核对。127项单元、构建及 UI/HTTP 冒烟和四视口真实 Chromium 回归通过。COS 接口线上已部署，但当前服务器授权未配置，故新写入仍为 Supabase；未声称实际 COS 速度或可达性验收。私人 CeCe 历史补全云版本74，四页当前作品不变，其他记录及图片字节精确保留。

仍由 Supabase Auth/allowlist 与关系记录控制账号权限。Vercel `/api/cos` 只对已验证账号签发自己的哈希对象 GET/PUT，签名60秒，响应 private,no-store。腾讯官方 cos-nodejs-sdk-v5 仅服务端使用。

服务端变量：SHIYE_COS_SECRET_ID、SHIYE_COS_SECRET_KEY、SHIYE_COS_BUCKET、SHIYE_COS_REGION。只允许最小权限子账号读写指定私有桶对象，不授予删除、ACL或其他产品权限。桶 CORS 限 https://shiye-journal-test.vercel.app、GET/PUT、content-type/x-cos-forbid-overwrite。不得公开桶或将密钥放进前端变量。先验私有测试对象的鉴权、上传、下载及哈希，再设置 VITE_SHIYE_OBJECT_STORAGE=cos 开启新写入。

旧 Supabase 记录保留，按 storageProvider/projectDocumentProvider 读取。COS 未配置或失败明确报错，不迁移、不回退。DNS 不会直接加速图片；固定网址不改，COS 原站签名不能替代 CDN 鉴权。

日常上传先写账号隔离持久队列，切换页面不取消上传；必须经云端事务确认才删除队列。备份、退出及覆盖恢复等待确认属于必要顺序。缓存不绕过登录；强制关闭浏览器无法保证后台 JavaScript 继续运行，重开恢复上传。未同步时清除网站数据可能丢失待上传资料。

## 账号缓存与私人作品：2026-09-29

更新：caded69自动Git部署dpl_4Jz5yN8yjGNobSas5eQEaDkTaXfM为READY，准确SHA和原固定别名已核对。经用户确认，线上正常登录界面成功导入四页原生私人作品；版本56，4份gzip作品文件、26素材与30新图片/封面，42旧CeCe素材已专项替换。其他189素材/10系列/20最近删除/6元数据与真实迁移前备份规范化内容摘要完全相同；未清空旧私有二进制文件，完整本机备份可恢复。后续渐进图片和新上传原图零重复下载补丁正在验收。

代码 `caded69b05d74a41c3e14fedd4235a3222d94c01` 已推送 main，自动 Git 部署正在核对。准确暂存快照115项单元/UI/HTTP通过；真实 Chromium 四视口缓存、原生Goodnotes16张、创作80张与连续导入/最近删除8张通过。隔离快照初次字体被开发服务器阻挡、首次依赖优化导致重载的失败不计通过；允许测试共享依赖并预热后独立复验通过。本机重复打开四页23–34ms，不代表真实iPad或线上冷启动成绩。

Supabase增量变更键日志已应用、RLS/CAS实际回滚验证通过；私人旧完整备份恢复及图片哈希对照通过。CeCe私人包仅在/tmp，待原网址准确READY后通过正常登录界面迁移；其他资料不动。

Cloudflare插件已连接一个账号，但 R2 列表接口返回10042（尚未在控制台开通）。需要用户自行完成R2开通、账单资料或条款；未创建公开桶、改DNS或搬走Supabase原件。后续采用私人对象存储、账号鉴权和分级缩略图，不接入4090。公开R2自定义域名直接暴露桶不适合私人素材；必须经过鉴权后才能读取或命中受控缓存。

## 免费浏览器模型：2026-09-29

首批 `f54ab5643a0c0ccf1314884c39af105c9ac2bec6` 已由 Git 自动产生 `dpl_6YzgAb3hkjjatzPPxTfPH449Ndkt`：source=git、READY、准确SHA与原 `shiye-journal-test.vercel.app` 别名核对，Vite构建35.254秒。没有另建项目、部署本机GPU服务或修改DNS。线上隔离浏览器在该域名实际运行公开模型worker，用三块合成纸片17.815秒得到3个有效遮罩；未登录的私人数据仍被阻挡，没有访问/上传私人库。此测试只验证线上模型运行，不是实体iPad性能或全图精度证明。

首批准确暂存快照94项及UI/HTTP通过，实际原图5件、25张静态浏览器导入流程通过；连续两批合成导入断言同一模型worker只创建一次，8张完成/最近删除封面截图通过。复查蓝色纸品见一处误咬边后，追加仅对面积填充率≥96%的近矩形采用OpenCV直边先验，并用copyTo正确打包ROI行步幅；新增回归后95项与UI/HTTP通过。追加代码仍须按新Git SHA核对自动部署。

近期error日志扫描没有返回条目，log drains为0；未配置持续监控，不能把空日志当整体健康保证。全部照片和截图仅/tmp，Goodnotes/CeCe未完成覆盖迁移、本机SAM2/SAM3实验与凭据不在发布范围。

## 云接入准备：未发布、未启用

后续验收更新：用户已通过正常控制台创建测试账号，白名单授权成功。真实 SDK 登录、六表恢复、图片原字节、失败事务回滚、匿名及越权拒绝通过；实际应用完整备份恢复及四视口布局也通过。本批准备通过 Git 自动发布单用户云模式，只设置生产环境的可发布 URL/key，未使用服务角色密钥。新 Goodnotes/CeCe v5 覆盖迁移不纳入本批。最终部署以对应 Git SHA、READY 和固定别名核验为准，不从推送成功推断。

安全扫描提示泄露密码防护未开启，参见 [Supabase 密码安全](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)。测试弱密码必须在正式使用前更换。云端当前只含应用自带样例；原网址原设备的私人资料需“账号 → 导出本机旧资料”后显式恢复，开启云端不代表已迁移旧库。账号菜单原生自动化输入本轮未生效，DOM 激活验证通过，实体设备触控仍待验收。

Supabase 已连接已有项目 `zyhmbxrzlwsefblkvsuv`，schema 在 `deploy/supabase/schema.sql`，已应用一次，勿盲目重复执行。`shiye-private` 桶为私有。Auth 用户尚未创建，先由用户正常控制台创建测试账号，再用真实 UID 授予白名单，验收登录与完整恢复后才启用。

启用时 Vercel 仅配置 `VITE_SHIYE_SUPABASE_URL` 与可发布的 `VITE_SHIYE_SUPABASE_PUBLISHABLE_KEY`，绝不配置前端 service-role 密钥；不要提交任何环境值、用户密码或私人附件。账号密码仅交给正常 Auth 控制台输入。当前没有部署账号引导 Edge Function；被审批拒绝的高权限无 JWT 入口不得重试或绕过。

现有浏览器数据不自动上传、不静默清空。先从原网址原设备导出完整 `.shiyepwa`，在云模式登录后显式恢复；云端 CAS 冲突必须报错，不覆盖另一设备的更新、不回退本机。新配置须同时验未登录阻断、跨账号隔离、私有图片、完整备份恢复与错误路径，再通过 Git 自动发布到原固定网址。本地准备代码当前尚未提交/推送。

## 最新代码批：原路返回、完整图形与导入识别

功能提交 `d472004d5ed33339be0aaeabb0baaa261934a106` 已自动Git生产部署 `dpl_7brfrS31muPkYA2E4SmsHLANfNAk` READY，固定别名精确匹配，线上 `index-DcrI409a.js` 与本地HEAD构建一致；普通解析下搭配4视口、导入25幅和3档合成识别通过。CeCe图形目录线上下载超过测试原先固定250ms等待，非模型或图形缺失；验收改等实际内容，补载入状态、会话缓存和切换菜单的过期请求防护，随后仍需核对追加提交READY。没有临时节点覆盖、DNS变更或手动发布。

2026-09-29 此批本机85项单元、UI／HTTP、真实Chromium手机／iPad横竖／桌面专项通过，CeCe复用图形109个、搭配自动草稿和返回搭配、选择／封面／套索修复，导入即时照片与阶段进度、右栏局部选择和阴影噪声过滤。用户原图本机导入25幅验收仅5件实际素材；没有提交或上传该照片。识别设置三档传统精度，不是虚构已接入的大模型分割。发布仍只允许origin/main自动构建到原 shiye-journal-test 项目，准确READY提交和别名需推送后再次核对。

当前实际DeepSeek请求75秒没有响应头，匿名两个解析IP也无法完成TCP/TLS；不能拿此前成功的模型请求证明当前公司网络可达。没有通过加超时掩盖外网故障，没有密钥进Git或Vercel环境。

## 本轮发布验收：页面 BUG 与创作交互

2026-09-29 固定筛选／图片框、作品长按信息、新标签与最近删除、局部更新、Panzoom手势及画布原位文字修复已完成本地69项单元、UI／HTTP和最终静态Chromium主流程109张／导入25张／创作80张／选择30张／布局64张回归。新增40张交互专项使用合成资料、隔离浏览器；不是实体iPad或软键盘验收。生产依赖npm advisory审计0漏洞，Panzoom MIT许可随构建输出。

功能提交 `9914b448647454b45a5b61a3f4b440ef9ec9a520` 已自动生成Git生产部署 `dpl_HfkLpkUXL8PpT6ZfNhePwrcZUbri`：READY、构建20.027秒、原固定别名 `shiye-journal-test.vercel.app` 精确匹配。线上入口 `index-CdcXRPvQ.js`／`index-DxD4l7qC.css` 与本地最终构建一致。未改DNS／服务器数据，未提交私人图片、实时备份或密钥。

线上交互40张、创作80张普通解析下通过，暂停可选请求的单次首屏1387ms，释放后菜单保持。完整预览／导入／选择／主流程的普通解析首轮均未能完成首屏，HTTPS许可文件请求亦15秒连接超时，未计通过；各自隔离浏览器仅临时指定同域名可达节点64.29.17.131后，独立重试64／25／30／109张全部通过，许可文件200。未修改系统／域名DNS。已查看四种视口截图；屏外或尚未下载图像不视为全部加载完成。过去一小时error日志0行、Drains0，未配置持续监控，不能把空日志或节点重试成功当全网可达保证。截图与下载只在/tmp，不是实体Safari／Pencil／软键盘验收。

随后只补充此部署记录与主流程测试的隔离浏览器启动参数支持；不改变应用构建。文档提交也必须核对同一Git自动READY和固定别名，公开JS／CSS仍为上面的已验收哈希。

## 历史自动发布：成熟功能复用

2026-09-29 本轮源码已通过67项单元、UI／HTTP冒烟及最终静态Chromium主流程109张、导入25张、创作80张、选择30张、完整预览64张。锁定的OpenCV／Lucide／idb／Ajv／pdf-lib与许可生成脚本一起构建；`.vercelignore`已允许两个必要脚本，仍排除密钥、私人素材、备份、测试产物和服务器文件。只使用原 `main` Git自动部署及 `https://shiye-journal-test.vercel.app`，不创建另一个网址。

复用源码提交 `7aec029a032c1dc57d2699922eee08e40f223871` 自动生成 Git 生产部署 `dpl_FQiUBCCDBUMV56LQ15Fiq94y4oRu`，READY、构建21.073秒，原固定别名精确匹配。线上HTML入口 `index-DtsIFSrW.js` 与本地静态构建一致，第三方许可文件200。普通解析下两次浏览器页面加载失败（chrome-error），未计通过；隔离导入浏览器临时指定64.29.17.131后，25张导入回归通过、真实Worker校正与候选流程正常，不修改系统／域名DNS。线上布局首次临时指定后仍加载失败，亦不计通过。

上述源码的线上布局独立重试64张通过；测试启动明确使用 `SHIYE_BROWSER_ARGS` 在隔离会话临时指定同一可达节点，不修改系统／域名DNS。截图、下载仍只在 `/tmp`，手机／iPad横竖／桌面为Chromium视口模拟。不能把网络受限下的成功条件当普遍可达性保证。

字号prompt与回归提交 `ee92450fe04535d60514a5bb3c837b5257e3d615` 自动生成 Git 生产部署 `dpl_EJbTJRRbS9edPf9p11xjSSTAdcL9`：READY、19.453秒、原固定别名精确匹配。线上入口 `index-V2JeKhav.js` 与本地最终构建一致。隔离浏览器临时指定同一可达节点后，32张既有模型结果的预览／编辑与文字随画布等比缩放断言通过；这验证新站点显示，不代表新prompt已调用真实模型。未修改私人资料、系统或域名DNS。

OpenCV约15.5MB惰性下载，首次图像处理需要联网；不将其加入首屏预缓存。文本模型已实测不代表浏览器CORS／视觉参数全分支通过，网络与实体设备边界仍保留。

## GitHub 自动更新与固定测试网址

2026-09-29 创作交互增量在本地通过 39 项单元、UI 冒烟及 214 张 Chromium 浏览器截图后推送；随后筛选／选择增量达到 42 项单元与 244 张截图。发布仍仅采用下述项目的 `main` Git 自动构建与固定网址，不上传私人原图、测试产物、密钥或实时数据。逐次部署核对 Git SHA、`source=git`、READY、生产别名和线上浏览器结果，证据如下。此前 30 项和 20 张线上记录为历史范围，不应当作最新代码上线证明。

功能提交 `8a98f16ea298f8dfb2a01d41aa8781d123e9af97` 已由 Git 自动生成 `dpl_7Ghyq3b2ysG4pzCyaKQ6TNnjt6y1`：生产 READY，Vite 构建约 9.5 秒，固定别名准确指向此部署。线上主流程 109 张通过，但创作专项发现可选样例异步完成会关闭已打开筛选菜单；此失败没有计作通过。后续补丁禁止可选样例在菜单／输入交互期间重绘，并用暂停／释放请求验证同一菜单节点仍存在。独立线上导入首轮启动未完成，已终止测试进程；不能把该次算通过。最新线上完整复查另行记录。

补丁 `8349ef21c3ec76ff79be57cc0fff7568f7132a8b` 的 Git 生产部署为 `dpl_3SFwrmcLZxFcteVs88Aw55QFAHZJ`：READY、构建约 10.3 秒、固定别名匹配。线上独立顺序重跑通过创作 80 张、主流程 109 张及导入 25 张；暂停／释放样例请求后同一菜单保持打开、排序生效。已查看手机、iPad 横竖和桌面截图。此前失败／中止不计通过。error 日志扫描过去一小时返回 0 行、Drains 为 0，没有持续监控，不能将空日志当作全面健康证明。

之后用户追加筛选样式与选择模式修改，本地 42 项单元、UI 冒烟及新增 30 张选择流程专项通过（合成资料、实际 PNG／JPEG 导出、归类及安全删除），既有 80／109／25 张回归也通过。

该功能提交 `bc34d147400ed971ac087fdf6a032b1b2d2b074e` 自动生成 Git 生产部署 `dpl_GaZAAFeQ6DCg7KBHie3xi2TB2doR`：READY、Vite 构建约 9.5 秒、固定别名精确匹配。线上选择 30 张、创作 80 张、主流程 109 张、导入 25 张分别通过；查看手机、iPad 横竖和桌面视口截图。选择专项实际验证跨系列保留选择、两种底栏、子菜单、归类、导出、缺密钥保护与安全删除。

本批线上启动出现多次 `Missing .series-grid`，隔离测试页诊断为 `ERR_TIMED_OUT`；这些尝试未算通过。只读探测同一域名的两个官方解析地址：`64.29.17.131` 返回 200，`216.198.79.131` 当次 15 秒连接超时。普通解析下独立重试的选择／主流程通过；创作完整重试（含独立首屏）和导入重试仅在各自隔离测试浏览器临时指定前一个可达节点，网址不变，没有修改系统或域名 DNS。此条件下暂停可选样例请求的可用首屏约 1436 ms，释放后活动筛选菜单未关闭；这是单次条件测量，不代表所有网络的加载速度或大陆可达性保证。线上 error 日志过去一小时返回 0 行，Drains 仍为 0，未配置持续监控。截图／下载仅在 `/tmp/shiye-production-*`，不提交仓库。实体 Safari／Pencil、真实模型 API、完整 Swift 等价功能仍未验收；不能用 244 张截图掩盖这些边界。

随后仅补充此交接记录；文档提交仍通过同一个 `main` Git 自动发布。核对其 READY、准确提交和固定别名，并确认公开 HTML 的 JS/CSS 哈希仍与已验收功能提交一致；文档本身不改变页面实现。

用户要求后续验收通过的代码全部提交、推送至私有仓库 `T0nglinziyong/shiye-journal`。按用户最新指定，唯一测试入口为 `https://shiye-journal-test.vercel.app`，使用现有 Vercel 项目 `shiye-journal-test`（`prj_96WRMneQ8J6gF1X7DUuzDqk5bWrE`），不创建新项目、不改变网址，也不改 `shiyejournal.vip` 的 DNS。旧临时项目不再作为发布目标；不要删除旧站或其浏览器资料。

2026-09-29 用户重新关联后实查：项目 Git `link.type=github`，仓库为 `T0nglinziyong/shiye-journal`，Production Branch 为 `main`；项目域名列表包含已验证的 `shiye-journal-test.vercel.app`，无分支限制、无重定向。此前授权失败已解除。框架 Vite、构建 `npm run build`、输出 `dist`；后续以每次推送的准确 Git 提交触发 `READY` 部署，并更新同一生产别名为验收依据，仅关联成功不代表最新代码已发布。不要通过更换项目或借用密钥绕过授权。

本次实测：第一次推送 `544bc45` 后未出现自动部署，也没有具体失败原因；随后从该 GitHub 提交手动创建生产部署 `dpl_B17YrFgSTCXaZpEz1UEREYmqNLhi`（`source=cli`），READY，构建约 16 秒。**第二次推送 `d9927333481adedf15f4789fa18e89895c231f82` 已自动生成生产部署 `dpl_2hQXWo455FugrNkUdxmW3AehxM8p`，`source=git`、准确提交匹配、状态 READY，固定生产别名包含 `shiye-journal-test.vercel.app`；Git 推送自动发布已实际验证。**无需用户再次关联，不把第一轮没有触发推断为已确定的身份／授权故障。没有上传本机环境文件、私人照片或备份。检查过去一小时的 error 日志未返回日志；Drains 为 0，没有配置持续监控，不将空日志称为完整健康证明。

该次线上检查：30 项单元与 UI 冒烟通过。完整浏览器回归第一次在线启动等候超时，没有通过；随后独立隔离浏览器重试成功，390×844、768×1024、1024×768、1440×900 的系列、全部素材、搭配、作品、导入入口共 20 张截图，无页面横向溢出及未处理异常。已查看四种视口截图；手机四项筛选文字仍有截断，需后续修正。素材页有视口外待加载图，未将待加载计作失败，也不宣称全部图像加载完成。产物在 `/tmp/shiye-production-confirm/`，只用内置样例，不上传私人照片。此验收不包含导入完整操作、实体 iPad Safari 或全部 Swift 等价功能。

新增 `.github/workflows/verify.yml`：推送 `main` 或 PR 时以只读权限运行 Node.js 24 单元／构建／UI 冒烟，以及合成 Swift 备份转换测试；不读取私人备份、不配置服务密钥。这个检查与 Vercel 的 Git 构建是独立的，不宣称它自动阻止生产发布。每次本地仍须验收后再推送。自动构建／发布的官方说明见 [Vercel GitHub 集成](https://vercel.com/docs/git/vercel-for-github)。

## 历史：2026-09-29 临时 Vercel 测试发布

用户要求暂时发布最新本地改动进行测试，使用 Vercel CLI 60.1.3 的 `vercel deploy --temporary --yes --json` 创建可认领的匿名部署，不连接 GitHub、不覆盖旧站点、不修改 `shiyejournal.vip` 的 DNS。构建为纯静态 Vite；未部署 Node 数据服务，线上默认仍是当前网址／设备的 IndexedDB。

当时生成的测试网址是 `https://temporary-fleet-oxygen-f2279rt.vercel.app`。该项目后来已由用户认领，本机通过正常登录关联到同一项目，并通过 `vercel build --prod`、`vercel deploy --prebuilt --prod` 发布；当次返回 `READY`。它不再是未认领的 60 分钟匿名部署。认领链接、认证文件与令牌均不写入 Git 或文档。该记录仅作历史，之后用户指定 `shiye-journal-test.vercel.app` 为唯一测试入口；旧临时站不能用来验收后续改动。

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
# AI 超时与搭配方案批次：发布前验收（2026-09-29）

## 有效凭据的真实线上验收（后续更新）

修复提交 `3b61d84e318c6866a824f1a99c34f273d2e2f173` 已自动生成生产部署 `dpl_89ipEqKXXpRqXbNY3urQDwCBDyjR`：READY、source=git、准确 SHA、固定 `shiye-journal-test.vercel.app` 别名均核对，公开入口为 `index-YPdHeZHL.js`。修复原生多工具回执中途插入用户图片导致 DeepSeek HTTP400 的问题，79项单元及UI冒烟通过。

用户授权的真实密钥只通过非回显stdin传入线上隔离浏览器，实际调用 DeepSeek Flash（流式，75秒无数据超时，6000 tokens，最多5轮），只用临时合成叶片图片。识别1.252秒保存有效元数据；工具模式4轮0.548/1.924/1.430/1.038秒完成；直接模式1.639秒完成。共6次请求全部HTTP200，无超时或浏览器异常；两种生成结果均实际打开可编辑草稿并保存作品，截图已查看。报告及图片仅在 `/tmp/shiye-ai-live`，密钥已从隔离上下文移除，不在仓库／Vercel设置中。

复测网站仍采用测试进程同域名可达节点64.29.17.131覆盖，未修改DNS；模型接口正常直连。仅证明本次简单封面与识别样例成功，不保证所有复杂任务、网络和设备永不超时。下述“未有效密钥验收”是此前阶段记录，已由本段更新。

78 项单元及 `npm test && npm run test:ui` 通过；真实 Chromium 交互40张、布局64张、匹配方案4种视口通过。匹配专项使用合成素材和模拟SSE，验证不跳页、刷新保留、草稿→保存作品、重置不删除作品；不是有效 API 密钥的真实生成验收。当前机器浏览器直连 DeepSeek 以无效测试密钥取得401，只有连通性证据。两张经许可在线分割照片和返回蒙版仅在/tmp，详见 IMAGE_STORAGE_REVIEW。

功能提交 `0262f17afabaa51aeb563f76490f84201ddf6b46` 已由 Git 自动生成生产部署 `dpl_EiQt1di6TftYzosio6nACNfR3F88`，`source=git`、READY、Git SHA 完全匹配，别名包含 `shiye-journal-test.vercel.app`。线上主脚本 `index-CdYQqi9d.js` 与本地构建相同。未手动部署、新建项目、修改 DNS、迁移数据库或发布任何凭据／私人备份。

普通网络首轮匹配／交互浏览器均停在首屏，未计通过。curl 主脚本15秒只取得19379字节后超时（HTTP200不是完整加载证明）。同域名临时指定可达节点64.29.17.131后取得完整513363字节，线上匹配流程4视口与交互40张回归通过；仅测试进程使用网络覆盖，没有修改系统／域名 DNS。实体 Safari、用户有效 DeepSeek 密钥的完整识别与生成未验收。追加本机检查素材外观／方向8种画面无控件重叠，均为合成图片。截图仅/tmp。
