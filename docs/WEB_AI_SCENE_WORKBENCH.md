# 网页 AI Scene v2 工作台与 GPT 创作包 v3

网页可编辑任务导出统一 ZIP。AI 默认只读 `START_HERE.md`、`TASK.json`、`assets/overview.jpg`，必要时再打开原图与 `design/RECIPES.md`。完整 Scene v2 保存在 `scene.json.page`，与 App 编辑画布和导入格式相同；命令文件只是一批修改，不是另一份作品。

## 五步工作流

1. `node runtime/shiye.cjs self-test` 检查 Node Canvas；`info` 取得 `sceneRevision`。
2. 用 `work/commands.json` 的单一 `operations` 数组添加素材、文字、图形、笔迹或复杂工艺。每批有唯一 `transactionId` 和当前 `baseSceneRevision`。
3. `apply work/commands.json` 原子修改 Scene；同一事务重试直接返回原回执，旧 revision 或复用 ID 改内容会拒绝。
4. `preview` 从当前 Scene 渲染 `output/preview.png`。打开图片检查整页与细节；修改时取得新 revision，提交下一批命令。复杂分片、余料、开窗与穿插使用 `material.craft.plan`，仍是同一个命令文件。
5. 每件素材使用 `material.decision` 与真实图层对账，运行 `pack`。输出 `project.shiyeproject.json`、PNG 和 `manifest.json`；Scene 或素材变化后旧 PNG 无法打包。

`TASK.json.sourceContext` 保存完整来源快照和任务指纹；`assets/manifest.json` 保存源 UUID、物理尺寸、原图 SHA256 与原文件名。通用 `layer.update` 只允许已支持的视觉属性，不能改来源或假借手工复制来绕过实体尺寸约束。页面单双页与物理尺寸由 App 任务固定，需改变时重新导出。

## 验证

`node --test tests/v3-package.test.js` 覆盖实际 ZIP、初稿命令、真实 PNG、局部失败回滚、幂等、旧 revision、分片余料、撕边、透明窗口、双孔穿插、导入和过期预览拒绝。底层 Scene/拓扑单测继续核查字形、来源面积和组结构。示例由 `node scripts/generate-v3-example.mjs` 生成；仓库的 `examples/v3/` 收录真实 ZIP、两批命令、最终 PNG/Scene/manifest。

`preview` 的 Node Canvas 使用与网页共同的 `renderSceneCanvas` 场景解释。`pack` 独立重渲染并比对预览 PNG，避免图片和清单一同被误替换。字体来自执行环境，`manifest.json` 明确保留字体与视觉复核状态；目前没有经过对照验收的 Chromium 备用渲染后端。没有可用 Canvas 时停止交付，不生成替代 PNG。
