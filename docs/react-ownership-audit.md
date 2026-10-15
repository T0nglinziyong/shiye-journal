# React 与画布所有权

运行中的页面结构由 React 持有。`src/app.js` 负责业务编排、路由和存储，不得直接增删或替换 React 子节点。图片解码、容器尺寸测量和画布像素绘制可以使用浏览器 API，但不能另建一套页面结构。系列合成封面由 React 组件显示；测量作品缩略图时仅更新容器尺寸样式。

| 区域 | 所有者 | 验收 |
| --- | --- | --- |
| 顶栏、导航和同步状态 | `src/react-shell.jsx` | `tests/react-route-smoke.mjs` |
| 素材、系列、作品、筛选、分页、批量操作及最近删除 | `src/react-routes.jsx` | `tests/library-selection-browser.mjs`、`tests/trash-offline-browser.mjs` |
| 导入、登录、账号、设置、编辑弹窗及抠图面板 | React 页面和弹窗组件 | `tests/import-browser-acceptance.mjs`、`tests/route-parity-smoke.mjs` |
| 创作页面工具栏和画布容器 | `EditorPage`、`FabricEditorToolbar`、`FabricPageViewport` | `tests/fabric-editor-product-browser.mjs`、`tests/editor-layout-browser.mjs` |
| 画布对象、选择、笔迹预览 | `FabricSceneStage` 与独立笔迹几何模块 | `tests/fabric-stage-browser.mjs` |
| 持久作品数据 | Scene v2 (`src/scene-v2.js`) | `tests/scene-model.test.js` |
| 封面、PNG 与 PDF 像素 | `src/scene-renderer.js` 的 Canvas 2D 合成；PDF 嵌入同一画面 | `tests/fabric-stage-browser.mjs` |

Fabric 作为唯一运行中的可编辑画布，React 只管理其宿主和控制状态。画笔采样和预览在 Fabric 画布内完成，提交时写回 Scene v2 的矢量笔迹。素材的局部前后穿插通过 `sceneDisplaySiblings()` 投影：Fabric 和 Canvas 2D 读取同一份 Scene 并应用同一投影，不把显示片段存成第二份素材。

同一路由的 React 根节点保持挂载，避免局部操作重建页面与重复解码图片。封面由 Scene 合成，不从编辑画布截屏。`tests/fabric-stage-browser.mjs` 对照编辑画布与 Canvas 2D 的纸张、形状、素材、文字、笔迹和穿插，并在同一分辨率对照封面与导出图像像素。浏览器视口测试仍不等于实体 Safari 和 Pencil 验收。

旧数据格式转换仅保留用户主动启动的迁移工具。旧画布模块不得重新作为运行时回退；新增画布功能须写入 Scene v2，再分别实现 Fabric 交互和 Canvas 2D 输出，并加入同场景对照测试。
