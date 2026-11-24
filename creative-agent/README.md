# 创作 Agent

这里集中维护后台创作的运行逻辑、可执行方法和教程。修改方法或 Skill 时，从本目录查找，不再分别翻 `compute-server/harness`、`creation-skills` 和 `src/creation-library`。

| 目录 | 负责内容 | 主要入口 |
| --- | --- | --- |
| `runtime/` | LangGraph 创作流程、模型请求、工具调度、观察、检查点和云任务 | `agent.mjs`、`tools.mjs`、`context.mjs`、`cloud-job.mjs` |
| `skills/` | Agent 按需读取的八个活跃专题及其示意元数据 | `README.md`、各专题的 `SKILL.md` |
| `library/` | 方法、模板、案例、编译器和示意图的唯一来源 | `methods.json`、`templates.json`、`techniques.js`、`matcher.js` |
| `research/` | 来源分析、长篇教程和未投入运行的旧专题；只供维护者查阅 | 各专题研究笔记 |

`compute-server/worker.mjs` 仍是服务器进程入口；`src/` 保存前端与后台共用的 Scene、命令、字体、图层和渲染合同。浏览器直接导入 `library/` 的模板与方法数据，所以这里的变更需要同时检查浏览器构建和后台测试。`scripts/` 保存开发、生成示意图和真实模型验收命令，`tests/` 保存测试。

创作流程与部署合同见 [`docs/CREATIVE_HARNESS.md`](../docs/CREATIVE_HARNESS.md)；方法用法见 [`docs/CREATION_LIBRARY.md`](../docs/CREATION_LIBRARY.md)。历史研究和已废弃的专题没有进入运行时 Skill 目录。

工具入口与任务执行分开维护：`runtime/tools.mjs` 定义模型工具与按需发现策略，`src/creation-command-spec.js` 是实际编辑操作的唯一参数来源，`runtime/agent.mjs` 负责事务与预览生命周期。Skill 解释判断方法，参数和可执行示例由注册表返回。首轮展示 13 个常用工具（含专用纸张 creation_paper 和标题 creation_title 入口）；其他工具经 `creation_help` 或检索结果展开，阶段切换不影响已展开工具。

用户“确定方向”给出创作目标，Skill 中的方法可以组合、交错和修订，不另改用户选择。普通回合保留稳定的历史与图片前缀，达到条件再集中压缩；压缩后仍保留最近学习的教程参考与当前作品。动态状态放在请求末尾。允许同轮加载多个 Skill 并执行独立编辑，单个调用失败不阻断其他调用。图例为方法参考，不能当作本次库存。

本轮多作者研究、实际阅读范围、同源素材测试及未解决问题见 [教程扩展与对照记录](research/tutorial-expansion-same-source-2026-11-23.md)。原图、提取素材、真实模型输出和可编辑项目保留在仓库外；自动审查通过不代表人工视觉验收通过。

当前上下文策略：完整追加实际请求及回答，重点控制新增信息。图层首次完整提供，后续只给变化与删除 ID；指导、目录和篇幅建议仅在变化时追加，计划不重复搬运。最新图片照常提供，完整 Scene 按需查询。仅在接近模型容量预留区时集中压缩，保留最近两轮并补一次完整图层基线，不再由轮数、图片数或思考强度切换触发。adaptive 在首版实质构图渲染前持续 high，此后持续 low。见 `docs/CREATIVE_HARNESS.md`。
