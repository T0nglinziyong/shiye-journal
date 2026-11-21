# 拾页页面控制器 / Action-State 迁移约定

## 当前架构

原生 JavaScript 继续作为拾页生产 UI；Scene v2、COS/云端和识别 Worker 的协议与算法不变。本轮提供框架中立的界面边界，方便未来替换为 React/Vue：

```
Domain operations / IndexedDB / Scene v2
          ↕ commands + changed records
createActionStore(state) — dispatch / subscribe / revision / scoped events
          ↓
PageControllerHost — render / patch / mount / dispose
          ↓
Page projection modules — renderLibraryHTML / renderWorksHTML / ...
          ↓
Native DOM + Canvas/SVG + keyed reconciliation
```

## 页面边界

- `src/page-controllers/library-{controller,view}.js`：素材列表渲染、搜索/过滤 Action、收藏的持久化命令。
- `src/page-controllers/works-{controller,view}.js`：作品列表增量投影、卡片与封面生命周期、作品过滤 Action。
- `src/page-controllers/import-{controller,view}.js`：照片/识别增量投影、候选和确认状态 Action、手动框与校正资源。
- `src/page-controllers/editor-{controller,view}.js`：可编辑 Scene 页面宿主，Undo/Redo Action，保留现有 Pointer/Canvas 渲染。
- `src/page-controllers/settings-{controller,view}.js`：AI 服务商与类别 Action、设置视图投影。
- 其他已有页面通过 `createStandardController` 接入同一个宿主协议；后续按需迁移具体业务操作。

页面宿主 `src/page-controller-host.js` 在路由 / 必须全量重建时释放旧 `ComponentLifetime`，新的 mount 只执行一次。每个页面实现：

```js
const controller={
  render: ()=>html,       // 同一业务状态的纯视图投影
  patch: ()=>true,        // 更新现有 DOM；不可安全局部更新则返回 false
  mount: lifetime=>{},    // 一次性注册事件和订阅
  dispose: ()=>{}         // 可选；订阅和监听器尽量交给 lifetime
};
```

## Action/State 和持久化职责

`src/ui-action-store.js` 是无 DOM 依赖的 Action 命令入口。新操作通过注册的 domain handler 更新状态，再以 `scope + keys + ids + revision` 通知对应已挂载控制器：

```js
store.register('library/filter',({key,value})=>({
  changes:{[key]:value},scope:'library'
}));
store.dispatch({type:'library/filter',payload:{key:'query',value:'spring'}});
```

副作用型操作（数据库事务等）应该 **先确认写入成功，再修改权威状态并发布变化**，避免失败后 UI 错误显示为已保存。只有控制器订阅变化并调用对应局部投影；数据库和算法模块不导入 DOM。

`legacy/action` 是现有稳定的业务处理兼容入口：尚未迁移的复杂创作/导入/同步操作仍由原有函数执行。**这意味着当前尚不是“所有存量操作都已经彻底无 DOM 依赖”的状态。** 新功能不应继续扩充大 switch，应在所属控制器注册 Action。

同步集合刷新现在发布 `collections/updated`；只有 UI 的订阅器决定何时渲染或保持后台延迟。用户路由切换发布 `route/change`，用于将来的日志、测试和外层框架路由适配。

## 组件生命周期

统一使用 `ComponentLifetime`，通过 `use` 托管 dispose，用 `on` 托管事件，用 `resize`、`frame`、`timer` 托管异步 UI 资源。页面控制器负责释放 work cover observers、编辑器 viewport/Pencil 监听器以及导入纸张/手动框实例。禁止把运行中的 Canvas、图像解码或局部弹窗交给全量投影无故替换。

React/Vue 迁移路线：组件 `mount` 转成 useEffect / onMounted；`dispose` 转 cleanup / onUnmounted；视图 HTML 投影逐步替换为 JSX/模板；state/commands/Scene/storage 不随之改写。

## 验证与后续工作

`npm test` 运行 Action/State、页面控制器生命周期和纯投影测试。`npm run test:browser`、`npm run test:editor-browser`、`npm run test:incremental-browser` 仍用于实际 DOM、Pencil、图层和跨屏验收。

后续逐步迁移 `legacy/action` 中的完整导入事务、生成流程、跨设备冲突交互；尤其不能为了减少 `app.js` 行数而让数据库写入顺序、Undo 或用户资料回滚方式发生变化。只读测试/发布之前需要实际浏览器检查。
