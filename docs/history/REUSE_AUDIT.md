> **Current-only（2026-10-04）**：旧 Swift/CeCe 转换、旧 seed 与旧格式迁移已经退出现行架构，不再作为复用目标；本文其余历史审计只用于理解现有模块来源。

# 通用实现复用审计

审计日期：2026-09-29。范围：`src/`、`server/`、`scripts/`、测试及构建的主要模块与调用关系。下面模块表记录替换前的审计基线，**不表示所有候选已接入**；实际落地及验收见本节。未读取私人照片或备份，不提交凭据、请求正文或模型生成草稿。

## 用户补充参考：一些替代建议.md

已完整阅读完整项目包的 `../../一些替代建议.md`（1627行），不把聊天导出的引用占位符、原生跑分或星级当作已验证结论。建议中的浏览器原生文件／Canvas／IndexedDB与OpenCV方向已采用。Fabric／Konva作为对象内核候选，但接入必须兼容现有毫米坐标、AI图层合同、旧备份、库存与取消行为，不因参考建议自动重写成Next.js／React或迁移数据库。

EdgeSAM点／框交互与MobileSAMv2整页候选发现值得分别基准测试。官方EdgeSAM确有ONNX导出／Web示例，但采用[S-Lab License 1.0](https://github.com/chongzhou96/EdgeSAM/blob/master/LICENSE)，含非商业用途与商业联系要求，不能按MIT依赖直接打包。原生iPhone吞吐不是浏览器性能保证；[ONNX Runtime Web](https://onnxruntime.ai/docs/get-started/with-javascript/web.html)兼容表应按实际版本与iPad核验，预处理、峰值内存、模型下载和掩膜质量需独立测试。本轮未下载模型、未部署4090推理／R2／Supabase、未上传私人素材或购买商业SDK，也未宣称智能实例分割已接入。

## 本轮实际落地

| 已复用的锁定依赖 | 已取代的通用逻辑 | 保留的领域边界 |
| --- | --- | --- |
| `@techstark/opencv-js@5.0.0-release.1` | 透视矩阵与逐像素插值、四边形轮廓、连通域／闭缝／填洞、最小旋转框、CLAHE 局部光照均衡 | 纸张点序／比例、最小实物尺寸、候选筛选、保守扶正、不覆盖用户修补；原图不均衡或改写 |
| `lucide@1.48.0` | 常用字体符号与自绘按钮图标 | Swift 对应含义、点击处理、计数、可访问名称 |
| `idb@8.0.3` | IndexedDB 请求与提交等待包装 | 同一 DB、版本和六张表、同步 raw 事务回调、备份格式；服务器失败不回退本地 |
| `ajv@8.20.0` | 工具 JSON Schema 手写递归验证 | 不强转、不补默认、不删除字段；库存、尺寸、有效前缀与原子组合工具仍由领域层负责 |
| `pdf-lib@1.17.1` | PDF objects／xref／字节编码 | 毫米 MediaBox、原实物尺寸、A4 分页与 10mm 标尺；调用已改为 await |
| `@panzoom/panzoom@4.6.2` | 画布变换、缩放焦点、双指缩放／平移计算 | 对象／笔迹／导航手势分配、按作品方案缓存、原位输入可见性；不替换库存或作品坐标 |

图像引擎运行在同源惰性加载 Worker，不把照片发到第三方。15.5MB 引擎不加入首屏预缓存，首次使用需要网络；初始化／超时错误明确报告，不冒充已识别。发行构建生成 `THIRD_PARTY_NOTICES.txt`；生产依赖审计零漏洞（仅反映本次 npm advisory 检查）。

验收：67 项单元、`npm test && npm run test:ui` 通过；静态构建真实 Chromium 主流程 109 张、导入 25 张、创作 80 张、完整预览 64 张、选择30张截图通过。六表合成备份迁移前后均验证完整恢复、Blob 字节和异常原子回滚；未对私人备份作恢复操作。实际网页导出的 PDF 经 pdf-lib 和 Poppler 独立解析／渲染为 A4，40×80mm 合成素材及 10mm 标尺完整显示，实体打印仍待验证。手机／iPad 横竖均为 Chromium 视口模拟，不冒充实体 Safari。

真实 DeepSeek 文本 API 已测试逐步工具与直接可编辑页；GPT 采用用户要求的子代理，应用 payload 一致，隐藏系统上下文不等同。修复了单位／坐标反馈、原子直接页、有效前缀、过早 finish 和文字框遮挡检查。四份结果已在网页渲染 32 张预览／编辑截图；DeepSeek 代理结果仍有小字和未见图像的语义推断，不能判为审美／内容全面合格。据此新增最低7pt印刷字号的提示与finish校验，旧小字结果现在会被拒绝；这项新规则未再发真实API轮次，不声称新增规则后模型已通过。视觉重识别与全部设置的真实 API 行为尚未验收。

未接入候选：ONNX 语义分割（权重／许可证／预处理未验证）、Konva/Fabric 整体画布迁移、Floating UI、SQLite、Workbox。现有 Canvas／Pointer Events／标准库能力继续复用；复杂加工、库存、导航和保存语义不得由通用库替换。Ajv 当前运行时编译，若采用严格禁 eval 的 CSP，需要 standalone 预编译另验；服务器备份的跨表一致快照仍有差异。

优先复用 OpenCV.js 的通用图像算法、pdf-lib 的 PDF 编码、idb 的 IndexedDB Promise 包装。库存、真实毫米尺寸、连续加工来源、选择范围、备份格式和事务提交属于拾页领域规则，必须保留；库负责执行和渲染，不能决定或改写这些规则。

最新文字增量：主标题18–26pt、次标题11–15pt、正文9–12pt、注释7–9pt作为prompt建议，按纸张毫米换算画布单位；移除旧的固定画布字号，与7pt完成检查共用常量。67项单元含A4/A5与两种模式验证；32张结果渲染回归验证显示字号与画布同比缩放。未再发真实API轮次，不将旧结果算新prompt通过。

## 替换前模块清单与迁移决定

“平台”表示继续调用现有浏览器／Node／Python 标准库，无新增第三方许可。外部候选的官方文档与许可证见文末；采用时须锁定版本并保留发行包中的许可／NOTICE。

| 模块 | 当前手写通用实现／主要函数 | 成熟候选 | 决定与迁移风险 |
| --- | --- | --- | --- |
| `perspective.js` | `solveHomography` 高斯消元、`mapPoint`、`rectifyA4` 逐像素逆映射与双线性插值；`suggestPaperCorners` | OpenCV.js，Apache-2.0：[CV1] | 优先替换矩阵求解与采样内核；保留 `validateCorners`、点序、输出尺寸、纸张比例和最大分辨率。正逆矩阵、半像素、RGBA／边界模式需逐项对照。 |
| `paper-analysis.js` | `components` BFS、`hull`、删点四边形、`detectPaperQuad`、`segmentPaperMaterials` 局部背景阈值、闭缝及洪水填洞 | OpenCV.js `findContours`、`approxPolyDP`、`convexHull`、`morphologyEx`：[CV2] | 分阶段替换轮廓／形态学通用部分。保留纸张面积／比例评分、实物最小尺寸、边界碎片排除、候选数量与排序。填洞不能抹掉真实开窗；库不提供自动语义识别保证。 |
| `material-alignment.js` | `materialAlignment` 自建凸包，逐边投影最小面积框 | OpenCV.js `minAreaRect`：[CV2] | 优先替换几何内核；保留 `fillRatio`／`elongation`／小角度保守门槛。规范化角度与宽高交换，几何扶正不推断图案“朝上”。 |
| `mask-model.js` | `paintMask` 软边圆刷、`maskOrientation` 二阶矩、`refineMaskStroke` 局部颜色阈值 | OpenCV.js `moments`／形态学；ONNX Runtime Web：[BG] | 方向估计可复用 moments；手动刷子与“补回不超过源 alpha”继续保留。语义抠图作为候选初始 mask，禁止重算时覆盖用户修补；局部细化只作用最后笔画邻域。 |
| `image.js` | `detectPaperCandidates`、`cropBitmap`、`alignMaterialPreview`，裁切、色彩平衡和旋转 | Canvas／ImageBitmap 平台；OpenCV.js；ONNX：[CV1][BG] | Canvas 的裁切／旋转本身已是成熟平台实现，不为简单 drawImage 再加库。分析算法交给 CV 适配层；保留原图、初识别、编辑图分离及毫米尺寸更新约定。 |
| `cutout-editor.js` | `showCutoutEditor`、RGBA 合成／增强、旋转边界、缩放与刷子坐标、草稿撤销 | Canvas 平台；OpenCV／ONNX mask 适配器：[BG] | UI与应用／取消语义保留。推理输入缩放必须反映射到原始 ROI 像素；任何新 mask 先本地草稿，应用时才写记录。 |
| `paper-ui.js`、`import-box-editor.js` | `mountPaperCorrection`、`mountImportBoxEditor` 四角／候选框拖动、缩放旋转与归一化坐标 | Pointer Events 平台；Konva 试点：[CANVAS] | 本轮保留。与照片 contain 留白共享坐标转换；不可把 stage 坐标直接写成照片归一化坐标。移库时保留取消恢复与手动候选。 |
| `import-save.js`、`import-workspace-ui.js` | `saveImportBatch`、`candidateMetadata`、`importPaperDimensions`、`workBackground` 周边中位色填补、确认流程 | OpenCV inpaint 可作底页修复研究；Canvas／事务平台 | 保留整批一次提交、重入保护、关联 IDs、原图变体、数量与尺寸。底页修补目前是平色填充；inpaint 是否在所选 JS 构建导出须先验证，并用纹理／线纸样本验收，不能据库名宣称恢复原底纸。 |
| `canvas-selection.js`、`canvas-selection-ui.js` | `objectCorners`、`polygonContains`、线段相交、`selectPolygon`、`moveSelection`、套索手势 | Konva 场景命中／Transformer，MIT：[CANVAS] | 画布迁移试点中复用变换与事件；拾页多边形套索、锁定／隐藏／类型排除和整组一次撤销保留。命中包围盒不能替代旋转轮廓相交。 |
| `editor-tools-model.js`、`canvas-editor-ui.js` | `shapeSVG`、`resizeObject`、`eraseStrokes`、`drawInk`、文字换行测量、工具设置和选框 | Konva；Fabric，均 MIT：[CANVAS] | 两者择一做独立适配试点，不同时引入。成熟库能复用交互与图形对象；设备字体、中文换行、Pencil 压感／二进制兼容仍需专项。真实材料尺寸限制由领域层审核。 |
| `material-processing-editor.js` | `composeCrop`、`validateCrop`、连续矩形裁片、实物毫米换算 | Canvas crop／Konva clip 平台：[CANVAS] | 保留来源累计、最小 2mm、最多工序、原库存不变。只复用预览裁切，不让库缩放操作绕过实物／数量限制。 |
| `paper-rendering.js`、`preview-geometry.js` | `drawPaper` 纸张纹样／CeCe线距，`containBox` | Canvas／CSS `object-fit:contain` 平台 | 保留短小布局函数和领域纸张参数。可共用一个渲染适配器减少封面／导出分叉；不引入“自动美化”布局替代既有坐标。 |
| `app.js` | 路由、`render*` HTML、`bindCanvas`、撤销快照、`rasterize`、作品封面与事件分发 | DOM／History／Canvas 平台；Konva/Fabric 适配层：[CANVAS] | 先抽出渲染、画布、存储边界；避免为复用一次性重写整个应用或保存格式。预览与PNG/PDF应读同一 draft，保留裁片／镜像／透明度／z序／隐藏。 |
| `pdf-export.js` | `pagePDF` 手写 objects、stream、xref偏移；`canvasPDFPage` JPEG白底编码；`materialPrintPlacements` A4排版 | pdf-lib，MIT：[PDF] | 优先替换 PDF 字节生成。保留 A4可打印区域、毫米→点 `72/25.4`、不缩放实物及拒绝未测量／超尺寸。`pagePDF` 将变 async，所有调用必须 await；不能继续用字符串 xref 测试当新库的功能证明。 |
| `store.js` | `database`、`localAll/get/put/remove/transaction` 手写 IDBRequest；服务器路由、Base64、备份与恢复 | idb，ISC：[IDB] | 只先替换本地 IDB包装。DB名 `shiye-pwa-full-v1`、版本1、六个 store及 keyPath保持；raw transaction 回调契约可用 `unwrap` 兼容。成功以 `tx.done` 为准；Blob编码／网络请求必须在事务外完成。服务器失败不得回退本地。 |
| `server/server.mjs` | `atomic` fsync+rename、`operationBatch`队列／索引快照、静态HTTP、CORS与令牌比较 | 现有 Node `fs/http/crypto`；将来 SQLite 事务，SQLite public domain：[SERVER] | 本轮保留现有接口和数据。若迁移SQLite，必须先恢复演练，双读校对再切换；不得创建空库覆盖旧索引。同ID图片先写后提交索引、跨文件故障恢复以及一致性备份要单独测试，fsync+rename不是跨文件数据库事务。 |
| `creative-contract.js`、`classification.js` | `validateValue/validateTool` 手写 schema遍历、响应JSON提取、枚举检查 | Ajv，MIT：[SCHEMA] | 建议复用 schema 验证，关闭类型强转／默认值注入／删字段；静态合同可构建时预编译以免运行时 eval/CSP。结构验证不能代替库存、加工、物理几何及“已成功前缀不回滚”。 |
| `creative-runner.js`、`creative-quality.js`、创作工具执行模块 | 手写多轮payload／工具回执、画布快照、超时／轮数、排版检查 | 现有 fetch／AbortSignal／JSON；Ajv合同：[SCHEMA] | 继续复用平台请求；模型工具执行和失败保存是领域逻辑。不要为换SDK改用户设置协议或隐私同意。排版规则不是美感证明；整页成图不是模型生成图片的证据。 |
| `ai-settings.js`、`preferences.js`、`ai-diagnostics.js` | 设置规范化、localStorage、`redact`、容量限制与明确同意记录 | Web Storage／JSON平台；Ajv可统一边界 | 保留兼容旧设置、提供商参数、密钥隔离与脱敏。没有理由把密钥移入构建变量、第三方遥测或库的云默认配置。 |
| `domain.js` | `canvasSize`、`itemFromAsset`、`physicalPlacement`、`validatePhysicalDraft`、推荐与库存 | 领域模型，不用通用排版库代替 | 必须保留。现有真实尺寸／数量／未测量／不能放下的拒绝规则适用于所有库路径；库提供新resize能力不等于材料允许缩放。 |
| `library-model.js`、`library-selection-model.js` | `seriesCovers/seriesMembers`、使用状态推导、`parseTags`、跨页面选择范围 | Array／Set／Intl平台 | 保留；这是Swift及用户的业务语义，当前资料量不需要全文搜索服务。引入搜索索引也只改善检索，不改七种状态或封面成员限制。 |
| `asset-editor.js`、`series-editor.js`、`series-contents.js`、`library-selection-ui.js` | 草稿编辑、归类事务、六／四项选择底栏、PNG/JPEG导出 | HTML dialog／Canvas平台；共享表单／菜单适配器 | 保留保存／取消及删除进入最近删除。合并重复DOM控件可以内部复用；新建系列与归类必须同一事务，不能由表单库逐条写入。 |
| `swift-popover.js`、`filter-controls.js`、`parity-ui.js`、`workflow-ui.js` | `openPopover`定位／越界修正／子菜单、重复button工厂、四筛选与路由挂载 | Floating UI DOM，MIT：[UI]；原生 dialog／按钮 | 建议只替换锚定定位（`computePosition`+offset/flip/shift/autoUpdate）；键盘菜单、焦点返回、子菜单所有权、直接升降序与当前值标签保留。定位库本身不提供完整可访问菜单。 |
| `dialog-lifecycle.js`、`image-node-cache.js` | 延迟 close保护、`ImageNodeCache` 按节点数／像素预算复用解码节点 | 原生dialog／ResizeObserver；Map／ImageBitmap平台 | 保留小型适配。替换DOM框架不能无故丢弃此生命周期保护与内存预算；Canvas库资源同样要destroy/close并防止旧异步结果覆盖新路由。 |
| `icons.js`、全部CSS（含 `icons.css`） | 手写SVG图标、响应式及多层覆盖 | Lucide SVG，ISC且保留继承部分MIT：[UI]；CSS平台 | 图标可按实际库名称复用并记录来源；用户需要Swift符号位置关系，不能为统一库强行换含义。CSS先收拢重复覆盖，不为此引入整套框架或改变布局。 |
| `scripts/prepare_cece.py` | 样例坐标／段落／形状转换、copyfile与JSON | 已用 `pathlib/json/shutil`：[SCRIPT] | 保留领域映射；当前SOURCE仍为旧 `swift-source` 路径，后续执行前须显式对应新Swift包的公开样例，不能为修路径扫描私人备份。 |
| `scripts/precache.mjs` | 递归files、构建资产名单与SW替换 | Node fs/crypto已成熟；Workbox，MIT：[PWA] | 暂保留小脚本，缓存规则扩大后再复用Workbox。新WASM／模型属于可选大资源，不能无差别加入首屏precache；版本checksum与离线可用性单列验收。不要把新Service Worker自动缓存 `/api/` 私人资料。 |

## 可执行替换顺序与验收边界

1. **OpenCV.js：先透视及最小旋转框。** 建立一份按固定版本／checksum同源交付的惰性加载器；只在用户进入相关图像处理时加载，等待runtime ready后检查需要的函数是否存在。所有 `Mat`、`MatVector`、轮廓／矩阵对象用 `try/finally` delete；先缩小分析图，最终裁切仍从原像素执行。加载失败有明确提示并保留原图、手动四角和当前草稿，禁止把失败解释成已识别完成。随后才替换闭运算／轮廓；记录每候选 mask、来源区域和毫米结果，保留领域筛选。
2. **pdf-lib：收拢格式编码。** 保持 `canvasPDFPage` 白底JPEG策略和既有位置不变，`PDFDocument.create` → `embedJpg` → `addPage([wMM*72/25.4,hMM*72/25.4])` → `drawImage` → `save`。若改透明PNG，必须是明确的新输出策略。验证多页PDF能被独立解析器重开，A4 MediaBox、页数、图像长宽、10mm标尺、未测量／放不下的拒绝与恢复后的尺寸一致；实体100%打印另验。
3. **idb：局部包装迁移。** 不改库名／store／schema，替换请求回调及等待提交；现有同步 `transaction(names,fn)` 提供 raw对象兼容或集中迁移所有调用，不能混用 Promise 与 `onsuccess`。先在合成全备份副本验完整恢复、异常中止全回滚、重启、Blob引用、最近删除、服务器401／离线不回退；真实现有资料只经已授权的备份恢复流程处理。并发导出时的一致快照是额外测试项，现有逐store读取不能自动证明这一点。
4. **浏览器抠图：独立本地候选试点。** ONNX Runtime Web只负责推理；锁定模型权重、来源、许可证、checksum、预处理／输出mask合同。可从U²-Net／U²-NetP作者仓库评估，不能把显著性检测当全部浅色手账素材已可靠分割。WebGPU按算子／设备可用性选择，WASM单线程提供已测路径；多线程涉及cross-origin isolation，不能默认改变全站隔离头。模型／WASM与runtime须同版本配套、同源下载、显示首次下载／错误状态，不上传照片。验浅色便签、同色桌面、薄胶带、空洞、多个相邻物体、长宽极端图，原始ROI／mask映射、修补／取消不写入和峰值内存。
5. **画布库：只在隔离适配器试点。** 首选评估Konva；需要复杂内联文字／SVG编辑再与Fabric比较。以现有draft JSON为唯一保存格式，库节点为临时视图；`draft→nodes→draft`往返保留IDs、中心坐标、z序、cropRect／cropSteps、镜像、opacity、锁定／隐藏、纸张、笔迹、文字段落、makingSteps、库存单元与unknown字段。Transformer的scale归一化后必须经过物理校验；禁止保存 `Stage.toJSON()` 或Fabric JSON覆盖既有作品／备份。逐项验旧合成作品、拖动／缩放／旋转、多选、撤销、取消、PNG/PDF及重开一致，再决定替换。

每一批实际变更跑 `npm test && npm run test:ui`，再按变更域跑布局／导入／创作／选择真实浏览器专项。最终静态构建验收避免开发HMR改写页面。手机／iPad视口模拟与实体Safari／Pencil验收分别记录。库成功加载、DOM路由通过和候选方案表都不是视觉／识别／迁移完成证明。

## 官方来源和许可

- **[CV1]** OpenCV 4.5+ Apache-2.0：[官方许可](https://opencv.org/license/)、[JS透视与插值](https://docs.opencv.org/4.13.0/dd/d52/tutorial_js_geometric_transformations.html)、[运行时初始化与Mat释放](https://docs.opencv.org/4.13.0/d0/d84/tutorial_js_usage.html)。引用文档版本4.13.0不等于本项目已锁定此发行构建。
- **[CV2]** [JS轮廓输入／层级](https://docs.opencv.org/4.13.0/d5/daa/tutorial_js_contours_begin.html)、[approxPolyDP／convexHull／minAreaRect／moments](https://docs.opencv.org/4.13.0/dc/dcf/tutorial_js_contour_features.html)。实际JS构建的导出函数仍须检查，不从C++功能清单推断全部可调用。
- **[BG]** ONNX Runtime Web：[官方浏览器说明](https://onnxruntime.ai/docs/tutorials/web/)、[部署及配套WASM](https://onnxruntime.ai/docs/tutorials/web/deploy.html)、[MIT许可](https://github.com/microsoft/onnxruntime/blob/main/LICENSE)。U²-Net作者仓库：[模型与检查点说明](https://github.com/xuebinqin/U-2-Net)、[Apache-2.0源码许可](https://github.com/xuebinqin/U-2-Net/blob/master/LICENSE)；待选的具体权重与ONNX转换件必须另核对许可／来源。IMG.LY包装现为[AGPL-3.0](https://github.com/imgly/background-removal-js/blob/main/LICENSE.md)，[官方项目说明](https://github.com/imgly/background-removal-js)提供其他授权路径；不能将其当MIT依赖默认混入现项目，审计未决定采用。
- **[PDF]** pdf-lib：[PDFDocument图像嵌入／save](https://pdf-lib.js.org/docs/api/classes/pdfdocument)、[PDFPage及MediaBox](https://pdf-lib.js.org/docs/api/classes/pdfpage)、[MIT许可](https://github.com/Hopding/pdf-lib/blob/master/LICENSE.md)。
- **[IDB]** idb：[官方openDB／unwrap／事务自动关闭与tx.done说明](https://github.com/jakearchibald/idb)、[ISC许可](https://github.com/jakearchibald/idb/blob/main/LICENSE)。
- **[CANVAS]** Konva：[Transformer的scale行为与选择](https://konvajs.org/docs/select_and_transform/Basic_demo.html)、[领域state保存建议](https://konvajs.org/docs/data_and_serialization/Best_Practices.html)、[MIT许可](https://github.com/konvajs/konva/blob/master/LICENSE)。Fabric：[坐标变换](https://fabricjs.com/docs/old-docs/using-transformations/)、[6.0迁移及Promise变化](https://fabricjs.com/docs/upgrading/upgrading-to-fabric-60/)、[MIT许可](https://github.com/fabricjs/fabric.js/blob/master/LICENSE)。选择实际版本后按对应文档验证，不能把旧教程API直接移入新版。
- **[SCHEMA]** Ajv：[编译／复用schema](https://ajv.js.org/guide/getting-started.html)、[MIT许可](https://github.com/ajv-validator/ajv/blob/master/LICENSE)。
- **[UI]** Floating UI：[computePosition](https://floating-ui.com/docs/computeposition)、[MIT许可](https://github.com/floating-ui/floating-ui/blob/master/LICENSE)；Lucide：[官方图标库](https://lucide.dev/)、[ISC及继承MIT许可](https://github.com/lucide-icons/lucide/blob/main/LICENSE)。
- **[SERVER]** [Node fsync](https://nodejs.org/api/fs.html#filehandlesync)、[Node SQLite接口及稳定性](https://nodejs.org/api/sqlite.html)、[SQLite原子提交](https://sqlite.org/atomiccommit.html)、[SQLite public domain](https://sqlite.org/copyright.html)。Node SQLite文档当前主版本不表示工程使用的Node版本具有全部同样API；服务端迁移前必须按部署运行时核对。
- **[SCRIPT]** [Python标准库plistlib二进制plist支持](https://docs.python.org/3/library/plistlib.html)、[Python许可](https://docs.python.org/3/license.html)。转换器已经复用标准解析库，剩余Swift字段映射属于本项目。
- **[PWA]** Workbox：[官方预缓存与revision说明](https://developer.chrome.com/docs/workbox/modules/workbox-precaching)、[MIT许可](https://github.com/GoogleChrome/workbox/blob/v7/LICENSE)。
