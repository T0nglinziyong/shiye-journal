# 并行创作验收

`test-creative-harness-batch.mjs` 将多个真实任务包与 Harness 配置交叉运行。每个组合使用独立进程和输出目录；一个运行失败不影响其他组合。默认同时运行 2 个，最多 4 个。

私有 manifest 示例：

```json
{
  "cases": [
    {"id": "case-materials", "package": "/private/case-package", "style": "清新淡雅"},
    {"id": "existing-materials", "package": "/private/existing-package", "style": "清新淡雅"}
  ],
  "variants": [
    {"id": "baseline", "effort": "high", "deadlineMs": 570000},
    {"id": "candidate", "runner": "/other-worktree/scripts/test-creative-harness-real.mjs", "effort": "high", "deadlineMs": 570000}
  ]
}
```

`runner` 可指向另一独立 checkout 中的测试脚本，以比较两个代码版本。任务包路径和 runner 路径按 manifest 所在目录解析。API 密钥只从进程环境继承；manifest 不写密钥，也不注入参考案例答案或目标排版提示。

```bash
node scripts/test-creative-harness-batch.mjs /private/manifest.json /private/new-output --dry-run
node --env-file=/private/creative.env scripts/test-creative-harness-batch.mjs /private/manifest.json /private/new-output --concurrency=2
```

输出目录必须是全新目录。每个组合保留 `process.log`、独立预览、Scene、轨迹和报告；根目录的 `batch-report.json` 对比完成状态、轮次、总时长、输入输出 token、最终独立审查和画面修订数，并记录并行墙钟时间与串行时间估计。token 汇总包括主对话、独立审查、草稿探索和上下文压缩调用。画质是否过关仍需查看最终预览并进行人工审阅，不能只根据模型自己的完成状态判断。

人工验收看完整页面缩略图和放大的文字区：多素材作品每页应有可见的承托纸层，至少一件图案与纸层发生实际搭接；丰富双页不能只是两个近似的平行大色板。检查主要素材、标题、正文是否形成连续阅读路线，段落是否落在可读区域，印刷大字是否与自拟标题冲突，外缘和中缝是否安全。允许有意留白、局部遮挡和不对称；若只靠结构指标或模型自评通过，而缩略图仍像素材展板，则记录为未通过。另记录单次耗时是否低于 6 分钟。
