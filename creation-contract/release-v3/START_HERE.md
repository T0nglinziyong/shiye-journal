# 拾页 GPT 创作包 v3 · 统一协议 2

先读 TASK.json、任务简报 design/GUIDE.md 和固定创作指导 design/CRAFT_GUIDE.md，再看 assets/overview.jpg 与必要原图。scene.json 是唯一作品；素材别名、尺寸、数量与加工限制以本次 TASK 为准。

1. 运行 `node runtime/shiye.cjs self-test` 和 `node runtime/shiye.cjs info`。
2. 不知道有哪些工具，运行 `node runtime/shiye.cjs help`。不知道参数，运行 `describe <op>`；公共参数用 `describe place`、`describe size`、`describe style`、`describe region`、`describe order`、`describe layoutBox`。帮助与验证来自同一份执行规范，不默认通读完整 Schema。
3. 第一轮填写 work/commands.json；下一轮用 `node runtime/shiye.cjs begin work/<新文件名>.json` 创建事务。只编辑 operations，保留工具给出的 transactionId 与 baseSceneRevision。design/RECIPES.md 是固定的局部操作示例，不是本任务成品。
4. 执行 `check <文件>`，然后 `apply <文件>` 和 `preview`。必要时用 `preview --commands <文件>` 在临时副本试做，不修改正式 Scene。
5. 必须实际打开 output/preview.png。修订时建立新事务，只更新有问题的图层，不重写全页。可用 group.compose 设计局部组合，用统一 place 设置毫米、比例或相对锚点；持续跟随用 behavior=linked。layout.arrange 支持横向、纵向和网格的一次性排列，不缩放实体素材。
6. 补齐 material.decision。实际看图后运行 `review --result pass|fail`，最后运行 `pack`。交付 output/preview.png 和单行紧凑的 output/project.shiyeproject.json；只有用户要求时才交付 ZIP。review 是创作者声明，不是自动审美验收。

所有动作都通过同一 commands.json 协议 2 执行。native.* 是同一事务中的原生加工操作；不接受协议 1、旧事务或旧命令名前缀。不手写 Scene，也不编写辅助 Python/JavaScript 修改作品。

预览默认优先 Node Canvas，没有时检测本机 Chromium，均复用拾页 Scene 渲染器。可设置 SHIYE_RENDERER=node|browser|auto；自定义 Chromium 路径用 SHIYE_CHROMIUM_PATH。不自动下载浏览器，不上传任务素材，不把其他图片当成预览；没有后端时明确失败。两种后端的字体与像素可能不同，manifest 如实记录，pack 在同一后端重新渲染核对。

纸张模式和物理尺寸由 TASK 固定。visible 轮廓锚点、自定义 region: 布局区域、持续自动排列尚未发布，不猜测它们的效果；使用 layout 边界、明确 layoutBox 和单对象 linked 关系。
