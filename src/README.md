# 前端与共享内核

`src/` 同时放浏览器页面和服务器复用的纯 Scene 代码。改动前先按职责找入口：

| 需要修改 | 首选入口 |
| --- | --- |
| 页面、路由和交互 | `react-routes.jsx`、`page-controllers/`、`app.js` |
| 手动画布与导出 | `fabric-scene-stage.jsx`、`scene-*.js`、`creation-transaction.js` |
| 素材识别与纸张校正 | `recognition-*.js`、`paper-*.js`、`material-*.js` |
| 数据、缓存与同步 | `store.js`、`cloud-store.js`、`project-sync.js` |
| AI 创作的共享命令和客户端接入 | `creation-agent-session.js`、`creation-command-spec.js`、`background-creation-session.js` |
| 字体与静态数据 | `assets/`、`data/` |

服务器 Agent 的流程、Skill 和可执行方法在 [`creative-agent/`](../creative-agent/README.md)。`generated/` 由构建命令生成；`data-migrations/` 只供用户主动转换旧数据使用。不要把新业务状态塞回 `app.js`，也不要在这里复制另一套 Agent 方法库。
