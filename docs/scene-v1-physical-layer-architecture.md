# 拾页 Scene v1：面向实体手帐的统一创作场景

## 唯一权威数据

- **Project** 是作品容器（标题、多个 Draft、历史、云端版本），**Draft 就是唯一 Scene 数据**。不在旁边维护另一套 image-layer JSON。Scene v1 是当前 Draft 添加 `sceneVersion:1`、可选 `layerGroups` 的版本化约定。
- 叶子仍使用 `items / textBlocks / primitives / strokes`，分别表示实体素材、文本、矢量图形和笔迹。统一 `sceneLayerEntries` 输出一套图层视图，供创作页、渲染和诊断共用；**图层视图不会复制或改写原始数据**。
- AI 的 `page` / `tools` 是模型交互命令；都在 `creative.js` 执行并写入 **同一 Draft**。它们不是另一个长期保存格式。复杂父片、余料与双孔穿插保留既有实体账本与来源绑定。
- 原生作品 ZIP 依旧包含完整 Project JSON；新增单画布 `shiye-scene.json` 为便捷跨设备导出导入。图片资产按 `assetID` 引用本账户的原图；**单个 Scene JSON 不是自包含图片文件**，素材库必须已有对应 assetID。
- 保存遵循现有本地 IndexedDB / Supabase JSON / COS 对象存储路径；不用迁移数据库表。对场景变更继续沿用已有撤销、重做和异步保存机制。

## 已支持的符合实体世界的扩展

| 能力 | Scene 表示 | 人工编辑 | AI 创作 | 渲染/导出 |
|---|---|---|---|---|
| 非破坏性裁切、实体镂空 | 既有 `cropRect/materialMask/materialSteps` | 既有素材加工页 | 既有物理加工工具 | 现有物理渲染与校验 |
| 通用多边形矢量剪裁蒙版 | 叶子 `vectorMask:{outer,holes}`，归一化 0–1 点 | 图层详细设置内的矩形、椭圆、轮廓 JSON 编辑 | direct-page 的 `vector_mask`；工具的 `style_elements` | DOM 使用 SVG 蒙版，Canvas 使用 even-odd clip |
| 透明纸／胶带叠压 | `blendMode:normal|multiply` | 详细设置下拉框 | `blend_mode` / `style_elements` | DOM CSS 与 Canvas 同语义 |
| 物理布局编组 | `layerGroups` + 每叶 `creativeGroupID` | 多选后「组合所选图层／取消组合」 | `groups` 或 `group_elements` | 每件实体仍保留自己的大小和层序 |
| 手写、自由矢量与文本 | 已有 `strokes/vectorPaths/vectorLayers/textBlocks` | 现有笔刷与自由图形坐标编辑 | direct-page 与 upsert 工具 | 原有 Canvas、SVG 渲染 |

蒙版是不改变原图的虚拟剪裁；当对象为实体素材时，实物库存和已校准尺寸仍由 `checkDraft` / `buildMaterialLedger` 检查。**组不允许缩放实体**；此次物理布局组只支持一起选择和移动，不是 Photoshop 的无限层级隔离合成。

## 保留的能力边界

- 没有引入不符合实体手帐的智能滤镜、液化、任意整体缩放真实物料、无限颜色通道混合、像素级破坏性原图改写。
- 尚未实现 **真正嵌套且隔离混合的 Photoshop 图层组**、画笔绘制灰度栅格蒙版、贝塞尔控制柄可视化编辑；当前矢量蒙版为多边形和预设椭圆/矩形，专业节点编辑仍需后续专项实现。
- 笔迹目前在编辑预览里以单独 Ink Canvas 覆盖画面；它们没有完整的与实体图层逐笔交错的 z 顺序。其压感、颜色、透明度已是标准 Draft 的一部分，但不能声称任意笔迹下穿自动实现。
- 网页 GPT 的 `page/tools` 仍作为便于模型稳定生成的两种**输入适配协议**，不会被不受校验的外部 Draft 直接覆盖。单文件标准 Scene JSON 经过现有物理来源与数量校验后才能被导入。

## 下一阶段（不在本次提交范围）

1. 完整图层栈的任意顺序绘制与统一实时 Canvas hit-testing，处理 Ink 插层及编辑预览与高清导出一致性；
2. 在统一 Scene 下增加可视化裁剪路径节点和孔洞编辑工具，复用材质原始物理 mm 源坐标；
3. 仅在需要时实现真实平面工艺能够解释的组内 clipping / 多次镂空；不引入 PSD 不受约束的图像操作；
4. 性能验收：大量透明素材、128+ 笔迹的浏览器内存、Pencil 流畅度及 Canvas/DOM 帧一致性。

## 验收建议

运行 `npm test` 与构建，逐项验证：实体贴纸加裁切和正片叠底、图形/文字共享蒙版、编组移动后实体大小不变、单个 Scene JSON 导出再导入不丢图层、现有 ZIP 导入、AI 工具/direct 输出、新旧笔迹预览、双孔穿插、云端实际同步，以及 iPad Safari 页面与导出 PNG 的像素对比。无法真实运行的环节不得标记为通过。
