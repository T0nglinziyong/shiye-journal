# 文档入口

先看根目录的 `README.md`、`ARCHITECTURE.md`、`DATA_LOADING_ARCHITECTURE.md`、`DEPLOYMENT.md` 和 `DEVELOPMENT_WORKFLOW.md`。它们描述当前产品、代码边界、数据、部署和开发规则。

| 任务 | 当前说明 |
| --- | --- |
| 后台 AI 创作 | [创作 Harness](CREATIVE_HARNESS.md)、[Agent 代码入口](../creative-agent/README.md) |
| 方法、模板与 Skill | [可执行方法库](CREATION_LIBRARY.md)、[活跃 Skill](../creative-agent/skills/README.md) |
| 模板制作与复现 | [模板制作与验收规范](TEMPLATE_CREATION_WORKFLOW.md) |
| Scene 与命令 | [命令分类](command-taxonomy.md)、[共享编辑内核](shared-editor-kernel.md)、[Scene 数据](scene-v2-unified-architecture.md) |
| 素材识别 | [识别研究集成](recognition-research-integration.md)、[素材分类](MATERIAL_TAXONOMY_V2.md) |
| 存储与同步 | [云端直连](cloudbase-direct-access.md)、[备份恢复](cloud-backup-runbook.md)、[资源版本](CREATION_RESOURCES.md) |
| 发布与验收 | [发布清单](RELEASE_CHECKLIST.md)、[测试环境](CLOUDBASE_TEST_ROLLOUT.md) |
| 整改进度 | [任务板](remediation/TASK_BOARD.md)、[验收结果](remediation/ACCEPTANCE_RESULTS.md) |

[`creative-agent/research/`](../creative-agent/research/) 保存来源分析和未投入运行的旧专题；`history/` 保存按日期累积的审计与试验记录。历史文档中的数量和测试结果只对应当时的版本，当前数量以代码目录及现行说明为准。新增说明优先更新对应的现行文档，不再往历史审计末尾追加运行合同。
