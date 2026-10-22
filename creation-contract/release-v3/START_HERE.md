# 拾页 GPT 创作包 · 统一协议 2

scene.json 是唯一作品；任何预览都必须从同一 Scene 通过真实 Node Canvas 或经过验证的浏览器 Canvas 渲染，不得用示意图替代。字段不清时按需查 api/commands.schema.json，普通参数优先 describe。最终必须实际打开 output/preview.png，并交付 output/project.shiyeproject.json；缺少有效 PNG 不得声称创作完成。

**目标：完成一页有个人表达、可继续编辑的手帐，而不是把素材和几段小字摆成展示板。** 本包不要求使用固定数量的素材工艺、画笔或图形。优先解决真实画面问题。

## 快速路线
1. 先读 `TASK.json`、本次 `design/GUIDE.md` 和 `design/SKILL.md`；查看 `assets/overview.jpg` 及必要原图。纸张、事实、必用素材和实体加工限制以 TASK 为准。
2. **构图前就给正文留可读空间**。决定每件素材的角色（焦点、书写面、印刷标题、底纸、连接物、点缀）；比较两种真正不同的图文关系，确定左右页阅读路线。不要先排满实物，再把文字缩进剩余空隙。
3. 先搭主视觉、书写面与正文，再安排次级素材；查看是否需要局部错层、跨边连接、短笔迹、色带或有目的的裁切。每个动作须能回答“解决什么问题”。必要时才读 `design/PLAYBOOK.md` 的相应诊断卡。
4. 运行 `node runtime/shiye.cjs self-test` 和 `node runtime/shiye.cjs info`。只在不确定时查询 `help`、`describe <op>` 或 `describe place / size / style / region`；详尽字段才用 `describe <op> --full`。
5. 使用协议 2 的 `work/commands.json` 通过 `apply` 修改唯一 `scene.json`，再运行 `preview`，**实际打开** `output/preview.png`。无需手写 Scene，也不生成另一套 Python/JS 创作脚本。
6. 依据 `design/REVIEW.md`，缩看整页、再看正文正常尺寸的可读性和局部连接。若显得平铺、文字过小、缺少阅读路线，必须先判断原因、用新事务局部修正并重新预览；无问题不强制多轮。
7. 补全真实 `material.decision`，按任务规定进行 `review` 和 `pack`，交付同一 Scene 的 PNG 和可编辑 JSON。视觉审阅不是结构校验的替代，也不得伪造已看图。

## 适用时才使用的能力
- 素材像各自独立的矩形 → 先看 `PLAYBOOK` 中的“层次与跨边”，考虑 `layer.place / layer.reorder / group.compose / material.crop`。
- 正文像小字图注 → 先重排正文位置与宽度，按文字角色用 `text.add / text.update / text.fit`，字号使用 `style.fontSizePt` **真实 pt**，不是画布像素。
- 重点与内容之间缺少连接 → 有理由地考虑 `ink.add`（如 marker）、`shape.add`、`vector.add`。不机械撒圆点星星。
- 实体形状妨碍表达 → 只有许可时才使用 `material.crop / material.split / material.window`；显示遮罩并不产生可用余料。

不要复制配方的假 ID 或旧 revision，不执行 `native.*`、协议 1 或原始 `set/plan`。固定示例来自 `design/RECIPES.md`；实际填写以本次 TASK、Scene 和当前 `describe` 为准。