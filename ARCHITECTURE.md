# 拾页网页端：扩展边界

本说明记录现有实现的接缝，不改变 Swift 对照行为、数据格式或已保存资料。不要为了加入一个算法、模型响应格式或存储服务，把分支继续写进 `src/app.js`。

| 能力 | 单一选择入口 | 执行与数据合同 | 回归测试 |
| --- | --- | --- | --- |
| 素材识别 | `src/recognition-profiles.js` 的 `recognitionStrategies` | `src/image.js` 负责分析副本、候选与原图裁切；可选的模型修边器按需加载，入参和回参沿用候选区域结构 | `tests/recognition-profiles.test.js`、`tests/vision-engine.test.js`、`tests/import-browser-acceptance.mjs` |
| AI 创作 | `src/creative-delivery.js` 的响应协议 | `src/creative-runner.js` 控制轮次；`src/creative-contract.js` 验证合同；`src/creative.js` 执行可编辑工具。原生工具、JSON 工具和直接页都要转换为同一工具调用格式 | `tests/creative-delivery.test.js`、`tests/runner.test.js`、`tests/matching-browser.mjs` |
| 数据位置 | `src/storage-router.js` 的 CRUD 路由 | `src/store.js` 保持公开的 `all/get/transaction` 和备份合同；云端特有的后台暂存、缩略图和增量同步留在 `src/cloud-store.js`，自托管请求留在 `src/store.js`，本机 IndexedDB 用同一表名 | `tests/storage-router.test.js`、`tests/cloud-store.test.js`、`tests/server-persistence.test.js`、`tests/cloud-cache-browser.mjs` |
| 页面组件 | `src/app.js` 的页面路由 | 大交互逐步拆出独立 UI/模型模块；最近删除由 `src/recently-deleted-ui.js` 渲染，仍使用原 `trash` 表 | `tests/recently-deleted.test.js`、`tests/library-canvas-latest-browser.mjs` |
| 素材库选择 | `src/library-selection-model.js` 的选择模式 | 系列详情与全部素材共享一份 `parity` 选择状态；结束模式后必须同步并卸载底部栏。卡片短按和长按统一由 `src/long-press.js` 判定 | `tests/library-selection.test.js`、`tests/interaction-controls.test.js`、`tests/library-canvas-latest-browser.mjs` |
| 画布对象操作 | `src/canvas-selection.js` 的可见对象和移动边界 | `src/canvas-selection-ui.js` 负责圈选；`src/canvas-editor-ui.js` 负责唯一单对象选框，两者调用同一移动函数；`src/canvas-viewport.js` 只管适合页面以上的导航缩放。`app.js` 不再注册另一套对象拖动/画笔事件 | `tests/parity-workflows.test.js`、`tests/library-canvas-latest-browser.mjs` |
| 云端续传 | `src/project-sync.js` 的账号隔离持久队列 | `src/sync-resumer.js` 在重新打开、回前台与恢复网络时重试 `cloud-store.js` 的两类待同步队列；冲突不得自动覆盖，云端确认才移出队列 | `tests/project-sync.test.js`、`tests/sync-resumer.test.js`、`tests/cloud-store.test.js` |

## 加一个实现时

1. 识别策略只在注册表里增加 ID、显示名、分析尺寸和可选的懒加载修边器；不得直接覆盖原图或把模型运行库放入首屏包。候选仍须经现有的尺寸、轮廓、遮罩校验和人工确认。若更换自动找框方法，应先把候选提案接口抽出来，再以同一真实照片和合成极端案例比较漏检、误检、边缘与耗时。
2. 创作服务商的输出若不同，在协议层转成统一工具调用；工具语义和直接页合同只在各自合同/执行模块扩充。模型输出必须先验证，失败不修改画布；成功步骤仍可保存，流式进度与取消路径不得被新格式堵塞。
3. 新数据源实现 `all(name)`、`get(name,id)`、`transaction(names, callback)` 后接入路由；若有后台暂存、增量拉取、图像缓存等能力，单独实现并显式接入相应入口，不要让 CRUD 在失败时静默回退到浏览器资料。六表名称、完整备份格式、账号隔离与清除规则不能被缓存或传输优化改变。
4. UI 新模块优先接受所需的状态和回调，不直接复制第二份资料库。把可纯函数验证的 HTML/状态转换与 DOM 事件分开；浏览器脚本用隔离合成数据和几何断言，截图供人工核对。

## 验收与现有边界

每批修改先运行 `npm test && npm run test:ui`，再按触及的能力跑对应浏览器脚本，至少覆盖手机、iPad 横竖与桌面 Chromium 视口。模拟视口不等于实体 Safari／Pencil。发布前必须用准确的暂存快照重复测试，检查私有文件、凭据、远端新提交及固定 Vercel 项目的 Git 自动部署。

目前 `src/app.js` 仍集中保留跨页编排和部分事件分发，样式也有历史叠层。后续应在有同等端到端测试覆盖时按页面逐段迁出；不要仅为了减少文件长度而大面积搬运状态机或改写 CSS 优先级。识别质量、Swift 全等价和不同云存储的生产迁移仍须分别用真实案例验证，不能从模块化本身推断已经实现。
