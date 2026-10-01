# 整改实际验收（2026-10-01）

本文件记录实际运行，非计划。更多未验收项见根目录 `03_TASK_BOARD.md`。

| 阶段 | 命令 / 环境 | 结果 |
|---|---|---|
| 起点 | `npm test` | 242/242，退出码 0 |
| 起点 | `npm run test:ui` | build/UI smoke/route parity/自托管 smoke 通过，退出码 0 |
| 第一批局部 | `node --test tests/remediation-editor.test.js` | 3/3，退出码 0 |
| 第一批局部 | `node --test tests/remediation-import.test.js` | 3/3，退出码 0 |
| 第一批局部 | `node --test tests/remediation-constraints.test.js` | 4/4，退出码 0 |
| 第一批局部 | `node --test tests/remediation-sw.test.js` | 1/1，退出码 0 |
| 第一批集成 | `npm test` | 255/255，退出码 0；旧配置测试预期随有效轮次上限更新，未删除测试 |
| 第一批集成 | `npm run test:ui` | build/UI smoke/route parity/自托管 smoke 通过，退出码 0 |
| 真实浏览器 | `agent-browser` 打开 Vite `http://localhost:5192/` | 首页有实际内容，无 JS console error；截图 `/tmp/shiye-remediation-start.png` |
| 编辑器浏览器 | `SHIYE_TEST_URL=http://localhost:5192 npm run test:editor-browser` | 88 张截屏流程通过，退出码 0；日志 `/tmp/shiye-editor-acceptance`；`390x844-selected-text.png` 目视正文无重复 |

上面的浏览器运行在桌面 Chromium 中，模拟不同视口；它**不是**实体手机或 iPad 验收。未使用真实账号/私人素材；尚未运行在线 AI、双标签共享 IDB、隔离数据库 CAS、完整工程包往返。保留有意留白、叠压、半藏与出血，不以固定占页率、最低图层数或零重叠判成败。
