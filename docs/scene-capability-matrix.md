# GPT 创作包 v3 能力矩阵

本矩阵以仓库中的 `webSceneContract`、`offlineContract('agent')`、`craftPlanContract`、`applyWebSceneCommands` 和 `renderSceneCanvas` 为基线。v3 不改变 Scene v2 的页面与节点数据语义。所有命令都在 `work/commands.json.operations` 中执行，成功后只提交 `scene.json`；包内其他 JSON 不代表作品状态。

| 旧能力 | Scene v2 表达 | v3 命令 | 校验与渲染 |
| --- | --- | --- | --- |
| 整件实物/固定原图 | material、assetID、sourceBlobId、generationBaseline | material.add / tool.place_materials | validateWebScene + validateScenePhysical；Canvas material |
| 固定源像素裁切 | cropRect、materialSteps | material.process / tool.edit_materials / material.craft | 加工权限、mm 比例和源区域；Canvas crop |
| 矩形、斜线、轮廓、开窗、数值字形 | materialMask、vectorMask、materialSteps | material.process、material.glyphKnockout、material.craft | 拓扑与孔洞真实透明；Canvas mask |
| 撕边、邮票、票券、流苏 | materialMask、materialSteps | material.process edge / material.craft | 边缘面积及有限参数；Canvas mask |
| 原素材多片、父片再切、余料 | craftProvenance、craftScraps、craftLedger、isParked | material.craft（sourcePartitions/consume/keepRemainders） | source unit 几何守恒与源占用；Canvas 可见片 |
| 双孔穿插 | craftDisplaySlices | material.craft.weaves | compileTwoHoleWeaves + validateDisplaySlices；Canvas 前后片段 |
| 胶带真实取样、重复纹样、端头 | tapeStrip v2 | material.tape / tool.draw_tape_strips | 来源长度、宽度、重复区间；Canvas material |
| 素材关系与叠压 | materialRelation、zIndex、group | material.craft / layer.move / group.create | validateSceneExtensions；Canvas 层序 |
| 可编辑文字、曲线、字号、段落 | text | text.add / tool.upsert_text / layer.update | layoutText 与 Scene contract；Canvas text |
| 数字图形、自由矢量、多色路径 | shape/vectorPaths/vectorLayers | shape.add / tool.upsert_primitives / layer.insert | Scene contract + vector geometry；Canvas shape |
| 笔迹、荧光笔、压感 | ink.points/penStyle | ink.add / scene.compose / layer.insert | Scene contract；Canvas ink |
| 组合、撤组、组合变换 | group.children | group.create / group.ungroup / group.transform | validateSceneExtensions；Canvas group |
| 移动、对齐、分布、文字贴合 | x/y/zIndex 与 text frame | layer.update / tool.move_elements / tool.align_elements / tool.arrange_elements / tool.fit_text_to | 物理尺寸不随布局变化 |
| 数字印章、素材替换、布局复用 | shape/material 与来源快照 | layer.repeatStamp / layer.replaceMaterial / layer.reuseLayout | repeatSceneStamp/replaceSceneMaterial/reuseSceneLayout；Canvas |
| 纸色、纸纹和中缝 | page.paperColor/paperPattern/drawCenterGutter | page.update / tool.set_paper | 任务固定单双页与物理规格；Canvas paper |
| 逐件素材取舍 | scene.json.materialDecisions | material.decision | validateMaterialDecisions + 必用素材检查 |
| 旧工具合同剩余操作 | 原生 Scene 节点 | tool.<旧工具名>（同一 operations 数组） | 复用 applyToolCalls 与最终 Scene/物理校验 |
| 精确原生节点字段 | material/text/shape/ink/group | layer.insert / layer.update（白名单） | source/identity 不可通过 patch 改写 |

## 固定约束

- `TASK.json.sourceContext`、素材源 UUID、blob 版本与原始用户文字是只读输入。命令不能改任务纸张尺寸；如需改变单双页或纸张规格，在 App 中更改任务后重新导出。
- `scene.json` 存在事务回执 `v3Transactions`，用于中断恢复和幂等。完整作品仍是同一份 Scene v2 的 `page`；打包输出去掉内部回执。
- 初次创建、分片和后续修订都通过同一 `apply` 入口，底层复用现有物理几何算法；复杂计划只是 `material.craft.plan` 参数，并非第二套文件或 CLI。
- `preview` 使用 `renderSceneCanvas` 的 Node Canvas 适配；`pack` 校验当前 revision、Scene hash、PNG hash、尺寸和 renderer，并重渲染当前 Scene 比对 PNG。未实现 Chromium 备用后端，不声明与浏览器逐像素一致。
- 主要端到端测试：`tests/v3-package.test.js`。底层裁片、孔洞、余料、穿插与 Scene 渲染单测仍位于 `tests/craft-plan.test.js`、`tests/craft-multimodal.test.js`、`tests/scene-*.test.js`。
