# 创作包接入状态（2026-10-21）

## 已进入可执行 v3 包

- 附件的固定创作指导经过与现有命令核对后发布为 `design/CRAFT_GUIDE.md`；固定入口与 `api/fixed-release.json` 带同一 release ID。任务特有的内容继续在 `TASK.json` 和动态 `design/GUIDE.md`，避免把用户文字和素材 ID 写入固定说明。
- 原有 39 种协议 1 命令继续由 `src/v3-commands.js` 注册。`help` 和 `describe` 只列当前运行时能识别的 39 种命令，不把附件协议 2 候选命令冒充已实现能力。
- `begin`、无副作用的 `check`、`preview --commands`、审阅记录 `review` 已接入。正式 `preview`、`pack` 继续从当前 Scene 渲染并比对 PNG。事务收据与 Scene 存在同一个原子替换的 JSON 中。
- `text.add.fontSizePt` 与文字 `layer.update.set.fontSizePt` 使用 pt→mm→Scene 单位换算；更新也可用 `xMm/yMm/widthMm`。材料占用仍通过原 Scene v2 实体校验。
- 真实 Canvas 后端写入预览记录和交付清单。无法核实为原生 node-canvas 的兼容适配器明确标为 `unverified-canvas-adapter`。
- 动态 RECIPES 只展示局部编辑，不再替必用素材生成 `omitted` 决定。

## 协议 2 实验链路

- `api/commands.v2-experimental.schema.json` 由附件 25 个候选操作和现有 39 个高级原生操作的真实 Schema 组合生成。高级操作使用 `advanced.v1.*` 名称，仍写在同一个 `commands.json` 中，经同一个 Scene/预览/打包入口执行；这保留了原有能力，但其参数尚未统一成简洁版。
- 简洁版已接入 24 个操作入口，其中部分只支持受约束的参数子集；未支持的参数会明确报错。已验证的实际物理操作包括矩形实体分片和余料、命名开窗、两孔穿插、胶带段与撕边；显示蒙版与实体裁切分开。
- `group.create` 与 `group.compose` 使用 Scene 中持久的刚性局部矩阵和独立 `layoutBox`。子对象按组内坐标存储；组旋转、移动、重父级及解组会换算矩阵以保持画面。`place.behavior=linked` 将关系保存为图层约束，相关命令和编辑器拖动后重算；循环、缺失参照与删除仍被引用的节点会拒绝。`layout.detach` 保留当前世界位置并解除关系。
- `examples/v2-experimental/拾页-协议2创作包-实验示例.zip` 包含协议 2 命令草稿。生成器实际执行 `check → apply → preview → pack`，同目录保存真实 `preview.png`、`project.shiyeproject.json` 与 `manifest.json`。这个示例验证工程链路，不是人工确认的高质量视觉作品。
- 网站导出的正式创作包仍以协议 1 为默认，直到 `layout.arrange`、可见边界定位及剩余工艺参数完成验证。

## 验证

- 协议 2 测试覆盖简洁创建/更新、实体分片账本、胶带、撕边、开窗穿插、同一文件中的高级原生命令与 ZIP 打包。局部组新增了保存重开、旋转、重父级、解组、真实 Canvas 像素与 linked 重算用例。
- 本轮 `npm test` 通过 1240 项，`npm run test:ui` 通过。浏览器产品编辑器、Fabric 画布、导入、作品删除分别通过；Fabric 用例新增局部组与真实 Canvas 的像素对比。全量浏览器串跑中，导入页第 27 张截图曾遇到一次 CDP 截图超时，随后单独重跑导入用例通过 28 张截图检查。
- 附件候选契约：`node creation-contract/tools/build-contract.cjs --check`、纯几何 21 项、Python Schema 84 项通过。其结果只证明静态契约一致，不证明协议 2 已执行。
- 可执行 v3 测试：单素材创建/预览/打包，三素材分片/余料/双开窗/穿插，八件必用素材的多事务文字修订/分组/预览/打包。
- 示例：`examples/v3/拾页-GPT创作包-v3-示例.zip`。其中 `simple` 与 `complex` 输出来自真正运行的 v3 Scene 和 node-canvas。

## 未完成与未验证

- 附件协议 2 的统一 `place/size/style/order` 已接入基本页面、节点定位、组局部坐标和持久 `linked`；`layout.arrange`、`visible` 锚点、复杂组蒙版的跨渲染器像素一致性及部分创建命令的 order 参数尚未完成。高级原生能力保留在显式 `advanced.v1.*`，参数统一工作尚未完成。
- Scene v2 的局部组已接入原生 Canvas 与 Fabric 的组变换，编辑器叶图层读取采用世界坐标投影。仍需对 Fabric 内逐个子图层的交互、复杂混合/蒙版和浏览器真实作品导入做专项验收；不能将候选 `scene-spatial.schema.json` 覆盖现有完整 Scene Schema。
- 39 种旧操作均在协议 1 注册，但并非 39 项都已各自完成 Scene→PNG→重开编辑验收。逐项见 [映射表](creation-command-migration.md)。
- 字体依赖执行机器；尚未完成 node-canvas、Skia、浏览器的字体测量和像素一致性比对。8 件回归使用合成素材，尚未用真实用户任务 8 张原图重放。
- Scene 写入是单文件原子替换，锁能阻止并发写入，但进程在持锁时崩溃后的自动锁恢复与完整 journal 验收尚未完成。
