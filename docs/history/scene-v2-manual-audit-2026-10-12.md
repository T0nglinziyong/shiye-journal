# Scene v2 手动审查记录 — 2026-10-12

## 范围与可重复性

基线：`test` 的 `4c21487cc6e01032bb35998c0b98ec7ea66d3c1f`；工作分支 PR #128 `feat/scene-v2-unified-layer-tree-20261011`。
这是无 GitHub Actions 额度时的代码/纯 JS 逻辑审查，不是完整应用验收。GitHub 代码连接允许读取和提交，但执行容器不能访问 github.com DNS，也无法获取该私有仓库的完整 npm 工作区，因此本轮没有宣称 `npm ci && npm test && npm run build` 通过。

## 已修复并提交

1. Scene 的临时叶图层集合存在静默不写回：`draft.items[0]=value`、`draft.items.length=0`、`delete draft.items[0]` 只改变临时数组。现在这些操作写入同一棵 `layers`，并拒绝稀疏索引。增添 `tests/scene-model.test.js` 回归断言。
2. `groupSceneLayers` 只检查组 ID 是否与已有组冲突，没有检查普通图层。现在拒绝任意已占用图层 ID，且拒绝前不修改树；已添加回归测试。
3. 修正网页版 GPT 任务提示：直接模式只允许 `page.layers` 中的 `group`，不再引用不存在的 `page.groups`；新增断言。
4. 修正误导用户的 `page v3` 错误提示，准确说明 `page.version=2`。
5. 统一 Scene v2 的 AI ink 操作路径：增加递归删除 API，支持笔迹查找、组合、样式、移动和删除，保留手写压感。

## 实际执行的隔离检查

通过：单树序列化、默认叶层叠顺序、跨类型嵌套组合与解组、组移动/旋转不缩放实体、组移动循环拦截、非法蒙版/重复 ID/非法笔迹拒绝、数组写穿、Scene v2 待同步记录结构判定、损坏递归队列拒绝、作品摘要/正文分离与重组、快照修改隔离。检查由读取 GitHub 当前 JS 函数体后在独立 V8 中执行，属于局部功能测试；为缺失的 `structuredClone` 运行时使用 JSON 序列化的等价数据复制桩。不能证明真实 DOM/Canvas、文件系统、IndexedDB、COS、Supabase 或浏览器行为。

## P0 未解决：不能合并

### 1. 仍有旧式运行时数组适配层，不符合“只保留 Scene v2 API”

`src/scene-v2.js` 中的 `listView` 与 `attachSceneV2`，以及 `src/app.js`、`src/creative.js`、`src/canvas-editor-ui.js`、`src/domain.js`、`src/craft-plan.js` 等大量使用 `items/textBlocks/primitives/strokes` 的逻辑，虽然不再把四数组持久化，仍需临时数组视图。当前已防止三类写入悄悄丢失，但不能认为兼容层已删。下一步必须逐模块改为 `layers` 和统一场景操作 API，并删除适配层，重新测试所有路径。

### 2. 旧 v1 数据迁移仍存在

`attachSceneV2` 在没有 `layers` 时自动将四数组迁移；`project-outbox-recovery.js` 会为完整的旧队列记录迁移。用户明确要求不保留旧兼容，正式删除前必须先确定如何对当前开发账号中的待同步数据执行**不丢失的隔离/备份或一次性清理**，否则关闭迁移可能导致离线作品被静默丢弃。不能简单删除保护代码并声称安全。

### 3. AI 直接页的递归树顺序与层序数字存在两个来源

`creative-contract.js` 声明 `page.version=2` 的 `page.layers` 树，`creative.js::composeDirectSceneV2` 同时沿用材料 `placement.z`、图形/文字默认 `zIndex` 和实体 `relation` 解算层序。渲染器 `sceneDisplaySiblings` 又按 `zIndex` 排序，故某些组合的数组先后顺序不等于显示先后顺序。必须定义唯一权威次序，以及物理穿插/underlay 如何表达，移除旧的冲突参数并同步修改 schema 和测试。禁止盲目把所有 zIndex 改为数组索引，因为现有实体 underlay 测试依赖关系解算。

### 4. AI 工具对 ink 的编辑：核心修复完成，待集成验证

`src/creative.js` 现通过 `sceneLayerEntries` 索引全部叶节点，允许 `group_elements/style_elements/delete_elements/move_elements` 定位笔迹。`move_elements` 直接按中心变换笔迹 points，不再写入无效的 x/y；删除使用统一的 `removeSceneNode`，`upsert_materials.remove` 仍只允许真实素材。新增组合、样式、移动、删除的回归测试，并通过 V8 隔离执行移动和删除。但完整 npm 集成测试尚未运行。

### 5. 真正的完整验收未执行

- `npm ci && npm test && npm run build`；
- 测试构建自动生成的 `src/generated/offline-*-source.js` 是否携带 **最新** Scene v2 schema/renderer，导出 ZIP 内的 validator、preview、pack 一致；
- AI 直接模式/多轮工具模式生成、失败回滚、物理来源账本与库存；
- IndexedDB 自动保存、撤销/重做、断电恢复、COS/Supabase 跨设备冲突；
- 多层组蒙版、手写压感、材质开窗/纸片穿插的编辑器 DOM、Canvas、PNG/PDF 和作品封面视觉一致性；
- 手机 Safari/iPad Pencil、桌面窗口大小变化的性能和交互。

## 处理原则

PR #128 **保持 Draft，不合入 test** 直到 P0 架构统一与构建/持久化/视觉回归有充分的实测证据。GitHub Actions 的 Failure 在无可用 job 执行日志时不能擅自解释为源码断言失败或已通过。


## 2026-10-12 上传完整源 ZIP 后的第二轮审查（截至 PR #128 最新分支）

源 ZIP 内含完整 PWA 源码，对应上传时的 `ee064259` 快照。已在本地解压，使用 Node 22 执行真实的 `node:test` 测试，不再仅靠 GitHub 源码隔离执行。

### 已提交到 PR #128 的新增修复

- **只接受 Scene v2**：`attachSceneV2` 明确要求 `sceneVersion=2` 和递归 `layers`；拒绝持久化的并列 `items/textBlocks/primitives/strokes/layerGroups`，删除从旧四数组自动生成 Scene 的逻辑和“缺失实体生成基线时猜测恢复”的行为。此处不提供旧数据升级。
- **保存数据保护**：`recoverProjectOutbox` 对待同步文档执行 v2 结构及图层几何校验，旧格式或损坏记录不得自动同步；同时 `cloud-store` 保存这些原始记录作为不可自动重放的待恢复数据，不在读取/写入有效队列时静默删除。需要未来的显式恢复 UI，不能把“隔离”当作“自动修好”。
- **锁定图层保护**：组内锁定、锁定祖先、整组删除、嵌套移动/解组均添加结构校验；删除包含锁定叶子的组合会被拒绝。
- **纸张规格**：`setDraftPaperSize` 现在按同一个场景树转换实体、数字文字、矢量图形、笔迹、嵌套组合的绝对坐标和尺寸，保留实物毫米尺寸与压感值。
- **内置作品物理真实性**：不再为适配作品页面默默缩小真实素材；过大的素材实例被跳过，而不是修改源 mm 对应的尺寸。
- **测试更新**：AI 提交/快照、历史版本、导入、封面、离线恢复的模拟输入改为当前递归 Scene v2；增加纸张多类图层物理坐标及锁定组合回归测试。

### 本地执行证据

- `node --check`：检查 390 个源码和测试 JS/MJS 文件，语法检查全部通过（包含修改后源码）。
- 依赖无关的专项测试：`node --test tests/scene-model.test.js tests/project-outbox-recovery.test.js tests/import-outbox-recovery.test.js tests/scene-paper-transform.test.js`，28/28 通过。其他历史记录、导入和封面相关的可执行专项也通过。
- 完整 `node --test tests/*.test.js`：374 项中 **304 通过、70 未通过**；剩余错误来自本地缺少 `ajv`、`fflate`、`idb`、`@noble/hashes`、`happy-dom`、`@techstark/opencv-js` 等 npm 依赖；其中并未取得可信的依赖完整后测试通过结论。
- 尝试 `npm ci --offline --ignore-scripts`：未成功，首先缺失缓存包 `ws@8.22.0`。容器中 npm registry 网络不可用。未执行 `npm run build`，也未重新生成受 Scene v2 改动影响的离线 validator/browser 打包产物。

### 仍属于 P0，阻断合并到 test

1. 运行时 `listView` 和相当多编辑/AI 模块仍通过临时的旧名称集合属性操作 `layers`。虽然不会存储第二套数组，并修复了主要写回缺陷，但它仍然是**待清理的内部适配层**，未满足“彻底删除旧代码兼容”的严格目标。
2. AI `page.layers` 树的同级数组顺序与 `zIndex` / 实体 `underlay` 关系仍可能形成双重权威。需要有视觉/库存断言支持的统一排序模型。
3. 必须在可安装项目依赖的环境执行 `npm ci && npm test && npm run build`，重新生成 `src/generated/offline-*-source.js`，并在真实 Chromium/iPad Safari 验证保存、导出、重开、蒙版、嵌套组合及跨设备 COS/Supabase 同步。

**合并结论：不应合并。** PR #128 继续保留 Draft，`test` 和 `main` 均未被修改。上述阻断项属于真实验收差距，不能通过仅调整测试文案来消除。


## 2026-10-12 本地完整依赖检查与合并前收敛

上传的 `shiye-node_modules-linux.tar.gz` 已用于本地 Node 22 测试；对重构、AI 生成、画布尺寸、保存与同步的 56 个源码/测试文件完成新一轮修复。源代码保持**仅保存 Scene v2 递归 layers**，旧四数组数据不再自动升级或兼容读取。当前一些已有算法仍通过不持久化的临时叶节点集合视图操作同一树，该视图不是另一套持久化/旧版本转换协议。

- **单双页语义**：single/spread 仍为同一 Draft 的 canvas 与唯一 layers；AI 在 spread 模式中将完整实体素材跨中缝设为柔性构图警告，而非错误，允许用户人工自由跨页。
- **AI 直接页**：修复 assemble/used ID 计算顺序导致同一图层既作为保留节点又作为新增节点时重复出现的缺陷。
- **撤销/重做**：Scene 事务按节点和修改字段记录前后变化，仅保留一个等待折叠的完整快照；不同类型（墨迹、文字、实体、图形）、复杂组合及 40 次文字修改专项验证通过。
- **手工存档**：gzip 压缩，按 SHA-256 去重，解压时校验哈希、结构和活动 Draft；原生 ZIP 导入导出保留压缩历史；作品元数据摘要不重复传输大的存档内容。
- **云端冲突安全**：不再允许仅以较新的 `updatedAt` 直接覆盖另一个设备的完整作品；仅可证明相容的修改自动合并，冲突时保留本地待同步数据。
- **预览渲染**：修复 SVG 中 ink 双重绘制导致图层顺序错误；只按 Scene v2 的实际图层位置绘制。
- **其他**：同步保留实体物理尺寸；过期 v1/v3 测试夹具更新为当前协议；c9 识别文件未改动。

**有效测试命令：** `node --test --test-force-exit --test-concurrency=5 tests/*.test.js`；结果 **716 项通过、0 项失败**，2026-10-12 本地记录；`npm run build` 完成，离线 browser / validator 的生成模块已重新打包并包含在提交中。`git diff --check` 通过。

**验收边界**：普通 `npm test`（不带 `--test-force-exit`）在该运行环境遇到残留异步/句柄使测试进程长时间不退出；即使所有断言通过也不得声称默认脚本成功。旧版 happy-dom UI 冒烟脚本在“离开编辑器后重新打开作品”的等待逻辑未通过，真实 Chromium 由于此运行环境的访问限制无法访问本地服务；真实 iPad Safari/Pencil 及云端生产配置仍须在设备或独立网络环境实测。上述限制不影响上述单元测试的执行事实，但不能把它们当作真实浏览器验收。

**合并范围**：仅 PR #128 → `test` 集成分支，不合并 `main`、不发布正式站点、不修改 Supabase/COS 实际用户数据。上述未完成的真实设备验收在 `test` 分支继续进行。
