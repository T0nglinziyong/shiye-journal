# 拾页 GPT 创作包 v3

先读 `TASK.json` 中的任务事实、创作简报与素材映射，再读任务简报 `design/GUIDE.md` 和固定创作指导 `design/CRAFT_GUIDE.md`；查看 `assets/overview.jpg` 和必要的原图。scene.json 是唯一作品。

1. 运行 `node runtime/shiye.cjs self-test` 与 `node runtime/shiye.cjs info`。确认 `protocolVersion` 为 1。
2. 默认草稿位于 `work/commands.json`。新事务可用 `node runtime/shiye.cjs begin work/<新文件名>.json` 建立空草稿。填入 `operations`；必要时执行 `check <文件>` 或 `preview --commands <文件>` 试做。
3. 执行 `node runtime/shiye.cjs apply <文件>`，再执行 `node runtime/shiye.cjs preview`。
4. 打开 output/preview.png 检查构图、文字与裁切。修订时用新事务 ID 和当前 revision，只改有问题的图层。
5. 补齐素材决策，最终运行 `preview` 和 `pack`。交付 `output/project.shiyeproject.json` 与用户可见的 PNG `output/preview.png`。

复杂工艺按需看 `design/RECIPES.md` 和 `api/commands.schema.json`。不手写完整 Scene，也不写辅助 Python 或 JavaScript 修改 Scene。`review --result pass|fail` 只记录实际看图后由创作者声明的结果，不代表自动视觉验证。

本包使用已验证的 v3 协议；候选 v2 契约仍在工程接入阶段，**不能套用它的 place/group.compose 参数**。预览失败时运行 `self-test` 并检查 Node Canvas 依赖；不能用别的图片代替真实预览。
