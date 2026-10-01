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
| 同步增量 | `node --test tests/cloud-store.test.js tests/project-sync.test.js` | 42/42，退出码 0；覆盖跨实例待传摘要与首次读取失败重试 |
| 第一批固定项目 Git 部署 | Vercel 控制台 `shiye-journal-test` Production Deployment | `6bd1c194e2ae7c163d9af87dc87c4737e818393e`，Git `main`，状态 Ready，固定域名 `shiye-journal-test.vercel.app` |
| 第二批局部 | `node --test tests/remediation-editor.test.js` | 4/4，退出码 0；R-02 选区跨段落样式更新保持 |
| 第二批同步 | `node --test tests/cloud-store.test.js tests/project-sync.test.js` | 42/42，退出码 0；出站读取错误同会话重试、共享待传数不等待网络 |
| 第二批集成 | `npm test` | 258/258，退出码 0 |
| 第二批集成 | `npm run test:ui` | 构建/UI smoke/route parity/自托管 smoke 通过，退出码 0 |
| 第二批编辑器浏览器 | `SHIYE_TEST_URL=http://localhost:5192 npm run test:editor-browser` | 88 张截屏流程通过，退出码 0，首个可用画面 325 ms |
| 第二批固定项目 Git 部署 | Vercel 控制台 `shiye-journal-test` Production Deployment | `87017ea6b4e12968ec7ea933082ea4cc423d72e2`，Git `main`，状态 Ready，固定域名未变；无手动部署 |
| 第三批局部 | `node --test tests/offline-task-store.test.js tests/offline-creation.test.js tests/remediation-import.test.js` | 19/19，退出码 0；导出快照、账号隔离、任务 ZIP 登记、结果篡改/降级拦截、旧包不回退 |
| 第三批集成 | `npm test` | 261/261，退出码 0 |
| 第三批集成 | `npm run test:ui` | 构建/UI smoke/route parity/自托管 smoke 通过，退出码 0 |
| 第三批真实浏览器 | `SHIYE_TEST_URL=http://localhost:5192 node tests/offline-handoff-browser.mjs` | 四种视口的网页 AI 交接、预览压缩及旧包导入流程通过，退出码 0；本机截图 `/tmp/shiye-offline-handoff`。1200px 合成图从 3,439,121 B 降至 461,677 B、宽 384px；不代表真实用户素材画质验收。 |
| 第三批固定项目 Git 部署 | Vercel 控制台 `shiye-journal-test` Production Deployment | `0c20712516c47e71f19a9f8171cdbd1c26b10a26`，Git `main`，状态 Ready，固定域名未变；无手动部署 |
| 第四批合同局部 | `node --test tests/remediation-contract.test.js tests/offline-creation.test.js tests/remediation-import.test.js` | 20/20，退出码 0；O-07/O-08 合成语料通过 |
| 第四批集成 | `npm test` | 264/264，退出码 0；旧安全测试改为拒绝未知事件字段，另增脚本样文本的转义验证，未删测试 |
| 第四批集成 | `npm run test:ui` | build/UI smoke/route parity/自托管 smoke 通过，退出码 0；真实设备和云账号未测 |
| 第四批编辑器浏览器 | `SHIYE_TEST_URL=http://localhost:5192 npm run test:editor-browser` | 88 张截屏流程通过，退出码 0，首个可用画面 322 ms；是桌面 Chromium 模拟视口，非实体设备 |
| 第四批固定项目 Git 部署 | Vercel 控制台 `shiye-journal-test` Production Deployment | `dce105389e0a65a69dbff0b52ada1b69a688e197`，Git `main`，状态 Ready，当前域名 `shiye-journal-test.vercel.app`；无手动部署 |
| 第五批数据安全局部 | `node --test tests/remediation-import.test.js tests/project-sync.test.js tests/cloud-store.test.js` | 53/53，退出码 0；D-01–D-04 及连续编辑/工程元数据合成时序通过，未用真实私人稿 |
| 第五批数据安全集成 | `npm test` | 270/270，退出码 0；真实多标签及隔离数据库条件提交未验 |
| 第五批数据安全集成 | `npm run test:ui` | build/UI smoke/route parity/自托管 smoke 通过，退出码 0 |
| 第五批编辑器浏览器 | `SHIYE_TEST_URL=http://localhost:5192 npm run test:editor-browser` | 88 张截屏流程通过，退出码 0，首个可用画面 309 ms；非实体设备 |
| 线上只读边界核对 | Supabase 现有项目函数元信息 | `shiye_commit_v2` 为 invoker 函数，携带 operation_id 幂等和 expected_revision；底层 `shiye_commit` 对账号 revision 行加锁并检查期望值。未更改线上表或写入用户资料，不能代替文档级 CAS 实测。 |
| 第五批固定项目 Git 部署 | Vercel 控制台 `shiye-journal-test` Production Deployment | `7aae34280be0e8fc30c37d22a92c6a51d68d6c3a`，Git `main`，状态 Ready，固定域名 `shiye-journal-test.vercel.app`；无手动部署 |
| 第六批导入验收局部 | `node --test tests/offline-creation.test.js tests/remediation-import.test.js` | 20/20，退出码 0；外部结果伪造已验预览字段不会把导入作品标成已验，真实像素/阅读未核对 |
| 第六批集成 | `npm test` | 271/271，退出码 0 |
| 第六批集成 | `npm run test:ui` | build/UI smoke/route parity/自托管 smoke 通过，退出码 0；构建存在原有大模块提示 |
| 第六批真实浏览器 | `SHIYE_TEST_URL=http://localhost:5192 node tests/offline-handoff-browser.mjs` | 四种模拟视口的网页 AI 交接流程通过，退出码 0；预览合成图 3,439,121 B → 461,677 B。非真人素材视觉验收或实体 iPad。 |
| 第六批固定项目 Git 部署 | Vercel 控制台 `shiye-journal-test` Production Deployment | `1d00bb7f2137a77a83bd25bfdfd85ffef2cb3e37`，Git `main`，状态 Ready，固定域名未变；无手动部署 |
| 第七批任务指纹局部 | `node --test tests/offline-creation.test.js tests/offline-task-store.test.js tests/remediation-import.test.js` | 22/22，退出码 0；O-11 合成字节逐件 SHA-256 与篡改拒绝。未验证原始高清图资源版本或 AI 是否实际看过预览。 |
| 第七批集成 | `npm test` | 272/272，退出码 0 |
| 第七批集成 | `npm run test:ui` | build/UI smoke/route parity/自托管 smoke 通过，退出码 0；构建仍有原有大模块提示 |
| 第七批真实浏览器 | `SHIYE_TEST_URL=http://localhost:5192 node tests/offline-handoff-browser.mjs` | 四种模拟视口的网页 AI 交接流程通过，退出码 0；预览合成图 3,439,121 B → 461,677 B。非真人素材视觉验收或实体 iPad。 |
| 第七批固定项目 Git 部署 | Vercel 控制台 `shiye-journal-test` Production Deployment | `5012bc0a5aed93e432ff495a33ef216666377798`，Git `main`，状态 Ready，固定域名未变；无手动部署 |
| 第八批字体决策局部 | `node --test tests/editor-tools.test.js tests/remediation-editor.test.js` | 16/16，退出码 0；R-08 仅字体族选择共享，非字体文件/行高/像素完整一致性验收 |
| 第八批编辑器浏览器 | `SHIYE_TEST_URL=http://localhost:5192 npm run test:editor-browser` | 88 张模拟视口截屏通过，退出码 0，首个可用画面 307 ms；非实体设备 |
| 第八批集成 | `npm test` | 273/273，退出码 0 |
| 第八批集成 | `npm run test:ui` | build/UI smoke/route parity/自托管 smoke 通过，退出码 0；原有大模块提示仍在 |

上面的浏览器运行在桌面 Chromium 中，模拟不同视口；它**不是**实体手机或 iPad 验收。未使用真实账号/私人素材；尚未运行在线 AI、双标签共享 IDB、隔离数据库 CAS、完整工程包往返。保留有意留白、叠压、半藏与出血，不以固定占页率、最低图层数或零重叠判成败。
