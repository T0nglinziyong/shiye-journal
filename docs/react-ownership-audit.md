# React 页面所有权审计

此文档记录运行中的页面由谁生成和更新。React 组件持有的节点不能再由业务模块移除、替换或重排。Canvas、图片解码和视口测量可以使用 DOM API，但不应生成页面结构。

## 已由 React 持有

| 区域 | 当前入口 | 验收 |
| --- | --- | --- |
| 顶栏、主导航、路由主体 | `react-shell.jsx`、`react-routes.jsx` | `test:ui`、`browser-acceptance.mjs` |
| 素材、系列、作品的标签和入口卡片 | `react-routes.jsx` | `library-selection-browser.mjs`、`react-dom-ownership-browser.mjs` |
| 素材与作品的最近删除列表、恢复、批量删除 | `RecentlyDeletedPage` | `trash-offline-browser.mjs`、`library-canvas-latest-browser.mjs` |
| 素材库和作品库的分页卡片 | `LibraryPage`、`WorksPage` | `react-route-smoke.mjs`、`library-selection-browser.mjs` |

## 仍需迁移的页面结构

| 区域 | 当前直接 DOM 入口 | 迁移验收重点 |
| --- | --- | --- |
| 素材、系列、作品的选择栏与筛选菜单 | `library-selection-ui.js`、`series-contents.js`、`parity-ui.js`、`workflow-ui.js`、`filter-controls.js`、`catalog-pagination.js` | 跨页选择、全选、更多操作、搜索输入焦点、翻页、返回滚动位置 |
| 模板库和模板导入弹窗 | `journal-template-ui.js` | 模板与真实案例封面、筛选、导入图片、切换详情、账号隔离 |
| 素材导入检查与候选操作 | `import-incremental.js`、`import-workspace-ui.js`、`paper-ui.js`、`import-box-editor.js` | 手动框、透明 Mask、设置切换、连续导入、尺寸与图片不丢失 |
| 素材编辑、抠图、系列编辑和其他弹窗 | `asset-editor.js`、`cutout-editor.js`、`series-editor.js`、`app.js` 等 | 保存、撤销、手势、弹窗关闭和焦点恢复 |
| 登录与账号管理 | `cloud-auth-ui.js`、`account-management.js` | 首屏无旧页面闪烁、登录切换、私有缓存隔离 |
| 默认创作画布 | `canvas-editor-ui.js`、`canvas-selection-ui.js`、`editor-layer-tree.js`、`app.js` | Fabric 画笔、橡皮、对象、文字、素材加工、图层、缩放及完整作品回读 |

Fabric 目前只在 `?fabric-editor` 预览入口启用。基础交互测试通过，但旧画布的完整产品验收尚未通过；默认入口仍使用旧画布。移除默认旧画布之前，必须使 Fabric 验收覆盖并通过相同的创作功能。旧数据格式转换仍仅由独立、用户主动触发的迁移工具负责，不作为这些 UI 模块的运行时回退。

`react-dom-ownership-browser.mjs` 在手机和桌面视口反复切换常用标签，检查 React 卸载与重建是否出现节点所有权异常。它是防回归检查，不代表上述未迁移区域已经完成。
