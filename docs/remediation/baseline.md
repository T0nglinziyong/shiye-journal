# 整改基线（2026-10-01）

此记录仅用于定位，不是回退目标。优化包要求的 00、01、02、03 均已阅读；实现以本仓库现状为准。

- 起点：`main` / `f3fb8f0f880736ef6e79966a21fa393321ff7656`；执行 `git fetch origin main` 后 `origin/main` 同一提交。
- 起点工作区已有且不属于本批的修改：`public/cece/collection.json`、`public/cece/shapes.json`、`scripts/prepare_cece.py`、`src/cece-seed.js`、`tests/cece-seed.test.js`，以及未跟踪的 `scripts/sam2_batch.py`。本批不暂存或覆盖它们。
- 基线 `npm test`：242/242 通过，退出码 0。
- 基线 `npm run test:ui`：构建、UI smoke、route parity、自托管 smoke 均通过，退出码 0。构建已有 OpenCV `fs`/`crypto` externalized 和大 chunk 警告。
- 基线不等于功能全部正确；优化包指出的正文重复、会话归属、安全输入及同步时序仍需专项验证。

## 入口映射与合成夹具

| 范围 | 当前入口 | 本批合成回归 |
|---|---|---|
| 正文与画布刷新 | `src/app.js` 的 `renderCanvasObject`、`refreshCanvas` | `tests/remediation-editor.test.js` |
| 历史与导航 | `src/app.js` 的 `checkpoint`、`historyStep`、`route`、打开/新建入口 | `tests/remediation-editor.test.js` |
| 工程导入 | `src/native-project-package.js`、`src/offline-creation.js` | `tests/remediation-import.test.js` |
| 硬约束 | `src/creative.js`、`src/offline-creation.js` | `tests/remediation-constraints.test.js` |
| 本地待传与退出 | `src/project-sync.js`、`src/cloud-store.js`、`src/private-cache.js`、`src/cloud-auth-ui.js` | `tests/private-cache.test.js`（本批增例） |
| SW 升级 | `public/sw.js` | `tests/remediation-sw.test.js` |

浏览器验收采用本地 Vite `http://localhost:5192/` 和合成资料；未上传真实私人作品。截图 `/tmp/shiye-remediation-start.png` 与编辑器日志 `/tmp/shiye-editor-acceptance` 为本机临时证据，不纳入 Git。
