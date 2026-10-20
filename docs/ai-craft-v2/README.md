# AI 素材创意加工系统

本目录只记录当前实现，不保留阶段性兼容说明或历史迁移方案。

## 当前协议

- GPT 任务包只使用 compact 目录：`START_HERE.txt`、`task/`、`schema/`、`examples/`、`materials/`、`runtime/`；不再发送案例参考图。
- 任务必须具有当前 `taskHash`、`schemaHash`、`sourceSnapshots`、`baseSceneHash` 和 `taskBinding=local`。
- Craft Plan 只有当前一个合同：`shiye-craft-plan` version 2。
- material relation 只使用 `peek`、`underlay`、`bridge`；不接受旧 relation 名称。
- 工艺操作包括 whole、crop、trim、tape、mask、diagonal、window、edge，以及当前拓扑工艺；看图选区只作为本次计划的 observation，不写回素材。
- 物理素材按毫米尺寸、来源快照、库存与源区域账本核验；隐藏、透明和移出画布不释放库存。

## 多模态单次交付

主路径是一次导出、一次最终交付、一次导入。GPT 可以在内部完成：查看素材预览、提出 observation、选择取材和工艺、运行校验/同源预览、返回最终可编辑项目。

## 关键模块

- `src/creative-contract.js`：当前唯一工具与页面合同。
- `src/craft-plan-contract.js`：当前原子 Craft Plan。
- `src/creative.js`：合同执行与原子回滚。
- `src/material-anatomy.js`：素材来源版本与任务快照身份；不再保存用户预标注区域。
- `src/craft-topology.js`：布尔几何与源区域运算。
- `src/craft-geometry.js`：确定性边缘加工与面积核验。
- `src/craft-relations.js`：peek / underlay / bridge。
- `src/craft-display.js`：单实体多显示片段与两孔穿插。
- `src/scene-renderer.js`：应用与便携任务包共用 Canvas 渲染。
- `src/offline-creation.js`：compact 任务包导出、导入与校验。
- `src/offline-runtime-entry.mjs`：离线 validate / preview / pack 入口。

## 不变量

- 不为了审美指标强制裁剪固定数量的素材。
- 不把数字遮罩伪装成真实裁切。
- 不拉伸真实纸条或贴纸来满足关系。
- 不覆盖生成开始前的用户手改。
- 不把模型 observation 冒充用户确认。
- 不为旧包、旧字段、旧设置或旧 relation 增加回退解析。
- 网络重试、事务恢复、浏览器降级和同步冲突处理属于鲁棒性，不属于旧版本兼容。

## 验证

合并前必须通过 `npm run build`、`npm test`、`npm run test:ui` 与 `.github/workflows/craft-browser.yml`。Chromium 回归使用合成数据，只证明实现与交互链路，不等于实体 iPad Safari、Apple Pencil 或真实付费模型审美验收。
