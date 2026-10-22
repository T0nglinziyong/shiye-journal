# 拾页 GPT 创作包 · 图文素材共同构图

scene.json 是唯一作品。预览必须由同一 Scene 通过真实 Node Canvas 或经验证的浏览器 Canvas 渲染；实际打开 output/preview.png，最后交付 output/project.shiyeproject.json 与 PNG。不得用示意图代替。字段不清时查 api/commands.schema.json，通常只需 describe。

## 最短有效路线
1. 读 TASK.json、design/GUIDE.md 和 design/SKILL.md，看 assets/overview.jpg 与必要原图。文字、图形、实体素材都是核心构成；不是“贴完材料再塞字”。保留真实来源、尺寸和用户事实。
2. **构图阶段**：先决定页面主块和阅读路线。主块可以是大素材、艺术标题、段落或数字图形。素材多时先稳定大材料，素材少时让文字和图形担当主体。预留正常字号的正文，不用小字救满版素材。
3. **内容阶段**：完成主要文字和图文关系。块内对齐，块间错落；用大小、粗细、颜色、行距和形状区分主次。大印刷标题不能让其余内容都退化成图注。
4. **点缀阶段不要吝啬装饰**：主体稳定后，主动尝试多个区域的细节关系与变化，不默认极简；选择与内容有关的小素材、贴纸、合法胶带/裁条、图形、笔迹或局部强调。具体看 design/PLAYBOOK.md。记录简短选择：增强哪个区域、使用什么、为何保留或舍弃。不能因为禁止乱装饰，就直接跳过细节设计；也不凑工具数量。
5. 使用 work/commands.json 经 apply 修改作品，再 preview 看图。首轮基础预览后解决主结构问题；下一轮合并文字与细节的局部精修，不为凑轮次重复渲染。可运行 design-check 辅助定位，但它不是审美验收。
6. 按 design/REVIEW.md 看整页、文字和局部。除非 TASK 明确要求大留白，默认画面应充实、疏密有序，不留大片未完成空区。空洞先用主块/文字/图形重排解决，不撒小物填平；边距、行距和必要停顿必须保留。
7. 补齐 material.decision，review 后 pack。代码校验通过不代表审美完成；最终 PNG、Scene 必须一致。

## 按需工具
- 运行 `node runtime/shiye.cjs self-test`、`info`；后续事务用 `begin work/next.json`。
- 不会用某个操作就 `describe <op>`；`--full` 才展开完整 Schema。公共参数查 place/size/style/geometry/region。
- 文字描边/渐变：`text.add / layer.update` 的 style.outline / style.gradient。逐字异体标题：`text.lettering`。看 design/LETTERING.md；字体查询用 `fonts`。
- 图形和绘画统一 `graphic.add`：geometry 决定预设图形、path 或 stroke，place/size/style/order 与修改共用。看 design/GRAPHICS.md。不设置点缀命令；文字、素材、胶带、图形、笔迹都能点缀。数字色带不能冒充有来源的实体胶带。
- 主体、正文与支撑图形占位：layer.update / group.compose / graphic.add；必要裁取用 material.cut / split。不能缩放实物填空。
- `design-check` 仅返回图层框覆盖、字级和空区建议，忽略真实透明度、图案和字形，必须继续看实际 PNG。

不手写 Scene、不写 Python/JS 创作脚本、不复制示例坐标/旧 revision，不执行 native.* 或协议 1。固定例子在 design/RECIPES.md，精细排版例子在 design/LETTERING.md。两份字体相近的文字错位不是渐变，阴影不是完整描边。

## 当前接口分工（不用记同义命令）
普通更新统一 layer.update；显示遮罩 layer.mask（replace/intersect/subtract/clear）；真实裁切 material.cut（region+keep/remove）。分片与命名开窗仍分别用 material.split/material.window。数字复制 layer.duplicate，艺术标题整体重排 text.reflow；两者是结构操作，不塞进普通更新。所有专业操作按需 describe，不通读完整 Schema。
