# Scene v2 — 拾页面向实体拼贴的单一图层树

## 权威数据与读写路径

作品 `Project.drafts[]` 中的 `Draft.layers` 是唯一持久化画面结构：
```json
{"sceneVersion":2,"canvas":{"width":707,"height":1000},"pageMode":"single","pageRatio":"a4","physicalPageHeightMM":297,"layers":[{"type":"material","id":"piece-1","assetID":"source-1","x":200,"y":300,"width":100,"height":100,"zIndex":1,"materialUnitIndex":0},{"type":"ink","id":"stroke-1","points":[{"x":100,"y":100,"p":0.5}],"width":3,"color":"#30463d","zIndex":2},{"type":"group","id":"group-1","name":"手帐组合","children":[{"type":"text","id":"note","content":"春日记录","x":100,"y":200,"width":140,"height":50,"zIndex":1}]}]}
```
这个示例说明结构，实物宽高必须由对应 assetID 的毫米标定和裁片来源确定，不可任意填入上面示例的 100。字体/色彩/压感应保持可编辑。

`items`、`primitives`、`textBlocks`、`strokes` 不再作为可枚举/可序列化的保存字段；`attachSceneV2` 提供**临时写穿视图**以继续执行已有实体裁片和 UI 算法。任何经 `structuredClone` / JSON / 云端读取恢复的 Draft 必须先 `attachSceneV2`。保存文件不保留临时视图。

- 人工编辑：通过写穿视图或 `moveSceneNode`、`groupSceneLayers`、`transformSceneGroup` 修改同一树；
- AI 直接排版：`page.version=2` + `page.layers`（模型用素材 alias 和 0–1 摆放比例）转换为相同的真实 Draft 树；
- AI 工具调用：既有 `compose_page / apply_craft_plan` 与新 `style_elements / group_elements / ungroup_elements` 修改同一树；来源、库存、余料不变；
- Canvas 高分辨预览、图片导出：递归遍历树，笔迹可按 z 插在贴纸下；透明组按需离屏合成；局部物理穿插只投影可见片段，不产生新库存；
- 编辑页 DOM 与作品缩略图：共享 `sceneDisplaySiblings` 的物理片段投影与 `inkScenePaths` 笔迹矢量；
- 原生 ZIP/单文件 Scene JSON/数据库：保存 JSON 树；图像原始素材由独立素材库按 `assetID` 读取，工程文件不包含原图。

## 物理手帐约束

- 实物放入：`assetID` 必须存在，形状来自原图与蒙版，尺寸与 `physicalWidthMM/HeightMM` 和源裁片对齐；不是自由调整材料大小；
- 实物单位：`materialUnitIndex`、裁片源多边形以及胶带可用长度受 `validateScenePhysical` 与原材料账本限制；
- 纸片组：成员可以整体移动和旋转，但不缩放原始实物；支持子组、组级不透明度/正片叠底、有限多边形蒙版；
- 数字文字、图形和书写笔画可自由调整；复杂数字滤镜、液化、无约束图像复制不纳入目标。

## 旧数据

本次以 v2 为唯一新格式。原有完整 v1 `Draft.items/textBlocks/primitives/strokes` 在项目读取或待同步队列恢复时迁移为一棵 v2 树（仅迁移一次；不会双重持久化）。**不完整旧数据不会被推定为一个空白的合法作品并覆盖云端**。源素材必须继续保持可读取；迁移不替换丢失原图。

## 需要验证后才能合并

- `npm ci && npm test && npm run build` 完整通过；`scripts/build-offline-runtime.mjs` 重新生成匹配 v2 的离线 validator/browser bundle；
- 导入→单页/双页创作→组移动/旋转→笔迹插层→纸片孔洞与胶带叠压→PNG/PDF/封面像素一致；
- 离线 IndexedDB 修改及意外退出恢复、COS/Supabase 版本冲突、跨设备重开、旧作品迁移及原生 ZIP；
- AI `page.version=2` 与多轮工具调用，在多种风格下各测试失败回滚、实物库存、必用素材、source 指纹；
- iPhone Safari、iPad Pencil/套索、电脑宽屏及窗口调整：无丢帧、悬空选框、重复下载；
- 缺图、过大图片、错误 JSON、循环组、零面积剪裁、伪造实体宽高必须被拒绝。

**CI 与真实浏览器未通过验收之前，PR #128 维持 Draft，不应合并到 test 或发布为已完成版本。**
