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
| 第八批固定项目 Git 部署 | Vercel 控制台 `shiye-journal-test` Production Deployment | `2cee5fe1f3363a113680a195cec80f98dd3c463a`，Git `main`，状态 Ready，固定域名未变；无手动部署 |
| 第九批账号历史局部 | `node --test tests/remediation-editor.test.js tests/cloud-store.test.js` | 40/40，退出码 0；E-01 同 ID 跨账号历史隔离合成回归通过 |
| 第九批编辑器浏览器 | `SHIYE_TEST_URL=http://localhost:5192 npm run test:editor-browser` | 88 张模拟视口截屏通过，退出码 0，首个可用画面 298 ms；未执行真实双账号切换 |
| 第九批集成 | `npm test` | 274/274，退出码 0 |
| 第九批集成 | `npm run test:ui` | build/UI smoke/route parity/自托管 smoke 通过，退出码 0 |
| 第九批固定项目 Git 部署 | Vercel 控制台 `shiye-journal-test` Production Deployment | `1cdedeef404271c1b4406b58c0e6f6e7df7ec70f`，Git `main`，状态 Ready，固定域名未变；无手动部署 |
| 第十批可编辑包局部 | `node --test tests/remediation-import.test.js tests/offline-creation.test.js tests/offline-task-store.test.js` | 23/23，退出码 0；O-14/O-16 仅清单字节自洽、错误预览保留草稿，非独立视觉渲染 |
| 第十批集成 | `npm test` | 275/275，退出码 0 |
| 第十批集成 | `npm run test:ui` | build/UI smoke/route parity/自托管 smoke 通过，退出码 0 |
| 第十批真实浏览器 | `SHIYE_TEST_URL=http://localhost:5192 node tests/offline-handoff-browser.mjs` | 四种模拟视口交接流程通过，退出码 0；未在浏览器中对外部真实预览做像素比较 |
| 第十批固定项目 Git 部署 | Vercel 控制台 `shiye-journal-test` Production Deployment | `2f5ab5101ed7ea2c55dd6630c31e783013900981`，Git `main`，状态 Ready，固定域名未变；无手动部署 |
| 第十一批离线校验局部 | `node --test tests/offline-runtime.test.js tests/offline-creation.test.js` | 15/15，退出码 0；任务 ZIP 中 Node 脚本在无 `node_modules`、无云凭据环境完成结构/物理约束验证，篡改结果失败；不含视觉渲染或阅读验收 |
| 第十一批集成 | `npm test` | 276/276，退出码 0 |
| 第十一批集成 | `npm run test:ui` | build/UI smoke/route parity/自托管 smoke 通过，退出码 0；构建保留原有大模块提示 |
| 第十一批真实浏览器 | `SHIYE_TEST_URL=http://localhost:5192 node tests/offline-handoff-browser.mjs` | 四种模拟视口交接流程通过，退出码 0；合成预览图 3,439,121 B → 461,677 B；非实体设备及真实素材验收 |
| 第十一批 Git 部署 | Vercel Git `main` | `42381098866df5d2be530feb95a903b3c4b32a26` 构建失败：`.vercelignore` 漏放 `scripts/build-offline-runtime.mjs`，线上维持上一 Ready 版本；未冒充发布成功 |
| 第十二批发布修复局部 | `node --test tests/vercel-build-inputs.test.js` | 1/1，退出码 0；核对 `npm run build` 的所有 Node 脚本均在 Vercel 上传白名单 |
| 第十二批集成 | `npm test` | 277/277，退出码 0 |
| 第十二批集成 | `npm run test:ui` | build/UI smoke/route parity/自托管 smoke 通过，退出码 0；待 Git 自动部署复核 |
| 第十二批固定项目 Git 部署 | Vercel 控制台 `shiye-journal-test` Production Deployment | `4260b371adb8e8be1803bd380d16a8b6b10ff1af`，Git `main`，状态 Ready，固定域名 `shiye-journal-test.vercel.app`；白名单问题已排除 |
| 第十三批离线校验/打包局部 | `node --test tests/offline-runtime.test.js tests/offline-creation.test.js` | 15/15，退出码 0；独立 Node 运行 validate/pack，打包 ZIP 回导为未核验预览草稿；校验失败不留旧结果。未证明离线网络隔离或视觉一致。 |
| 第十三批集成 | `npm test` | 277/277，退出码 0；一次文案改动触发既有“可下载”断言失败，恢复明确可下载语义后重跑通过，未删测试 |
| 第十三批集成 | `npm run test:ui` | build/UI smoke/route parity/自托管 smoke 通过，退出码 0 |
| 第十三批真实浏览器 | `SHIYE_TEST_URL=http://localhost:5192 node tests/offline-handoff-browser.mjs` | 四种模拟视口交接流程通过，退出码 0；合成预览 3,439,121 B → 461,677 B，非实体设备/真实材料验收 |
| 第十三批固定项目 Git 部署 | Vercel 控制台 `shiye-journal-test` Production Deployment | `1873aea1def3479cf307cc4f470b2a2625035f61`，Git `main`，状态 Ready，固定域名未变；无手动部署 |
| 第十四批内容局部 | `node --test tests/creative-quality.test.js tests/offline-creation.test.js` | 22/22，退出码 0；明显占位语/重复生成文字仅诊断、不改原文；任务包语法例标明非成品。Q-01/Q-02 尚未验收。 |
| 第十四批集成 | `npm test` | 278/278，退出码 0 |
| 第十四批集成 | `npm run test:ui` | build/UI smoke/route parity/自托管 smoke 通过，退出码 0；仍有原有大模块提示 |
| 第十四批固定项目 Git 部署 | Vercel 控制台 `shiye-journal-test` Production Deployment | `dae3c00c255244f505d3a8a72e285c29a132a538`，Git `main`，状态 Ready，固定域名未变；无手动部署 |
| 第十五批纸张参考局部 | `node --test tests/offline-creation.test.js tests/creative-quality.test.js` | 22/22，退出码 0 |
| 第十五批真实浏览器 | `SHIYE_TEST_URL=http://localhost:5192 node tests/offline-handoff-browser.mjs` | 四种模拟视口交接流程及 A5 双页约 296:210、自定 200:200 匿名参考画布比例通过，退出码 0；非真实设备 |
| 第十五批集成 | `npm test` | 278/278，退出码 0 |
| 第十五批集成 | `npm run test:ui` | build/UI smoke/route parity/自托管 smoke 通过，退出码 0；原有大模块提示未解决 |
| 第十五批固定项目 Git 部署 | Vercel 控制台 `shiye-journal-test` Production Deployment | `44dc25a971856be0c160f3cfe4a3b0937ab49a8d`，Git `main`，状态 Ready，固定域名未变；无手动部署 |
| 第十六批组合风格局部 | `node --test tests/offline-creation.test.js` | 14/14，退出码 0；韩系清新＋密集拼贴保持配色，同时版式选项改变区域结构与说明。真人视觉评价仍未做。 |
| 第十六批集成 | `npm test` | 278/278，退出码 0 |
| 第十六批集成 | `npm run test:ui` | build/UI smoke/route parity/自托管 smoke 通过，退出码 0 |
| 第十六批真实浏览器 | `SHIYE_TEST_URL=http://localhost:5192 node tests/offline-handoff-browser.mjs` | 四种模拟视口交接与纸张参考比例通过，退出码 0；非实体设备 |
| 第十六批固定项目 Git 部署 | Vercel 控制台 `shiye-journal-test` Production Deployment | `503f072bdf74b6e2b6a32378fc3138d6bd2ea6db`，Git `main`，状态 Ready，固定域名未变；无手动部署 |
| 第十七批内容边界局部 | `node --test tests/creative-content-brief.test.js tests/matching-session.test.js` | 10/10，退出码 0；搭配页内容策略与原文/事实保存，在线消息、直接生图提示及离线任务包同一边界；未实测在线模型遵守程度 |
| 第十七批集成 | `npm test` | 281/281，退出码 0 |
| 第十七批集成 | `npm run test:ui` | build/UI smoke/route parity/自托管 smoke 通过，退出码 0；保留原有大模块提示 |
| 第十七批真实浏览器 | `SHIYE_TEST_URL=http://localhost:5192 node tests/offline-handoff-browser.mjs` | 四种模拟视口交接通过，退出码 0；非实体设备/真实模型文字质量验收 |
| 第十七批固定项目 Git 部署 | Vercel 控制台 `shiye-journal-test` Production Deployment | `23a7d865aa2ee05b9843bf5d8b23a90edd4b8b4f`，Git `main`，状态 Ready，固定域名未变；无手动部署 |
| 第十八批在线会话局部 | `node --test tests/ai-run-target.test.js tests/runner.test.js` | 8/8，退出码 0；冻结目标 ID、手改时分流候选、取消发生在模型回执后则不执行工具。非真实多标签/网络 barrier 验收 |
| 第十八批集成 | `npm test` | 285/285，退出码 0 |
| 第十八批集成 | `npm run test:ui` | build/UI smoke/route parity/自托管 smoke 通过，退出码 0；保留原有大模块提示 |
| 第十八批真实浏览器 | `SHIYE_TEST_URL=http://localhost:5192 node tests/offline-handoff-browser.mjs` | 四种模拟视口交接通过，退出码 0；未在实体设备进行在线 AI 切稿竞态测试 |
| 第十八批固定项目 Git 部署 | Vercel 控制台 `shiye-journal-test` Production Deployment | `292b5a18adc85686b60721576e82733262902960`，Git `main`，状态 Ready，固定域名未变；无手动部署 |
| 第十九批直接页替换局部 | `node --test tests/creative-replace.test.js tests/runner.test.js tests/catalog-collections.test.js` | 17/17，退出码 0；旧 AI 图层替换、重放不重复笔迹、锁定层保留、失败图层原子回滚。全套首跑 1 个既有断言指出失败后应转待修订，保留原行为并复测通过，未删除断言 |
| 第十九批集成 | `npm test` | 287/287，退出码 0 |
| 第十九批集成 | `npm run test:ui` | build/UI smoke/route parity/自托管 smoke 通过，退出码 0；保留原有大模块提示 |
| 第十九批真实浏览器 | `SHIYE_TEST_URL=http://localhost:5192 node tests/offline-handoff-browser.mjs` | 四种模拟视口交接通过，退出码 0；未对旧无标记笔迹做归属猜测 |
| 第十九批固定项目 Git 部署 | Vercel 控制台 `shiye-journal-test` Production Deployment | `854b26ab0bee2cd58690ecc9a07b421a3e317cb6`，Git `main`，状态 Ready，固定域名未变；无手动部署 |
| 第二十批观察故障局部 | `node --test tests/runner.test.js` | 6/6，退出码 0；故障注入局部预览读取失败，已提交回合仍在后续回合且不重放材料 |
| 第二十批集成 | `npm test` | 288/288，退出码 0 |
| 第二十批集成 | `npm run test:ui` | build/UI smoke/route parity/自托管 smoke 通过，退出码 0 |
| 第二十批真实浏览器 | `SHIYE_TEST_URL=http://localhost:5192 node tests/offline-handoff-browser.mjs` | 四种模拟视口交接通过，退出码 0；未在实体设备做真实模型观察故障注入 |
| 第二十批固定项目 Git 部署 | Vercel 控制台 `shiye-journal-test` Production Deployment | `17d9ca8e052b68308b24202600800891740b64bd`，Git `main`，状态 Ready，固定域名未变；无手动部署 |
| 第二十一批最终渲染局部 | `node --test tests/runner.test.js` | 8/8，退出码 0；最后修改后渲染与 sceneHash 匹配，渲染失败保持未验状态；无独立视觉模型/人工审阅 |
| 第二十一批集成 | `npm test` | 290/290，退出码 0 |
| 第二十一批集成 | `npm run test:ui` | build/UI smoke/route parity/自托管 smoke 通过，退出码 0 |
| 第二十一批真实浏览器 | `SHIYE_TEST_URL=http://localhost:5192 node tests/offline-handoff-browser.mjs` | 四种模拟视口交接通过，退出码 0；非实体设备/真实模型终稿视觉验收 |
| 第二十一批固定项目 Git 部署 | Vercel 控制台 `shiye-journal-test` Production Deployment | `1233ed776e232ccccd42efc08a12e86280aa648e`，Git `main`，状态 Ready，固定域名未变；无手动部署 |
| 第二十二批预算/错误局部 | `node --test tests/chat-transport.test.js tests/runner.test.js tests/ai-settings.test.js` | 19/19，退出码 0；A-10 八轮与三轮、格式修复计费、无进展、A-12 分类脱敏；mock provider，无真实付费调用 |
| 第二十二批集成 | `npm test` | 293/293，退出码 0 |
| 第二十二批集成 | `npm run test:ui` | build/UI smoke/route parity/自托管 smoke 通过，退出码 0 |
| 第二十二批真实 Chromium | `SHIYE_TEST_URL=http://localhost:5192 SHIYE_WAIT_MS=30000 node tests/browser-acceptance.mjs` | 109 个画面、7 种模拟视口、工作流与备份往返通过，退出码 0；首次使用默认 5 秒等待在识别候选渲染处超时，按实际识别耗时改用 30 秒测试等待后通过。非实体 Safari/iPad。 |
| 第二十二批固定项目 Git 部署 | Vercel 控制台 `shiye-journal-test` Production Deployment | `a4885ddad67a43223c0c28ff2133f56ae743cf9c`，Git `main`，状态 Ready，固定域名未变；无手动部署 |
| 第二十三批私密诊断局部 | `node --test tests/ai-diagnostics.test.js` | 3/3，退出码 0；默认导出不含假密钥、正文、图片与异常全文，opt-in 会话仍可删；未使用真实私人内容 |
| 第二十三批集成 | `npm test` / `npm run test:ui` | 296/296；build/UI smoke/route parity/自托管 smoke 通过，均退出码 0 |
| 第二十三批真实 Chromium | `SHIYE_TEST_URL=http://localhost:5192 SHIYE_WAIT_MS=30000 node tests/browser-acceptance.mjs` | 109 个画面、7 种模拟视口、工作流与备份往返通过；此检查不模拟真实在线模型或实体 Safari |
| 第二十三批固定项目 Git 部署 | Vercel 控制台 `shiye-journal-test` Production Deployment | `4e1451a580ccbbbe1a8a8835bd0108fab1105c30`，Git `main`，Ready；固定域名未变，无手动部署 |
| 第二十四批能力表局部 | `node --test tests/creative-delivery.test.js tests/ai-settings.test.js tests/runner.test.js` | 17/17，退出码 0；未知地址/模型 auto 显式拒绝，明确 native/json 保留，图片发送限精确已核对组合或用户明确确认；无付费模型调用 |
| 第二十四批集成/浏览器 | `npm test` / `npm run test:ui` / `SHIYE_TEST_URL=http://localhost:5192 SHIYE_WAIT_MS=30000 node tests/browser-acceptance.mjs` | 298/298；build/UI smoke/route parity/自托管 smoke 通过；真实 Chromium 109 个画面、7 种模拟视口及备份往返通过；无实体设备/真实服务商调用 |
| 第二十四批固定项目 Git 部署 | Vercel 控制台 `shiye-journal-test` Production Deployment | `48cb51ce07e009b7797defabbc6b21ef08af683d`，Git `main`，Ready；固定域名未变，无手动部署 |
| 第二十五批 patch 基线局部 | `node --test tests/scene-patch.test.js tests/runner.test.js` | 13/13，退出码 0；旧 hash 不覆盖手改、合法独立前缀保留而错误后 finish 拒绝、未指明图层保留，在线 runner 仍通过既有多轮回归。非真实并发编辑器验收 |
| 第二十五批集成/浏览器 | `npm test` / `npm run test:ui` / `SHIYE_TEST_URL=http://localhost:5192 SHIYE_WAIT_MS=30000 node tests/browser-acceptance.mjs` | 301/301；build/UI smoke/route parity/自托管 smoke 通过；真实 Chromium 109 个画面、7 种模拟视口及备份往返通过。仍未做实体 Safari/iPad 与在线真实模型测试 |
| 第二十五批固定项目 Git 部署 | Vercel 控制台 `shiye-journal-test` Production Deployment | `cc4dfe9a7a3baf42477d43fc28629a39e334f4e6`，Git `main`，Ready；固定域名未变，无手动部署 |
| 第二十六批导入原子性局部 | `node --test tests/matching-session.test.js` | 9/9，退出码 0；事务故障与并发搭配保存不会产生幽灵方案。没有测试真实 IndexedDB 中断或全部导入入口 |
| 第二十六批集成/浏览器 | `npm test` / `npm run test:ui` / `SHIYE_TEST_URL=http://localhost:5192 SHIYE_WAIT_MS=30000 node tests/browser-acceptance.mjs` | 302/302；build/UI smoke/route parity/自托管 smoke 通过；真实 Chromium 109 个画面、7 种模拟视口及备份往返通过。非实体设备/网络中断验收 |
| 第二十六批固定项目 Git 部署 | Vercel 控制台 `shiye-journal-test` Production Deployment | `171268b96e2d6f84ac8ea0ae565b68d07b7a1653`，Git `main`，Ready；固定域名未变，无手动部署 |
| 第二十七批工程输入局部 | `node --test tests/remediation-import.test.js tests/offline-creation.test.js` | 23/23，退出码 0；纸张 CSS 外链式颜色、文字对齐注入、矢量填充外链、失效图层关系被拒绝；笔迹 ID 重建。无原始私人 ZIP 回归 |
| 第二十七批集成/浏览器 | `npm test` / `npm run test:ui` / `SHIYE_TEST_URL=http://localhost:5192 SHIYE_WAIT_MS=30000 node tests/browser-acceptance.mjs` | 首次全套旧断言要求笔迹 ID 不变而失败；保持新导入生成新 ID 的实现，改为断言笔迹内容相同且 ID 必须不同后重跑 303/303；build/UI smoke/route parity/自托管 smoke 通过；真实 Chromium 109 画面/7 模拟视口与备份往返通过。未删断言、未验实体设备 |
| 第二十七批固定项目 Git 部署 | Vercel 控制台 `shiye-journal-test` Production Deployment | `67ef273962e03f63c28b514e8c9cc7bf075e9ef5`，Git `main`，Ready；固定域名未变，无手动部署 |
| 第二十八批可见性局部 | `node --test tests/remediation-constraints.test.js tests/creative.test.js` | 9/9，退出码 0；纯色高层矩形完全盖住必用素材拒绝，部分叠压、半透明叠压和页边出血允许。不以统一填充率或零重叠评分 |
| 第二十八批集成/浏览器 | `npm test` / `npm run test:ui` / `SHIYE_TEST_URL=http://localhost:5192 SHIYE_WAIT_MS=30000 node tests/browser-acceptance.mjs` | 304/304；build/UI smoke/route parity/自托管 smoke 通过；真实 Chromium 109 画面、7 模拟视口和备份往返通过；复杂图层/透明像素可见性及实体设备未验 |
| 第二十八批固定项目 Git 部署 | Vercel 控制台 `shiye-journal-test` Production Deployment | `1562daf871b8903559d48e808339d23569779b81`，Git `main`，Ready；固定域名未变，无手动部署 |
| 第二十九批离线校验器生成 | `node scripts/build-offline-runtime.mjs` 两次 SHA-256 核对 | 两次一致：`5555b6bf71875c68f1c1d86ba711132dcf241ce9fc8c7a2eb9f9a73947e88c9f`；与第 27–28 批源码同步，仍不提供视觉验收 |
| 第二十九批集成 | `npm test` / `npm run test:ui` | 304/304；构建、UI smoke、7 模拟视口的路由 parity、自托管 smoke 通过；真实移动设备未验 |

能力表依据：[DeepSeek Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/)、[DeepSeek JSON Output](https://api-docs.deepseek.com/guides/json_mode/)、[OpenAI API Reference](https://platform.openai.com/docs/api-reference/chat/create)、[SiliconFlow 多模态输入](https://docs.siliconflow.cn/docs/userguide/capabilities/multimodal-vision)。文档支持不等于本账号模型可用；仍需用户配置实际可访问的模型并做真实请求验收。

上面的浏览器运行在桌面 Chromium 中，模拟不同视口；它**不是**实体手机或 iPad 验收。未使用真实账号/私人素材；尚未运行在线 AI、双标签共享 IDB、隔离数据库 CAS、完整工程包往返。保留有意留白、叠压、半藏与出血，不以固定占页率、最低图层数或零重叠判成败。
