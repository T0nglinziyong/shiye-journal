# 创作命令能力映射（截至 2026-10-21）

附件列出的 39 项旧公开操作仍在 `src/v3-commands.js` 的协议 1 Schema 与 `applyCommandBatch` 中注册。`tool.*` 会转交 `src/web-scene-workbench.js` 的共享工具执行器；高级图层操作使用 `src/scene-advanced-ops.js` 和 `src/scene-v2.js`。协议 2 实验运行时从该注册表自动生成 `advanced.v1.<原操作名>`，故 39 项均可在同一个协议 2 `commands.json` 中调用。**语法可用不等于每项经过 Scene→PNG→重开编辑验收，也不等于高级参数已统一。** 目前 25 个候选简洁操作中，24 个有处理分支，且部分仅支持受约束的参数子集；正式网站 ZIP 仍默认协议 1。

| 协议 2 简洁操作 | 当前支持范围 |
|---|---|
| `material.add`, `text.add/update`, `shape.add`, `vector.add`, `ink.add`, `layer.place/update/reparent/reorder/delete`, `group.create/compose/ungroup`, `layout.detach`, `material.decision`, `page.update` | 基本创建与局部修改；新组的子图层是真实局部坐标，组变换与 linked 定位保存到 Scene。部分高级 parent/order/style 参数仍显式拒绝。 |
| `material.crop`, `material.window`, `material.split`, `material.mask`, `material.weave`, `material.tape`, `material.edge` | 矩形裁切、矩形/椭圆命名开窗、同一父片矩形分片与真实余料、显示蒙版、同实体两孔穿插、直线胶带、带确定种子的撕边。复杂自由轮廓、保留窗芯等由高级入口承接。 |
| `layout.arrange` | 候选契约有定义；稳定网格/多项联动规则尚未接入，`help` 不将它列为可用。 |

| 原操作 | 候选目标 | 现有执行路径 | 提及该操作的测试（非逐项验收） | 协议 2 状态 |
|---|---|---|---|---|
| `material.add` | material.add | `src/v3-commands.js` → Scene 编辑/工艺执行器 | remediation-contract.test.js, v3-package.test.js | `advanced.v1.*` 可执行；简洁版见上表，逐项验收待补 |
| `material.process` | material.crop / material.mask / material.edge; preserve all step variants | `src/v3-commands.js` → Scene 编辑/工艺执行器 | remediation-contract.test.js | `advanced.v1.*` 可执行；简洁版见上表，逐项验收待补 |
| `material.craft` | material.craft advanced registry, Codex must retain full plan semantics | `src/v3-commands.js` → Scene 编辑/工艺执行器 | v3-package.test.js | `advanced.v1.*` 可执行；简洁版见上表，逐项验收待补 |
| `material.tape` | material.tape + advanced ribbon capabilities | `src/v3-commands.js` → Scene 编辑/工艺执行器 | 未找到直接点名的测试 | `advanced.v1.*` 可执行；简洁版见上表，逐项验收待补 |
| `text.add` | text.add | `src/v3-commands.js` → Scene 编辑/工艺执行器 | v3-package.test.js | `advanced.v1.*` 可执行；简洁版见上表，逐项验收待补 |
| `shape.add` | shape.add / vector.add | `src/v3-commands.js` → Scene 编辑/工艺执行器 | v3-package.test.js | `advanced.v1.*` 可执行；简洁版见上表，逐项验收待补 |
| `ink.add` | ink.add | `src/v3-commands.js` → Scene 编辑/工艺执行器 | v3-package.test.js | `advanced.v1.*` 可执行；简洁版见上表，逐项验收待补 |
| `page.update` | page.update | `src/v3-commands.js` → Scene 编辑/工艺执行器 | v3-package.test.js | `advanced.v1.*` 可执行；简洁版见上表，逐项验收待补 |
| `layer.update` | layer.update + typed native property extensions | `src/v3-commands.js` → Scene 编辑/工艺执行器 | v3-package.test.js | `advanced.v1.*` 可执行；简洁版见上表，逐项验收待补 |
| `layer.delete` | layer.delete | `src/v3-commands.js` → Scene 编辑/工艺执行器 | 未找到直接点名的测试 | `advanced.v1.*` 可执行；简洁版见上表，逐项验收待补 |
| `layer.move` | layer.reparent / layer.reorder / layer.place | `src/v3-commands.js` → Scene 编辑/工艺执行器 | 未找到直接点名的测试 | `advanced.v1.*` 可执行；简洁版见上表，逐项验收待补 |
| `layer.insert` | typed native insert, same Command registry; no direct file editing | `src/v3-commands.js` → Scene 编辑/工艺执行器 | 未找到直接点名的测试 | `advanced.v1.*` 可执行；简洁版见上表，逐项验收待补 |
| `layer.replaceMaterial` | material.replace, add registry and tests | `src/v3-commands.js` → Scene 编辑/工艺执行器 | 未找到直接点名的测试 | `advanced.v1.*` 可执行；简洁版见上表，逐项验收待补 |
| `layer.repeatStamp` | layer.repeatStamp, digital-only or inventory-aware | `src/v3-commands.js` → Scene 编辑/工艺执行器 | 未找到直接点名的测试 | `advanced.v1.*` 可执行；简洁版见上表，逐项验收待补 |
| `layer.reuseLayout` | layout.reuse, remap source identities | `src/v3-commands.js` → Scene 编辑/工艺执行器 | 未找到直接点名的测试 | `advanced.v1.*` 可执行；简洁版见上表，逐项验收待补 |
| `material.glyphKnockout` | material.glyphKnockout, preserve real holes | `src/v3-commands.js` → Scene 编辑/工艺执行器 | 未找到直接点名的测试 | `advanced.v1.*` 可执行；简洁版见上表，逐项验收待补 |
| `group.transform` | layer.place + explicit transform command | `src/v3-commands.js` → Scene 编辑/工艺执行器 | 未找到直接点名的测试 | `advanced.v1.*` 可执行；简洁版见上表，逐项验收待补 |
| `group.create` | group.create | `src/v3-commands.js` → Scene 编辑/工艺执行器 | 未找到直接点名的测试 | `advanced.v1.*` 可执行；简洁版见上表，逐项验收待补 |
| `group.ungroup` | group.ungroup | `src/v3-commands.js` → Scene 编辑/工艺执行器 | 未找到直接点名的测试 | `advanced.v1.*` 可执行；简洁版见上表，逐项验收待补 |
| `material.decision` | material.decision | `src/v3-commands.js` → Scene 编辑/工艺执行器 | v3-package.test.js | `advanced.v1.*` 可执行；简洁版见上表，逐项验收待补 |
| `scene.compose` | group.compose / typed scene import, no second authority | `src/v3-commands.js` → Scene 编辑/工艺执行器 | 未找到直接点名的测试 | `advanced.v1.*` 可执行；简洁版见上表，逐项验收待补 |
| `tool.compose_page` | group.compose / ordered typed create commands; preserve full primitive and writing capabilities | `src/v3-commands.js` → `src/web-scene-workbench.js` | 未找到直接点名的测试 | `advanced.v1.*` 可执行；简洁版见上表，逐项验收待补 |
| `tool.place_materials` | material.add with common place/parent/order | `src/v3-commands.js` → `src/web-scene-workbench.js` | 未找到直接点名的测试 | `advanced.v1.*` 可执行；简洁版见上表，逐项验收待补 |
| `tool.draw_tape_strips` | material.tape plus typed advanced ribbon/strip geometry | `src/v3-commands.js` → `src/web-scene-workbench.js` | 未找到直接点名的测试 | `advanced.v1.*` 可执行；简洁版见上表，逐项验收待补 |
| `tool.edit_materials` | material.crop/mask/edge plus advanced processing registry for every step | `src/v3-commands.js` → `src/web-scene-workbench.js` | 未找到直接点名的测试 | `advanced.v1.*` 可执行；简洁版见上表，逐项验收待补 |
| `tool.upsert_materials` | material.add / material.replace / typed material update; explicit create-vs-update semantics | `src/v3-commands.js` → `src/web-scene-workbench.js` | 未找到直接点名的测试 | `advanced.v1.*` 可执行；简洁版见上表，逐项验收待补 |
| `tool.move_elements` | layer.place; preserve ratio/mm and relative reference support | `src/v3-commands.js` → `src/web-scene-workbench.js` | 未找到直接点名的测试 | `advanced.v1.*` 可执行；简洁版见上表，逐项验收待补 |
| `tool.arrange_elements` | layout.arrange; extend typed rules for every original arrangement | `src/v3-commands.js` → `src/web-scene-workbench.js` | 未找到直接点名的测试 | `advanced.v1.*` 可执行；简洁版见上表，逐项验收待补 |
| `tool.align_elements` | layout.align to add with common reference/anchor definitions | `src/v3-commands.js` → `src/web-scene-workbench.js` | 未找到直接点名的测试 | `advanced.v1.*` 可执行；简洁版见上表，逐项验收待补 |
| `tool.fit_text_to` | text.fit to add; explicit fit policy and minimum readable font, no silent overflow | `src/v3-commands.js` → `src/web-scene-workbench.js` | 未找到直接点名的测试 | `advanced.v1.*` 可执行；简洁版见上表，逐项验收待补 |
| `tool.upsert_primitives` | shape.add/vector.add/ink.add + typed updates, preserve all original shapes | `src/v3-commands.js` → `src/web-scene-workbench.js` | 未找到直接点名的测试 | `advanced.v1.*` 可执行；简洁版见上表，逐项验收待补 |
| `tool.upsert_text` | text.add/text.update + advanced text properties | `src/v3-commands.js` → `src/web-scene-workbench.js` | 未找到直接点名的测试 | `advanced.v1.*` 可执行；简洁版见上表，逐项验收待补 |
| `tool.style_elements` | layer.update.style + typed per-node advanced style definitions | `src/v3-commands.js` → `src/web-scene-workbench.js` | 未找到直接点名的测试 | `advanced.v1.*` 可执行；简洁版见上表，逐项验收待补 |
| `tool.group_elements` | group.create/group.compose | `src/v3-commands.js` → `src/web-scene-workbench.js` | 未找到直接点名的测试 | `advanced.v1.*` 可执行；简洁版见上表，逐项验收待补 |
| `tool.ungroup_elements` | group.ungroup with world/compositing preservation | `src/v3-commands.js` → `src/web-scene-workbench.js` | 未找到直接点名的测试 | `advanced.v1.*` 可执行；简洁版见上表，逐项验收待补 |
| `tool.delete_elements` | layer.delete with dependency/material rules | `src/v3-commands.js` → `src/web-scene-workbench.js` | 未找到直接点名的测试 | `advanced.v1.*` 可执行；简洁版见上表，逐项验收待补 |
| `tool.set_paper` | page.update + typed native paper pattern definition | `src/v3-commands.js` → `src/web-scene-workbench.js` | 未找到直接点名的测试 | `advanced.v1.*` 可执行；简洁版见上表，逐项验收待补 |
| `tool.finish_design` | material.decision + validation/review/pack, never fake visual approval | `src/v3-commands.js` → `src/web-scene-workbench.js` | 未找到直接点名的测试 | `advanced.v1.*` 可执行；简洁版见上表，逐项验收待补 |
| `tool.apply_craft_plan` | material.craft advanced typed registry; source metadata auto-resolved | `src/v3-commands.js` → `src/web-scene-workbench.js` | 未找到直接点名的测试 | `advanced.v1.*` 可执行；简洁版见上表，逐项验收待补 |
