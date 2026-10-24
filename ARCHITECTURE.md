# 拾页网页端：扩展边界

本说明记录 `test` 作为独立 PWA 的扩展边界。新功能须遵守当前数据格式与已保存资料的合同，避免把分支继续写进 `src/app.js`。

| 能力 | 单一选择入口 | 执行与数据合同 | 回归测试 |
| --- | --- | --- | --- |
| 素材识别 | `src/recognition-profiles.js` 的候选发现与 Mask 分割两个独立设置 | 默认 `unified + auto`：`paper-analysis.js` 整合旧版连通区域、物理载体和受约束的漏检补全，只在整页阶段决定素材身份；`material-unified-segmentation.js` 在每个候选内共享梯度证据，仲裁实际轮廓、规则形状和透明 Mask。选择 `legacy + morphgac` 可恢复原版候选与原版分割路径；其他显式组合各按所选算法运行。导入页保留一次识别的基础 Mask 和 900 px 分析帧，合并共同载体、形状规整与重复孔洞开关复用这些中间结果；明确关闭“合并共同载体”时才尝试把同一浅色载体上的独立印刷区域分件。形状和孔洞后处理只调整当前素材边界。`src/image.js` 最终回到高清原图裁切。实测口径和局限见 [识别研究集成](docs/recognition-research-integration.md)。 | `tests/recognition-profiles.test.js`、`tests/unified-material-discovery.test.js`、`tests/recognition-stage-reuse-browser.mjs`、`tests/recognition-settings-browser.mjs`、`tests/recognition-browser.mjs`、`tests/import-browser-acceptance.mjs` |
| AI 创作 | `src/creative-delivery.js` 的响应协议 | `src/creative-runner.js` 控制轮次；`src/creative-contract.js` 验证合同；`src/creative.js` 执行可编辑工具。原生工具、JSON 工具和直接页都要转换为同一工具调用格式 | `tests/creative-delivery.test.js`、`tests/runner.test.js`、`tests/matching-browser.mjs` |
| 数据位置 | `src/storage-router.js` 的 CRUD 路由 | `src/store.js` 保持公开的 `all/get/transaction` 和备份合同；云端特有的后台暂存、缩略图和增量同步留在 `src/cloud-store.js`，自托管请求留在 `src/store.js`，本机 IndexedDB 用同一表名 | `tests/storage-router.test.js`、`tests/cloud-store.test.js`、`tests/server-persistence.test.js`、`tests/cloud-cache-browser.mjs` |
| 页面组件 | `src/react-routes.jsx` 的 React 路由组件 | 页面及最近删除列表由 React 渲染，仍使用原 `trash` 表；`src/app.js` 负责业务编排和路由 | `tests/react-route-smoke.mjs`、`tests/trash-offline-browser.mjs`、`tests/library-canvas-latest-browser.mjs` |
| 素材库选择 | `src/library-selection-model.js` 的选择模式 | 系列详情与全部素材共享一份 `parity` 选择状态；结束模式后必须同步并卸载底部栏。卡片短按和长按由 `src/react-routes.jsx` 的 `PressCard` 统一判定 | `tests/library-selection.test.js`、`tests/library-selection-browser.mjs`、`tests/library-canvas-latest-browser.mjs` |
| 创作画布 | `src/react-routes.jsx` 的 `EditorPage` 与 `src/fabric-scene-stage.jsx` | React 管工具栏及页面生命周期；Fabric 管可编辑对象与选择；Scene v2 是唯一持久作品数据；笔迹由独立压力路径模块采样并存为 Scene 矢量笔迹。`src/scene-renderer.js` 以 Canvas 2D 合成封面和 PNG，PDF 使用同一合成图。编辑画布和导出共用纸张绘制、字体、素材遮罩及显示片段投影 | `tests/fabric-editor-product-browser.mjs`、`tests/fabric-stage-browser.mjs`、`tests/editor-layout-browser.mjs` |
| 云端续传 | `src/project-sync.js` 的账号隔离持久队列 | `src/sync-resumer.js` 在重新打开、回前台与恢复网络时重试；`cloud-store.js` 通过 `shiye_commit_v3` 让服务端按记录核对原始编辑基线，账号修订号只作读取游标。已识别的作品正文冲突保留另一编辑版本，云端确认才移出队列。非作品字段级合并、旧写入闸门与完整故障矩阵仍待完成 | `tests/project-sync.test.js`、`tests/sync-resumer.test.js`、`tests/cloud-store.test.js`、`tests/sql/record-cas-v3.assert.sql` |

同步详情的诊断由 `src/sync-diagnostics.js` 记录当天的阶段、修订号、数量和经过分类的错误，保留在本机并可导出；不写入云端，也不包含待同步记录的原始字节。它不是应急备份。

## 操作与刷新优先级

选择模式只由 `selectionMode` 表示；不存在可与它分叉的第二个布尔标记。`src/library-selection-model.js` 负责开始、结束、跨页范围与远端删除后的选中 ID 清理；`src/react-routes.jsx` 的选择组件响应同一状态变化，更新当前页底栏。系列首页允许带着素材选择进入系列详情，因此系列栏与素材栏可以同时挂载，但只能有一条显示。切页前先决定选择范围，再渲染目标页。设置只是临时覆盖层，不结束选择。

| 操作 | 必须改变 | 不应改变 | 页面更新 |
| --- | --- | --- | --- |
| 选择 / 完成 | 当前模式、选中 ID、仅看所选；完成时一并清空 | 资料记录、排序、搜索、当前路线 | 同步顶部按钮、卡片标记及所有底栏，不重建整页 |
| 点选卡片 / 查看所选 | 选中集合或所选结果区 | 原始素材卡片与图片节点、其它页面模式 | 只更新卡片与结果区 |
| 系列 ↔ 全部素材 | 目标路线、必要时筛选范围 | 正在进行的素材选择及其 ID | 目标页一次渲染，底栏由模式重建 |
| 离开素材 / 系列或离开作品 | 清空不再适用的选择模式 | 已保存记录和设置 | 目标页一次渲染 |
| 云端增量 | 本机记录缓存、失效图像、已删除的选中 ID | 正在进行的点选、输入、弹窗、画布手势 | 被动页面空闲时合并一次刷新；不可打断的页面等下次导航 |
| 素材 / 作品入口 | 导入模式与路线，直接调起图库 | 云端数据与上次未提交的私人照片 | 空导入页先可见，图库取消后仍可选择相机或文件 |
| 首次点画布对象 | 仅在松手且未移动时选中 | 画布坐标、对象几何与撤销历史 | 更新单一选框；拖动未选对象优先平移画布 |

后台刷新按 `src/view-update-policy.js` 决策：认证和持久化数据先于视觉重绘；用户手势、选择、弹窗和输入先于后台重绘。后台数据不会因此丢弃，下一安全时机或切页会使用新数据。导入手动框与原图裁切统一使用纸张相对坐标，`src/import-coordinate.js` 将其映射到响应式照片容器；容器改变时重新定位。

## 加一个实现时

1. 候选发现与 Mask 分割分别登记 ID 和显示名，不得直接覆盖原图或把 OpenCV 运行库放入首屏包。候选仍须经尺寸、轮廓、透明遮罩校验和人工确认。新算法用同一批真实照片和独立真值合成场景比较漏检、误检、边缘与耗时；保留 `legacy + morphgac` 的旧路径供用户回退。
2. 创作服务商的输出若不同，在协议层转成统一工具调用；工具语义和直接页合同只在各自合同/执行模块扩充。模型输出必须先验证，失败不修改画布；成功步骤仍可保存，流式进度与取消路径不得被新格式堵塞。
3. 新数据源实现 `all(name)`、`get(name,id)`、`transaction(names, callback)` 后接入路由；若有后台暂存、增量拉取、图像缓存等能力，单独实现并显式接入相应入口，不要让 CRUD 在失败时静默回退到浏览器资料。六表名称、完整备份格式、账号隔离与清除规则不能被缓存或传输优化改变。
4. UI 新模块优先接受所需的状态和回调，不直接复制第二份资料库。把可纯函数验证的 HTML/状态转换与 DOM 事件分开；浏览器脚本用隔离合成数据和几何断言，截图供人工核对。

## 验收与现有边界

每批修改先运行 `npm test && npm run test:ui`，再按触及的能力跑对应浏览器脚本，至少覆盖手机、iPad 横竖与桌面 Chromium 视口。模拟视口不等于实体 Safari／Pencil。发布前必须用准确的暂存快照重复测试，检查私有文件、凭据、远端新提交及固定 CloudBase 测试项目的 Git 自动部署。

素材识别必须遵循“整页候选先于边界分割”：所选候选发现算法决定初始实体；MorphGAC、统一轮廓、GrabCut、形状规整和打孔恢复只能修改各自候选内的透明边界。唯一明确的人工例外是关闭“合并共同载体”时，从已识别的载体 Mask 中分离独立印刷区域；切换回合并时恢复同一基础 Mask，不重跑整页识别。内部印刷格子、文字框和人物细节不得仅因自身闭合而在默认设置下成为新素材。

目前 `src/app.js` 保留跨页业务编排；素材、系列、搭配、作品、导入、登录、账号、设置、弹窗及抠图控制面板由 React 持有。创作画布只有 Fabric 这一套运行中的编辑引擎。Fabric 对 `<canvas>` 的原生绘制与事件处理是像素引擎边界，不应由 React 重绘每次笔迹。非画布路径不得恢复旧 HTML 页面渲染，也不得直接增删或替换 React 子节点；图片加载后的封面由 React 原位更新，缩略图测量仅调整尺寸样式。识别质量与云存储的生产迁移须用真实案例验证，不能从界面迁移本身推断已经实现。

素材从库中删除后，素材记录以 `isProjectInternal` 隐藏保留，供已有作品解析；最近删除可恢复原可见记录。清空最近删除只清除恢复入口，不删除隐藏素材记录。当前浏览器不会自动清扫隐藏素材元数据；云端收到旧队列中的素材删除请求时，会检查完整作品和最近删除中的作品引用，被引用的素材仍保留为隐藏记录。COS 原图仅由服务端受保护定时任务在完整引用扫描、私有隔离备份与延迟复核后回收；浏览器不得直接删除。详见 [服务端孤立图片清理](docs/cos-orphan-gc.md)。
