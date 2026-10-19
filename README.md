# 拾页 ShiyeJournal

拾页是一个面向真实纸质手帐素材的 PWA。日常功能只维护**现行数据结构、现行 AI 合同和现行任务包格式**，不在读写、导入或创作路径中兼容历史 Swift / CeCe / 旧 ZIP / 旧字段。底层数据格式变更时，用户可主动使用独立的“转换旧数据格式”入口；该工具先扫描并备份，再把已登记且可验证的旧记录转换成当前格式，不改变日常路径的格式要求。

## 开发与发布分支

正式开发规则见 [DEVELOPMENT_WORKFLOW.md](DEVELOPMENT_WORKFLOW.md)。长期只维护两个发布分支：

- `test`：下一版本与集成测试；由 CloudBase 静态托管自动部署至测试站。
- `main`：已经验收的正式版本；只在独立 CloudBase 正式部署配置后发布。

普通开发遵循 `feature/* → test → main`；其他分支不自动部署。除紧急 hotfix 外，不直接在 `main` 开发功能；hotfix 合入 `main` 后必须回灌 `test`。

## 当前能力

- 素材导入：相册 / 文件 / 拍摄入口、纸张校正、候选素材提取、手动框选、去白底、真实毫米尺寸。
- 素材库：系列、标签、筛选、排序、收藏、使用状态、批量操作、最近删除。
- 搭配：核心素材、风格 / 用途、加工权限、素材优先级、单页 / 双页与纸张比例。
- 编辑器：真实尺寸素材、文字、图形、笔迹、纸张、撤销重做、备选栏、图层、PNG / PDF、自动保存。
- AI 创作：默认 GPT 视觉，可直接查看素材预览；支持原子 Craft Plan、裁片、撕边、票根缺口、邮票齿、流苏、开窗、余料、探出 / 垫底 / 搭桥、有限两孔穿插，以及最终画面视觉复核。
- 数据：浏览器、本地自托管服务或已配置的私有云后端；不同后端不会在失败时静默互相回退。

新账号首次进入时，素材库、系列和作品均为空；App 不再自动写入演示素材或示例作品。旧账号已经保存的记录不会因这一变更被删除。

## GPT 创作任务包

新导出的任务包只有一种目录协议：

```text
START_HERE.txt
task/
  context.json
  GUIDE.txt
  CRAFT_GUIDE.txt       # 工具模式：逐件取材、加工权限与工艺参数
  knowledge.json
schema/
  output.json
  craft-plan.json
examples/
  project.shiyeproject.json
materials/
  <素材预览>.png
references/          # 仅在启用参考时存在
runtime/
  validate.cjs
  preview.cjs
  pack.cjs
  glyphs.cjs
  README.txt
```

职责：

- `START_HERE.txt`：唯一入口和执行顺序。
- `task/context.json`：任务事实、纸张、素材映射、物理尺寸、权限、来源快照和任务指纹。
- `task/GUIDE.txt`：内容边界、构图方法和素材工艺。
- `task/knowledge.json`：能力声明、素材区域、构图灵感、案例和可选参考审计。
- `schema/output.json`：当前输出合同。
- `schema/craft-plan.json`：当前原子工艺计划合同。
- `examples/project.shiyeproject.json`：只示意合法字段结构，不是成品模板。
- `materials/`：本次真实素材预览。
- `runtime/`：离线校验、预览、打包与字形轮廓工具。

运行时只读取 `task/context.json`，缺少当前任务指纹、来源快照、schema 指纹或当前目录标记时直接拒绝，不猜测旧格式。

## AI 素材工艺

当前核心原则：

1. **先看素材，再决定取材。** GPT 可以基于图片提出本次 observation，不需要用户预先手工标区域。
2. **真实物理守恒。** 素材尺寸、裁片来源和余料由代码核验；普通素材在同一创作方案中只取用一个源实例，胶带可取多段。隐藏或移出画布不释放已取用的来源。
3. **工艺是可执行数据。** 撕边、开窗、余料、穿插等必须编译为真实可编辑几何，不用白色遮罩伪造。
4. **完整使用永远合法。** 不用“至少裁几件”之类硬指标代替审美判断。
5. **用户手改优先。** AI 不能因为图层未锁定就覆盖生成开始前的人工修改。

## 数据与存储

当前支持三种明确的数据后端：

- 浏览器 IndexedDB。
- 同源 / 显式配置的自托管数据服务。
- 已登录账号下的私有云存储。

每次会话只使用一个明确的数据源。网络、鉴权或服务故障会显式报错，不会悄悄改写到另一个后端。

云端对象必须带显式 `storageProvider`，作品封面必须使用当前 provider-qualified 标识。待同步项目和导入批次使用账号隔离的持久队列，只有服务端确认后才移除。

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

自托管数据服务：

```bash
npm run start:local
```

## 自动验证

主要 CI：

- `.github/workflows/verify.yml`：构建、单元测试、UI / 路由 / HTTP 冒烟。
- `.github/workflows/craft-browser.yml`：真实 Chromium 下的素材工艺、选择菜单、缓存、多模态 Craft Plan、穿插、便携 Canvas 预览回归。

浏览器回归使用合成数据，不代表实体 iPad Safari、Apple Pencil 或真实付费模型审美验收。

## 架构约束

- 不重新引入旧任务包、旧字段别名、旧 relation 名称、旧设置迁移或旧 Swift / Goodnotes 导入路径。
- 浏览器能力降级、断网恢复、事务重试和同步冲突处理属于运行时鲁棒性，不属于旧版本兼容。
- 生成源码与 `src/generated/` 运行时必须来自当前源码重新构建，不能手工分叉。
- 不提交 API 密钥、账号凭据、私人图片、字体文件或用户备份。
- 所有改变真实素材用量、尺寸或来源的功能都必须有确定性校验和回归测试。

更具体的代码结构见 `ARCHITECTURE.md`、`DATA_LOADING_ARCHITECTURE.md` 与对应模块源码。

网页版 AI 创作流程与能力边界见 [统一 Scene 工作台](docs/WEB_AI_SCENE_WORKBENCH.md)。
