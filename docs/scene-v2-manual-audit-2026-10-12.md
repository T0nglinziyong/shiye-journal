# Scene v2 手动审查记录 — 2026-10-12

## 范围与可重复性

基线：`test` 的 `4c21487cc6e01032bb35998c0b98ec7ea66d3c1f`；工作分支 PR #128 `feat/scene-v2-unified-layer-tree-20261011`。
这是无 GitHub Actions 额度时的代码/纯 JS 逻辑审查，不是完整应用验收。GitHub 代码连接允许读取和提交，但执行容器不能访问 github.com DNS，也无法获取该私有仓库的完整 npm 工作区，因此本轮没有宣称 `npm ci && npm test && npm run build` 通过。

## 已修复并提交

1. Scene 的临时叶图层集合存在静默不写回：`draft.items[0]=value`、`draft.items.length=0`、`delete draft.items[0]` 只改变临时数组。现在这些操作写入同一棵 `layers`，并拒绝稀疏索引。增添 `tests/scene-model.test.js` 回归断言。
2. `groupSceneLayers` 只检查组 ID 是否与已有组冲突，没有检查普通图层。现在拒绝任意已占用图层 ID，且拒绝前不修改树；已添加回归测试。

## 实际执行的隔离检查

通过：单树序列化、默认叶层叠顺序、跨类型嵌套组合与解组、组移动/旋转不缩放实体、组移动循环拦截、非法蒙版/重复 ID/非法笔迹拒绝、数组写穿、Scene v2 待同步记录结构判定、损坏递归队列拒绝、作品摘要/正文分离与重组、快照修改隔离。检查由读取 GitHub 当前 JS 函数体后在独立 V8 中执行，属于局部功能测试；为缺失的 `structuredClone` 运行时使用 JSON 序列化的等价数据复制桩。不能证明真实 DOM/Canvas、文件系统、IndexedDB、COS、Supabase 或浏览器行为。

## P0 未解决：不能合并

### 1. 仍有旧式运行时数组适配层，不符合“只保留 Scene v2 API”

`src/scene-v2.js` 中的 `listView` 与 `attachSceneV2`，以及 `src/app.js`、`src/creative.js`、`src/canvas-editor-ui.js`、`src/domain.js`、`src/craft-plan.js` 等大量使用 `items/textBlocks/primitives/strokes` 的逻辑，虽然不再把四数组持久化，仍需临时数组视图。当前已防止三类写入悄悄丢失，但不能认为兼容层已删。下一步必须逐模块改为 `layers` 和统一场景操作 API，并删除适配层，重新测试所有路径。

### 2. 旧 v1 数据迁移仍存在

`attachSceneV2` 在没有 `layers` 时自动将四数组迁移；`project-outbox-recovery.js` 会为完整的旧队列记录迁移。用户明确要求不保留旧兼容，正式删除前必须先确定如何对当前开发账号中的待同步数据执行**不丢失的隔离/备份或一次性清理**，否则关闭迁移可能导致离线作品被静默丢弃。不能简单删除保护代码并声称安全。

### 3. AI 直接页的递归树顺序与层序数字存在两个来源

`creative-contract.js` 声明 `page.version=2` 的 `page.layers` 树，`creative.js::composeDirectSceneV2` 同时沿用材料 `placement.z`、图形/文字默认 `zIndex` 和实体 `relation` 解算层序。渲染器 `sceneDisplaySiblings` 又按 `zIndex` 排序，故某些组合的数组先后顺序不等于显示先后顺序。必须定义唯一权威次序，以及物理穿插/underlay 如何表达，移除旧的冲突参数并同步修改 schema 和测试。禁止盲目把所有 zIndex 改为数组索引，因为现有实体 underlay 测试依赖关系解算。

### 4. 真正的完整验收未执行

- `npm ci && npm test && npm run build`；
- 测试构建自动生成的 `src/generated/offline-*-source.js` 是否携带 **最新** Scene v2 schema/renderer，导出 ZIP 内的 validator、preview、pack 一致；
- AI 直接模式/多轮工具模式生成、失败回滚、物理来源账本与库存；
- IndexedDB 自动保存、撤销/重做、断电恢复、COS/Supabase 跨设备冲突；
- 多层组蒙版、手写压感、材质开窗/纸片穿插的编辑器 DOM、Canvas、PNG/PDF 和作品封面视觉一致性；
- 手机 Safari/iPad Pencil、桌面窗口大小变化的性能和交互。

## 处理原则

PR #128 **保持 Draft，不合入 test** 直到 P0 架构统一与构建/持久化/视觉回归有充分的实测证据。GitHub Actions 的 Failure 在无可用 job 执行日志时不能擅自解释为源码断言失败或已通过。
