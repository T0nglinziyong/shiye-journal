# 创作命令能力映射（截至 2026-10-21）

附件列出的 39 项旧公开操作仍在 `src/v3-commands.js` 的协议 1 Schema 与 `applyCommandBatch` 中注册。`tool.*` 会转交 `src/web-scene-workbench.js` 的共享工具执行器；高级图层操作使用 `src/scene-advanced-ops.js` 和 `src/scene-v2.js`。**注册不等于逐项通过实际 Scene→PNG→重开编辑验收。** 附件协议 2 的 25 项只是候选定义，尚未进入生产 ZIP。

| 原操作 | 候选目标 | 现有执行路径 | 提及该操作的测试（非逐项验收） | 协议 2 状态 |
|---|---|---|---|---|
| `material.add` | material.add | `src/v3-commands.js` → Scene 编辑/工艺执行器 | remediation-contract.test.js, v3-package.test.js | 待接入并逐项验收 |
| `material.process` | material.crop / material.mask / material.edge; preserve all step variants | `src/v3-commands.js` → Scene 编辑/工艺执行器 | remediation-contract.test.js | 待接入并逐项验收 |
| `material.craft` | material.craft advanced registry, Codex must retain full plan semantics | `src/v3-commands.js` → Scene 编辑/工艺执行器 | v3-package.test.js | 待接入并逐项验收 |
| `material.tape` | material.tape + advanced ribbon capabilities | `src/v3-commands.js` → Scene 编辑/工艺执行器 | 未找到直接点名的测试 | 待接入并逐项验收 |
| `text.add` | text.add | `src/v3-commands.js` → Scene 编辑/工艺执行器 | v3-package.test.js | 待接入并逐项验收 |
| `shape.add` | shape.add / vector.add | `src/v3-commands.js` → Scene 编辑/工艺执行器 | v3-package.test.js | 待接入并逐项验收 |
| `ink.add` | ink.add | `src/v3-commands.js` → Scene 编辑/工艺执行器 | v3-package.test.js | 待接入并逐项验收 |
| `page.update` | page.update | `src/v3-commands.js` → Scene 编辑/工艺执行器 | v3-package.test.js | 待接入并逐项验收 |
| `layer.update` | layer.update + typed native property extensions | `src/v3-commands.js` → Scene 编辑/工艺执行器 | v3-package.test.js | 待接入并逐项验收 |
| `layer.delete` | layer.delete | `src/v3-commands.js` → Scene 编辑/工艺执行器 | 未找到直接点名的测试 | 待接入并逐项验收 |
| `layer.move` | layer.reparent / layer.reorder / layer.place | `src/v3-commands.js` → Scene 编辑/工艺执行器 | 未找到直接点名的测试 | 待接入并逐项验收 |
| `layer.insert` | typed native insert, same Command registry; no direct file editing | `src/v3-commands.js` → Scene 编辑/工艺执行器 | 未找到直接点名的测试 | 待接入并逐项验收 |
| `layer.replaceMaterial` | material.replace, add registry and tests | `src/v3-commands.js` → Scene 编辑/工艺执行器 | 未找到直接点名的测试 | 待接入并逐项验收 |
| `layer.repeatStamp` | layer.repeatStamp, digital-only or inventory-aware | `src/v3-commands.js` → Scene 编辑/工艺执行器 | 未找到直接点名的测试 | 待接入并逐项验收 |
| `layer.reuseLayout` | layout.reuse, remap source identities | `src/v3-commands.js` → Scene 编辑/工艺执行器 | 未找到直接点名的测试 | 待接入并逐项验收 |
| `material.glyphKnockout` | material.glyphKnockout, preserve real holes | `src/v3-commands.js` → Scene 编辑/工艺执行器 | 未找到直接点名的测试 | 待接入并逐项验收 |
| `group.transform` | layer.place + explicit transform command | `src/v3-commands.js` → Scene 编辑/工艺执行器 | 未找到直接点名的测试 | 待接入并逐项验收 |
| `group.create` | group.create | `src/v3-commands.js` → Scene 编辑/工艺执行器 | 未找到直接点名的测试 | 待接入并逐项验收 |
| `group.ungroup` | group.ungroup | `src/v3-commands.js` → Scene 编辑/工艺执行器 | 未找到直接点名的测试 | 待接入并逐项验收 |
| `material.decision` | material.decision | `src/v3-commands.js` → Scene 编辑/工艺执行器 | v3-package.test.js | 待接入并逐项验收 |
| `scene.compose` | group.compose / typed scene import, no second authority | `src/v3-commands.js` → Scene 编辑/工艺执行器 | 未找到直接点名的测试 | 待接入并逐项验收 |
| `tool.compose_page` | group.compose / ordered typed create commands; preserve full primitive and writing capabilities | `src/v3-commands.js` → `src/web-scene-workbench.js` | 未找到直接点名的测试 | 待接入并逐项验收 |
| `tool.place_materials` | material.add with common place/parent/order | `src/v3-commands.js` → `src/web-scene-workbench.js` | 未找到直接点名的测试 | 待接入并逐项验收 |
| `tool.draw_tape_strips` | material.tape plus typed advanced ribbon/strip geometry | `src/v3-commands.js` → `src/web-scene-workbench.js` | 未找到直接点名的测试 | 待接入并逐项验收 |
| `tool.edit_materials` | material.crop/mask/edge plus advanced processing registry for every step | `src/v3-commands.js` → `src/web-scene-workbench.js` | 未找到直接点名的测试 | 待接入并逐项验收 |
| `tool.upsert_materials` | material.add / material.replace / typed material update; explicit create-vs-update semantics | `src/v3-commands.js` → `src/web-scene-workbench.js` | 未找到直接点名的测试 | 待接入并逐项验收 |
| `tool.move_elements` | layer.place; preserve ratio/mm and relative reference support | `src/v3-commands.js` → `src/web-scene-workbench.js` | 未找到直接点名的测试 | 待接入并逐项验收 |
| `tool.arrange_elements` | layout.arrange; extend typed rules for every original arrangement | `src/v3-commands.js` → `src/web-scene-workbench.js` | 未找到直接点名的测试 | 待接入并逐项验收 |
| `tool.align_elements` | layout.align to add with common reference/anchor definitions | `src/v3-commands.js` → `src/web-scene-workbench.js` | 未找到直接点名的测试 | 待接入并逐项验收 |
| `tool.fit_text_to` | text.fit to add; explicit fit policy and minimum readable font, no silent overflow | `src/v3-commands.js` → `src/web-scene-workbench.js` | 未找到直接点名的测试 | 待接入并逐项验收 |
| `tool.upsert_primitives` | shape.add/vector.add/ink.add + typed updates, preserve all original shapes | `src/v3-commands.js` → `src/web-scene-workbench.js` | 未找到直接点名的测试 | 待接入并逐项验收 |
| `tool.upsert_text` | text.add/text.update + advanced text properties | `src/v3-commands.js` → `src/web-scene-workbench.js` | 未找到直接点名的测试 | 待接入并逐项验收 |
| `tool.style_elements` | layer.update.style + typed per-node advanced style definitions | `src/v3-commands.js` → `src/web-scene-workbench.js` | 未找到直接点名的测试 | 待接入并逐项验收 |
| `tool.group_elements` | group.create/group.compose | `src/v3-commands.js` → `src/web-scene-workbench.js` | 未找到直接点名的测试 | 待接入并逐项验收 |
| `tool.ungroup_elements` | group.ungroup with world/compositing preservation | `src/v3-commands.js` → `src/web-scene-workbench.js` | 未找到直接点名的测试 | 待接入并逐项验收 |
| `tool.delete_elements` | layer.delete with dependency/material rules | `src/v3-commands.js` → `src/web-scene-workbench.js` | 未找到直接点名的测试 | 待接入并逐项验收 |
| `tool.set_paper` | page.update + typed native paper pattern definition | `src/v3-commands.js` → `src/web-scene-workbench.js` | 未找到直接点名的测试 | 待接入并逐项验收 |
| `tool.finish_design` | material.decision + validation/review/pack, never fake visual approval | `src/v3-commands.js` → `src/web-scene-workbench.js` | 未找到直接点名的测试 | 待接入并逐项验收 |
| `tool.apply_craft_plan` | material.craft advanced typed registry; source metadata auto-resolved | `src/v3-commands.js` → `src/web-scene-workbench.js` | 未找到直接点名的测试 | 待接入并逐项验收 |
