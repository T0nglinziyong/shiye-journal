# 开发脚本

此目录存放可直接从仓库根目录运行的命令。文件名的动词表示用途：`build-*`、`generate-*`、`extract-*`、`render-*`、`benchmark-*`、`test-*`、`sync-*`。常用入口：

| 用途 | 命令 |
| --- | --- |
| 生成共享离线运行时与创作资源版本 | `node scripts/build-offline-runtime.mjs` |
| 生成方法与模板示意图 | `node scripts/build-creation-library-illustrations.mjs` |
| 本机真实模型创作验收 | `node scripts/test-creative-harness-real.mjs` |
| 计算服务器跟随已发布 SHA 更新 | `node scripts/sync-compute-release.mjs` |

`test-*real*` 可能调用外部模型或私有素材；运行前检查脚本参数、环境变量和输出目录。正式测试命令在根目录 `package.json`，发布步骤见 `DEPLOYMENT.md`。

布局研究使用 `test-creative-harness-real.mjs <任务包> <新输出目录> [风格] --layout-only`：预读构图和纸层 Skill，最多 3 次 HTTP 请求（含重试）、90 秒、每次最多 4000 输出 token，第一张真实预览后停止。关闭额外的模型审查与摘要调用。输出 `stage-report.json` 和阶段作品；`stage-captured` 只表示取得试摆图，不表示创作完成或审美通过。不与 `--resume` 混用；研究限制不改变产品正常创作流程。
