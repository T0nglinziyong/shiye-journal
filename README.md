# 拾页 ShiyeJournal

拾页是一个面向真实纸质手帐素材的 PWA。日常功能只维护**现行数据结构、现行 AI 合同和现行任务包格式**，不在读写、导入或创作路径中兼容历史 Swift / CeCe / 旧 ZIP / 旧字段。底层数据格式变更时，用户可主动使用独立的“转换旧数据格式”入口；该工具先扫描并备份，再把已登记且可验证的旧记录转换成当前格式，不改变日常路径的格式要求。

## 开发与发布分支

正式开发规则见 [DEVELOPMENT_WORKFLOW.md](DEVELOPMENT_WORKFLOW.md)。长期只维护两个发布分支：

- `test`：下一版本与集成测试；合并后从现有 CloudBase App 的 Git 仓库配置触发测试站构建，并核对实站版本。
- `main`：已经验收的正式版本；只在独立 CloudBase 正式部署配置后发布。

普通开发遵循 `feature/* → test → main`；其他分支不自动部署。除紧急 hotfix 外，不直接在 `main` 开发功能；hotfix 合入 `main` 后必须回灌 `test`。

## 当前能力

- 素材导入：相册 / 文件 / 拍摄入口、纸张校正、候选素材提取、手动框选、去白底、真实毫米尺寸。
- 素材库：系列、标签、筛选、排序、收藏、使用状态、批量操作、最近删除。
- 搭配：核心素材、视觉风格 / 画面疏密 / 文字内容 / 页面用途四项方向、补充想法、素材优先级、单页 / 双页与纸张比例。素材默认自由加工，文字默认混合编排。
- 编辑器：真实尺寸素材、文字、图形、笔迹、纸张、撤销重做、备选栏、图层、PNG / PDF、自动保存。
- AI 创作：默认 GPT 视觉，可直接查看素材预览；支持原子 Craft Plan、裁片、撕边、票根缺口、邮票齿、流苏、开窗、余料、探出 / 垫底 / 搭桥、穿插，以及最终画面视觉复核。
- 数据：CloudBase Auth 与 PostgreSQL 保存账号和元数据，CloudBase 云存储保存模板、私有图片及作品文件；浏览器 IndexedDB 缓存已验证的账号资料并可靠暂存待同步修改。连接失败不会切换到另一份资料库。

新账号首次进入时，素材库、系列和作品均为空；App 不再自动写入演示素材或示例作品。旧账号已经保存的记录不会因这一变更被删除。

## 创作表达与构图

搭配默认使用“随材而定、自动安排、灵感随写、自由创作”。文字可选灵感随写、日常记录、纯粹拼贴：无真实记录时允许自言自语、态度和未完成的想法，不编造用户经历。文字长短、书写位置与颜色由实际空间和素材共同决定。构图参考根据素材角色、尺寸及语义选择；印刷字可直接承担标题，便签承载书写，裁剪、蒙版、开窗与胶带用于具体图文关系，不按复杂度评分。

应用内可编辑 AI、图片生成与网页任务包共用内容和构图指导；不会额外增加一次模型调用。真实尺寸、来源用量与 Scene 校验照常执行。详见 [创作指导](docs/EXPRESSIVE_CREATION.md)。

## GPT 创作任务包 v3

网页导出的可编辑任务包以 `START_HERE.md` 与 `TASK.json` 为入口。`assets/overview.jpg` 仅供观察，`assets/mN.*` 是本次 Scene 引用的素材像素，`assets/manifest.json` 记录持久来源 ID、SHA256、像素与毫米尺寸。短别名在任务内稳定，来源 ID 不变。`scene.json` 是唯一权威作品，`work/commands.json` 是一次编辑事务。

```bash
node runtime/shiye.cjs self-test
node runtime/shiye.cjs info
node runtime/shiye.cjs fonts
node runtime/shiye.cjs design-check
node runtime/shiye.cjs help
node runtime/shiye.cjs describe place
node runtime/shiye.cjs describe material.window
node runtime/shiye.cjs describe material.glyphKnockout
node runtime/shiye.cjs describe group.compose --full
node runtime/shiye.cjs begin work/next.json
# 仅填写 work/next.json 的 operations
node runtime/shiye.cjs check work/next.json
node runtime/shiye.cjs apply work/next.json
node runtime/shiye.cjs preview
node runtime/shiye.cjs inspect
# 实际打开 PNG 后记录审阅结果
node runtime/shiye.cjs review --result pass
node runtime/shiye.cjs pack
```

对外只接受统一 commands 协议 2。30 项当前操作共享 `place/size/style/region/order` 中适用的参数。图形和绘画只用 `graphic.add`，创建和更新共享 geometry/place/size/style/order；点缀是构图作用，不是独立命令。旧 `native.*` 注册表和协议 1 执行适配器已删除；弯曲文字、字形镂空、复杂胶带、轮廓、关系、盖印和复用均直接使用统一参数，不再要求 raw `set/plan`。Group 是带局部变换的真实树；毫米、比例、相对锚点、linked 跟随使用同一个空间解算器。自动排列支持横向、纵向、网格的一次性排列，不缩放实体素材。

`help`、`describe`、公共参数、示例和 Schema 从实际运行时注册表生成。`begin` 建立新事务，不覆盖已有草稿；`check` 与 `preview --commands work/next.json` 不修改正式 Scene。固定配方只含操作片段，不含过期 revision。字号使用 `style.fontSizePt`，位置使用 `place`；创建与更新共用 `creation-node-update` 和 `scene-text-layout`；持久最小高度和相对行高在 Scene 中保存，先重排，再定位和求解 linked。默认帮助只给摘要，完整 Schema 需要 `--full`。

`apply` 原子保存 Scene 与事务收据，重复执行不重复取料。`preview` 使用真实素材和共用 Scene Canvas 生成 PNG；`pack` 对当前 Scene、素材、实际渲染后端与重渲染 PNG 核对，输出单行 `output/project.shiyeproject.json`、`output/preview.png` 与 manifest。`review` 仅记录创作者声明，不替代实际看图。

默认优先 Node Canvas 3.2.3，缺少时检测本机 Chromium；用 `SHIYE_RENDERER=node|browser|auto` 固定选择，或 `SHIYE_CHROMIUM_PATH` 指定浏览器。不自动下载程序、不上传素材；两个后端共享 Scene 渲染逻辑，但字体与像素不保证跨机器完全一致。后端不可用时明确失败，不伪造预览。

最新示例用 `node scripts/generate-v3-unified-example.mjs` 在构建后生成，或下载对应提交的 Craft browser CI artifact 中 `creation-package`。历史示例不代表当前协议。完整边界见 [接入状态](docs/creation-integration-status.md)、[能力映射](docs/creation-command-migration.md) 和 [生成物规则](docs/creation-build-artifacts.md)。

导出包不含登录令牌。任务原文、来源和纸张物理规格只读；真实裁片、余料、开窗、穿插沿用 Scene v2 材料校验。精确 visible 轮廓锚点、自定义 region: 布局区域和持续自动排列尚未发布，不能用静默近似代替。

## AI 素材工艺

当前核心原则：

1. **先看素材，再决定取材。** GPT 可以基于图片提出本次 observation，不需要用户预先手工标区域。
2. **真实物理守恒。** 素材尺寸、裁片来源和余料由代码核验；普通素材在同一创作方案中只取用一个源实例，胶带可取多段。隐藏或移出画布不释放已取用的来源。
3. **工艺是可执行数据。** 撕边、开窗、余料、穿插等必须编译为真实可编辑几何，不用白色遮罩伪造。
4. **完整使用永远合法。** 不用“至少裁几件”之类硬指标代替审美判断。
5. **用户手改优先。** AI 不能因为图层未锁定就覆盖生成开始前的人工修改。

## 数据与存储

当前网站只使用 CloudBase 账号、PostgreSQL 和 CloudBase 云存储。IndexedDB 是该账号的本机缓存与待同步队列，不是独立账号数据源。云端配置、网络或鉴权失败会显式报错，不会悄悄改写到另一个后端。

云端对象必须带显式 `storageProvider`，作品封面必须使用当前 provider-qualified 标识。待同步项目和导入批次使用账号隔离的持久队列，只有服务端确认后才移除。

存储桶权限、模板迁移和 PostgreSQL Realtime 的启用条件见 [CloudBase 直连与同步](docs/cloudbase-direct-access.md)。

## 本地运行

要求 Node.js 20+。

```bash
npm ci
npm run build
npm test
npm run test:ui
```

开发服务器：

```bash
npm run dev -- --port 5173 --strictPort
```

本地开发需要配置 `VITE_SHIYE_CLOUDBASE_ENV_ID` 与 `VITE_SHIYE_CLOUDBASE_PUBLISHABLE_KEY`；缺少配置时网站显示配置错误，不打开私人缓存。

## 自动验证

主要 CI：

- `.github/workflows/verify.yml`：构建、单元测试、UI / 路由 / HTTP 冒烟。
- `.github/workflows/craft-browser.yml`：真实 Chromium 下的素材工艺、选择菜单、缓存、多模态工艺、穿插、导出与导入；干净构建两次一致性和当前创作 ZIP 产物。
- `.github/workflows/interface-browser.yml`、`recognition-browser.yml`、`storage-integration.yml`：隔离合成数据下的界面、识别与备份浏览器回归；三组检查与 Craft 浏览器检查都通过后再部署。

浏览器回归使用合成数据，不代表实体 iPad Safari、Apple Pencil 或真实付费模型审美验收。

## 架构约束

- 不重新引入旧任务包、旧字段别名、旧 relation 名称、旧设置迁移或旧 Swift / Goodnotes 导入路径。
- 浏览器能力降级、断网恢复、事务重试和同步冲突处理属于运行时鲁棒性，不属于旧版本兼容。
- `src/generated/` 不提交仓库；predev/pretest/build 必须从当前源码重建，CI 校验可复现性，禁止手工分叉。
- 不提交 API 密钥、账号凭据、私人图片、字体文件或用户备份。
- 所有改变真实素材用量、尺寸或来源的功能都必须有确定性校验和回归测试。

更具体的代码结构见 `ARCHITECTURE.md`、`DATA_LOADING_ARCHITECTURE.md` 与对应模块源码。

网页版 AI 创作流程与能力边界见 [统一 Scene 工作台](docs/WEB_AI_SCENE_WORKBENCH.md)。

## 图文共同构图与艺术字

新创作包将文字、图形和素材都作为构图主角：先稳定主要视觉块，完善内容，再主动审视小素材、胶带、图形和笔迹的点缀作用；素材少时由标题、段落和主图形组织版式。默认避免大片无作用空区，明确的极简任务除外。没有素材数量或填充率硬指标。

`style.outline` 支持完整或偏移字形描边，`style.gradient` 支持真实字形填充渐变；同一文字节点可改字、改字体、重排、保存并重开。`text.lettering` 创建逐字可编辑的艺术标题，`draw.decorate` 根据目标生成普通笔迹下划线/高亮/括号。`fonts` 只查询字体名，不打包字体；`design-check` 是只读框级建议，不是看图或审美评分。完整例子在导出包的 design/LETTERING.md。

`node scripts/generate-craft-details-example.mjs <目录>` 生成单素材、文字/图形为主的合成两阶段验收例子；CI 保留结构预览、细节预览和最终项目。它不冒充真实模型创作 A/B 结果。更多边界见 docs/creation-detail-type-effects.md。

### Command 分类与丰富构图

当前普通更新统一 `layer.update`，显示遮罩统一 `layer.mask`，真实保留/移除统一 `material.cut`。数字复制用 `layer.duplicate`，艺术标题整体重排用 `text.reflow`。尺寸可显式 linked；图形/笔迹与文字共用描边/渐变样式。创作包默认鼓励丰富、有作用的细节，不新增点缀指令。完整边界见 [command-taxonomy.md](docs/command-taxonomy.md)。
