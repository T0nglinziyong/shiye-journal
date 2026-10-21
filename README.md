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
- AI 创作：默认 GPT 视觉，可直接查看素材预览；支持原子 Craft Plan、裁片、撕边、票根缺口、邮票齿、流苏、开窗、余料、探出 / 垫底 / 搭桥、有限两孔穿插，以及最终画面视觉复核。
- 数据：CloudBase Auth 与 PostgreSQL 保存账号和元数据，CloudBase 云存储保存模板、私有图片及作品文件；浏览器 IndexedDB 缓存已验证的账号资料并可靠暂存待同步修改。连接失败不会切换到另一份资料库。

新账号首次进入时，素材库、系列和作品均为空；App 不再自动写入演示素材或示例作品。旧账号已经保存的记录不会因这一变更被删除。

## 创作表达与构图

搭配默认使用“随材而定、自动安排、灵感随写、自由创作”。文字可选灵感随写、日常记录、纯粹拼贴：无真实记录时允许自言自语、态度和未完成的想法，不编造用户经历。文字长短、书写位置与颜色由实际空间和素材共同决定。构图参考根据素材角色、尺寸及语义选择；印刷字可直接承担标题，便签承载书写，裁剪、蒙版、开窗与胶带用于具体图文关系，不按复杂度评分。

应用内可编辑 AI、图片生成与网页任务包共用内容和构图指导；不会额外增加一次模型调用。真实尺寸、来源用量与 Scene 校验照常执行。详见 [创作指导](docs/EXPRESSIVE_CREATION.md)。

## GPT 创作任务包 v3

网页导出的可编辑 GPT 任务包以 `START_HERE.md` 与 `TASK.json` 为入口。`assets/overview.jpg` 帮助快速看全素材，`assets/mN.*` 保留本次 Scene 实际引用的原始像素，`assets/manifest.json` 记录来源 ID、SHA256、像素与毫米尺寸。`scene.json` 是唯一权威作品；`work/commands.json` 是一次编辑事务。

```bash
node runtime/shiye.cjs self-test
node runtime/shiye.cjs info
node runtime/shiye.cjs apply work/commands.json
node runtime/shiye.cjs preview
node runtime/shiye.cjs inspect
node runtime/shiye.cjs pack
```

`apply` 支持初稿、复杂素材加工与局部修订，成功后原子更新 Scene；同一事务重复运行不会重复取料。`preview` 从当前 Scene 调用共享 Canvas 渲染器得到 PNG；`pack` 校验版本、Scene/PNG/素材哈希，并重新渲染当前 Scene 比对 PNG，再输出单行可编辑 JSON 和清单。复杂命令按需看 `design/RECIPES.md`；完整合同位于 `api/commands.schema.json`。实际 [v3 ZIP 示例](examples/v3/拾页-GPT创作包-v3-示例.zip) 与 [简单](examples/v3/simple/preview.png)、[复杂](examples/v3/complex/preview.png) 结果可直接查看；各目录保留初稿与修订命令、最终单行 JSON 和验证清单。用 `node scripts/generate-v3-example.mjs` 重新生成；能力映射见 [Scene 能力矩阵](docs/scene-capability-matrix.md)。

导出包不含登录令牌。任务的原始文字、素材来源和纸张物理规格只读；实体裁片、余料、开窗与穿插沿用 App 的 Scene v2 物理校验。当前独立运行环境需要 Node Canvas 3.2.3，缺少渲染依赖时 `self-test` 明确失败，不能把未渲染 Scene 当成完整交付。

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
- `.github/workflows/craft-browser.yml`：真实 Chromium 下的素材工艺、选择菜单、缓存、多模态 Craft Plan、穿插、便携 Canvas 预览回归。
- `.github/workflows/interface-browser.yml`、`recognition-browser.yml`、`storage-integration.yml`：隔离合成数据下的界面、识别与备份浏览器回归；三组检查与 Craft 浏览器检查都通过后再部署。

浏览器回归使用合成数据，不代表实体 iPad Safari、Apple Pencil 或真实付费模型审美验收。

## 架构约束

- 不重新引入旧任务包、旧字段别名、旧 relation 名称、旧设置迁移或旧 Swift / Goodnotes 导入路径。
- 浏览器能力降级、断网恢复、事务重试和同步冲突处理属于运行时鲁棒性，不属于旧版本兼容。
- 生成源码与 `src/generated/` 运行时必须来自当前源码重新构建，不能手工分叉。
- 不提交 API 密钥、账号凭据、私人图片、字体文件或用户备份。
- 所有改变真实素材用量、尺寸或来源的功能都必须有确定性校验和回归测试。

更具体的代码结构见 `ARCHITECTURE.md`、`DATA_LOADING_ARCHITECTURE.md` 与对应模块源码。

网页版 AI 创作流程与能力边界见 [统一 Scene 工作台](docs/WEB_AI_SCENE_WORKBENCH.md)。
