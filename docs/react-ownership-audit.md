# React 页面所有权审计

此文档记录运行中的页面由谁生成和更新。React 组件持有的节点不能再由业务模块移除、替换或重排。Canvas、图片解码和视口测量可以使用 DOM API，但不应生成页面结构。

## 已由 React 持有

| 区域 | 当前入口 | 验收 |
| --- | --- | --- |
| 顶栏、主导航、同步状态和素材篮计数 | `react-shell.jsx` 的状态与事件 | `test:ui`、`browser-acceptance.mjs`、`library-selection-browser.mjs` |
| 路由主体 | `react-shell.jsx`、`react-routes.jsx` | `test:ui`、`browser-acceptance.mjs` |
| 素材、系列、作品的标签和入口卡片 | `react-routes.jsx` | `library-selection-browser.mjs`、`react-dom-ownership-browser.mjs` |
| 素材、系列、作品的「选择 / 完成」按钮 | `SelectionToggle` | `library-selection-browser.mjs`，包括跨标签延续素材选择 |
| 素材与作品的最近删除列表、恢复、批量删除 | `RecentlyDeletedPage` | `trash-offline-browser.mjs`、`library-canvas-latest-browser.mjs` |
| 模板列表、详情、筛选与导入表单 | `JournalTemplatesPage`、`journal-template-data.js` | `route-parity-smoke.mjs`、`browser-acceptance.mjs` |
| 素材库和作品库的分页卡片 | `LibraryPage`、`WorksPage` | `react-route-smoke.mjs`、`library-selection-browser.mjs` |
| 搭配页面、素材篮和方案进度 | `MatchingPage`、`MatchingSessionPanel`，数据由 `matchingViewModel` 与会话订阅提供 | `react-route-smoke.mjs`、`matching-browser.mjs`；旧字符串 HTML 与增量 DOM 回退已删除 |

## 仍需迁移的页面结构

| 区域 | 当前直接 DOM 入口 | 迁移验收重点 |
| --- | --- | --- |
| 素材、系列、作品的批量操作栏与筛选菜单 | `library-selection-ui.js`、`series-contents.js`、`parity-ui.js`、`workflow-ui.js`、`filter-controls.js`、`catalog-pagination.js` | 跨页选择、全选、更多操作、搜索输入焦点、翻页、返回滚动位置 |
| 素材导入检查与候选操作 | `import-incremental.js`、`import-workspace-ui.js`、`paper-ui.js`、`import-box-editor.js` | 手动框、透明 Mask、设置切换、连续导入、尺寸与图片不丢失 |
| 素材编辑、抠图、系列编辑和其他弹窗 | `asset-editor.js`、`cutout-editor.js`、`series-editor.js`、`app.js` 等 | 保存、撤销、手势、弹窗关闭和焦点恢复 |
| 登录与账号管理 | `cloud-auth-ui.js`、`account-management.js` | 首屏无旧页面闪烁、登录切换、私有缓存隔离 |
| 默认创作画布 | `canvas-editor-ui.js`、`canvas-selection-ui.js`、`editor-layer-tree.js`、`app.js` | Fabric 画笔、橡皮、对象、文字、素材加工、图层、缩放及完整作品回读 |
| 辅助管理和反馈弹窗 | `admin-view.js`、`storage-usage-ui.js`、`ai-diagnostics.js`、`help-ui.js`、`app.js` 的 `body.innerHTML` 弹窗 | 账号、诊断、备份、同步冲突、素材与作品编辑 |
| 全局图标装饰与菜单 | `icons.js`、`swift-popover.js` | 图标更新不替换 React 子节点，菜单开合保留焦点和键盘操作 |

Fabric 目前只在 `?fabric-editor` 预览入口启用。基础交互测试通过，但旧画布的完整产品验收尚未通过；默认入口仍使用旧画布。移除默认旧画布之前，必须使 Fabric 验收覆盖并通过相同的创作功能。旧数据格式转换仍仅由独立、用户主动触发的迁移工具负责，不作为这些 UI 模块的运行时回退。

`react-dom-ownership-browser.mjs` 在手机和桌面视口反复切换常用标签，检查 React 卸载与重建是否出现节点所有权异常。它是防回归检查，不代表上述未迁移区域已经完成。

## 为什么仍有局部 DOM

早期迁移只把页面外壳和主卡片树交给 React；`app.js` 在每次路由渲染之后仍调用 `mountParityControls()`、`bindPage()`、`mountWorkflowControls()` 与 `pageControllers.mount()`，让旧模块继续追加节点、给 React 生成的元素绑定事件或改写它们的属性。React 与这些模块因此共用同一片 DOM。它是未完成迁移的边界，不是 React 本身的限制，也不是必须保留的旧格式兼容。

其中 `filter-controls.js` 仍会在 React 的筛选区插入四个按钮；`library-selection-ui.js`、`workflow-ui.js` 仍会生成批量操作栏并修改卡片的选中外观；`series-contents.js` 仍会给系列详情的 React 元素绑定事件；`app.js` 仍用 `body.innerHTML` 打开部分弹窗。现有自动化能检查若干导航和操作路径，但不能证明所有这些共用 DOM 的路径都稳定。

`renderReactPage()` 目前还会在多数 `render()` 调用时卸载并重建整棵路由树。这样做是为了避开仍在改写 React 子节点的旧挂载器；它也会重置局部组件状态和封面节点。只有在上述活动入口清除后，才能让同一路由持续由 React 协调更新。

清除这些入口后，再移除对应的挂载调用和旧模块；默认画布切到 Fabric 之前，须对完整创作功能完成同等验收。原始图片解码、Canvas 绘制、视口测量等底层浏览器 API 不属于页面结构所有权迁移。
