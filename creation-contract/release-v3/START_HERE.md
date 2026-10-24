# 拾页 GPT 创作包 · 图文素材共同构图

交付一页有表达、能细看的完成态手帐，以及对应的可编辑 JSON。scene.json 是唯一作品；所有预览来自它的真实 Node Canvas 或经验证的浏览器 Canvas 渲染。用 `work/commands.json` 编辑，不手写 Scene，不另写 Python/JavaScript 创作程序。

## 开始

1. `node runtime/shiye.cjs self-test` 检查渲染环境；通过即开始，不重复安装。缺少依赖才按 package-lock 安装。
2. 读 TASK.json 的任务字段和 design/GUIDE.md；看 assets/overview.jpg、assets/size-map.jpg 与必要原图。总览用于辨认内容，尺寸图与毫米数据用于判断真实大小。sourceContext 是运行时来源快照，无须逐字段读。
3. 可一次查询 `describe material.add text.add graphic.add`，之后只查本次需要的命令。普通帮助已有最小例子；只有需要某项高级功能时才查 `--full`、api/commands.schema.json 或专题文档。

## 创作与迭代

先从本批材料找到想表达的内容，同时决定各件材料承担什么职责。将相关的材料、书写和局部图形组织成有主次的组合，再形成整页；材料少时书写和绘画也能承担视觉重量。具体方式见任务指导，不固定模板、主路径、图形种类或装饰数量。

用一批命令完成第一张可判断的整体稿：主要材料、实际文字和关键细节一起出现。不能只摆图片然后判断完成度。构图方向明确时直接创作；只有两种结构难以取舍时，才用 `preview --commands work/<候选>.json` 比较。候选应改变材料职责或图文组织，而非仅换坐标颜色。

`apply work/commands.json` 后运行 `preview`，**打开返回路径的真实 PNG**。先看整页的主次和充实程度，再看可读内容、材料交界和局部细节。几何或像素报告只是定位工具，默认保存在 diagnosticsPath；需要时读取或用 `preview --full`，不要为消除提示而加粗线、扩大色块。

每次修改先用一句话写清“画面哪里不成立、为什么、这次改什么”。若整页仍是完整图片加独立正文框，应重分材料职责和书写空间；只挪几毫米、加一个圈不会解决这个问题。若整体成立，才修具体换行、遮挡、局部高亮等。图形、剪裁和叠压服务内容，可大胆尝试，也可删除无用尝试。连续局部修订无收益时换结构，不继续沿同一方向堆元素。

下一事务用 `begin work/next.json`，填写 operations；不要重复旧 transactionId 或 revision。候选预览不改 Scene；选中候选后 apply，再预览当前 Scene。正常无需先 check 再 apply，apply 本身原子校验，失败不会留下半幅作品。

## 收尾

实际打开 output/preview.png，按 design/REVIEW.md 审查当前 PNG，补齐 material.decision，记录 `review pass` 或 `review fail` 后 `pack`。自评是创作者声明，不是独立验收；明显未解决的问题应如实说明。最终交付 output/preview.png 和 output/project.shiyeproject.json，二者必须同源。pack 会重新核对真实渲染和素材来源。

## 按需能力

- 普通位置、内容和样式：layer.update；组合：group.create / group.compose。
- 高级工艺按需查 design/SKILL.md；问题与方法查 design/PLAYBOOK.md。
- 真实裁切/余料：material.cut / split / window；显示遮罩：layer.mask。不要混淆显示隐藏与实体取料。
- 图形、笔迹：graphic.add，支持预设、自由路径、stroke、sketch。手绘化和布尔几何按需 `graphics help`、design/GRAPHICS_TOOL.md。
- 预设胶带、贴纸和印章各有 9 款，与普通素材一起列在本次 TASK 的 materials 中，状态为“预设”；仅当用户选入本次创作时才进入 ZIP。数字预设可以重复使用，同一实物素材仍受单份来源和裁片占用约束。表格、月历等空白矢量图形直接用 `graphic.add`，行列、边框及其他高级图形细节可在 `geometry.options` 中调整，见 design/GRAPHICS.md。
- 字体：fonts；艺术字：text.lettering；详见 design/LETTERING.md。
- inspect 查询当前图层与用量；design-check 按需定位几何问题。完整命令清单用 help，精确字段用 describe。

实体尺寸、来源、裁片占用与用户事实必须保留。原创想法可以自由写，不把它冒充用户发生过的经历。高级工艺不设配额，也不因担心技术细节而放弃必要的素材加工。
