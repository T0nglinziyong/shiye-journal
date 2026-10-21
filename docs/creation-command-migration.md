# 创作命令能力映射（截至 2026-10-21）

附件列出的 39 项原操作继续由 `src/v3-commands.js` 执行，统一创作包默认协议 2；高级入口为 `advanced.v1.<原操作名>`，仍写在同一 `commands.json`。24 个简洁操作在 `src/creation-v2-commands.js` 执行，另一个候选 `layout.arrange` 暂缓。`visible` 边界定位也暂缓，发布 Schema 不接受这两个参数。纸张尺寸与单双页是任务来源固定值；`page.update` 仅修改纸色，旧页面图案和中缝命令可通过高级入口使用。

| 简洁操作 | 已接入的能力 |
|---|---|
| `material.add`, `text.add/update`, `shape.add`, `vector.add`, `ink.add`, `layer.place/update/reparent/reorder/delete`, `group.create/compose/ungroup`, `layout.detach`, `material.decision`, `page.update` | 页面/组/节点相对定位、顺序、样式和阴影；真实组内局部坐标、持久 `linked` 约束及解绑；删除被依赖节点时可选择解绑。 |
| `material.crop`, `material.window`, `material.split`, `material.mask`, `material.weave`, `material.tape`, `material.edge` | 矩形、椭圆、多边形与 SVG 路径区域；实体分片、余料和窗芯；2–16 个开窗穿插；显示蒙版与实体裁切分开。复杂原生工艺仍可用 `advanced.v1.*`。 |
| `layout.arrange`, `visible` 锚点 | 按用户本轮要求暂缓；统一运行时的公开 Schema 会拒绝。 |

下面 39 行是原操作到新统一文件的能力映射。执行入口存在不等于每个参数都完成跨浏览器像素验收；具体限制见接入状态。

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
