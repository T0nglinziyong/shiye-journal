# 拾页增量 UI 架构（2026-10-13）

## 设计目标

保留原生 JavaScript + Scene v2 + DOM/Canvas/SVG + IndexedDB/COS 的业务协议。把页面的呈现与数据来源分离，使 UI 可以局部协调、组件有可预测生命周期，并允许将来在不重写 Scene/识别/同步协议的情况下替换呈现层（React/Vue）。

### 三个边界

1. **Source of truth**：`state` / Scene v2 / 存储记录；不能从 DOM 反向推断唯一业务数据。持久化、Undo 和跨设备同步仍调用既有业务函数。
2. **Projection**：`renderImportInspection`、`renderLibrary`、`renderWorks` 等负责产生期望的 UI 描述。页面组件不直接控制 COS 或识别算法。
3. **Reconciliation**：`patchImportInspection`、`patchMaterialCatalog`、`patchWorksCatalog`、`reconcileLayerBranches` 等更新现有 DOM。若结构发生不可安全协调的变化，明确回退到 `render()` 的整体挂载路径。

### 组件生命周期

`src/ui-component-lifecycle.js` 提供 `ComponentLifetime`：

- `on(target,event,listener)` 追踪监听器；
- `resize(element,callback)` 追踪 ResizeObserver；
- `frame(callback)` 和 `timer(callback,ms)` 追踪异步渲染；
- `dispose()` 幂等地解除所有资源。

`paper-ui.js` 和 `import-box-editor.js` 已采用统一释放机制。**挂载到页面的组件必须在容器替换/退出路由时释放资源**。未来可将这个 `dispose()` 直接接入 React effect cleanup 或 Vue onUnmounted。

### 稳定节点与事件

`src/ui-keyed-dom.js` 用稳定键协调 DOM，保留没有改变的元素实例、图片解码状态、浏览器焦点和已有事件。节点变化时只替换受影响项。一个节点的 key 不应包含其经常变化的显示属性。

`bindPage()` 通过 WeakSet 只为新增 `data-act` 节点注册事件，保留节点不得重复添加监听器。局部更新后调用一次 `bindPage({partial:true})` 即可注册新节点。

异步处理暂时禁用控件时应使用 `syncBusyControls()`，确保原本就禁用的控件在进度结束后依然保持禁用，而被进度临时禁用的控件恢复可交互。

### 各页面的增量边界

| 路由/组件 | 粒度 | 退回全量挂载的条件 |
|---|---|---|
| `import` | 照片队列、预览、参数区、候选卡片 | 导入步骤/模式/结构改变 |
| `library` | 单个素材卡片 | 从素材列表进入系列内容/最近删除/批量选择 |
| `works` | 单个作品卡片 | 切换 tab、最近删除、模板、批量选择 |
| 模板 | 稳定模板卡片 ID | 从列表进入模板详情 |
| 搭配方案 | 单个方案进度 | 新方案、删除方案或状态/行动按钮结构变化 |
| 图层树 | 单个行和递归子树 | Scene 节点对象身份改变/图层树销毁 |
| 创作画布 | 既有 Scene DOM 协调/局部绘画 Canvas | 草稿、画布几何、编辑布局变化 |
| 创作工具属性 | 只在上下文依赖变化时重建 | 工具、选中对象、属性真正变化 |
| AI 设置 | 模型连接子面板 | 切换设置类别 |

所有图片派生分辨率、颜色还原、mask 映射、COS 存取、操作历史、Scene v2 结构和同步队列保持原样。改造针对的是 UI 更新与资源生命周期，而非用户数据迁移。

### 待演进的接口

推荐将 `app.js` 中逐渐抽离成：

```js
// React/Vue 或原生 DOM 都消费同一份 UI 事件与状态，而非直接依赖浏览器元素
dispatch({type:'material/update', id, changes});
component.patch({changedIDs: new Set([id])});
component.dispose();
```

下一阶段可让 Scene 操作直接携带 changedIDs，降低全 Scene HTML 计算量；将其他弹窗和列表逐步接入同一生命周期；可引入每种组件各自的轻量 `mount/patch/dispose` 适配器。不要为了全部“局部化”而取消初次进入页面、路由切换、恢复存档等必须执行的完整挂载。

### 回归测试和性能验收

- `npm test` 包含 `tests/ui-render-regression.test.js`：身份保持、节点复用、空列表切换、进度按钮、纸张/编辑模型区等。
- `npm run test:incremental-browser`：在真实 Chromium 验证不同视口下照片和 Canvas 的 DOM/像素保持、图层子树身份。
- 现有 `test:browser`、`test:responsive-browser`、`test:editor-browser`、`test:interaction-browser`、`test:cutout-browser` 仍应通过；Safari + Apple Pencil 需实际设备验收。
- 性能比较应分别采集 DOM 节点创建/移除数、图片 `src` 变化和解码数、帧时间、输入焦点、滚动与原生 dialog 状态。

**关于兼容性**：当前仍允许安全的全量回退，不改变业务语义。迁移到 React/Vue 时可以只替换 Projection/Reconciliation/组件宿主，保留 Scene、识别、存储和命令协议。
