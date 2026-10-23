# 拾页 GPT 创作包 · 图文素材共同构图

scene.json 是唯一作品。预览必须由同一 Scene 通过真实 Node Canvas 或经验证的浏览器 Canvas 渲染；实际打开 output/preview.png，最后交付 output/project.shiyeproject.json 与 PNG。不得用示意图代替。字段不清时查 api/commands.schema.json，通常只需 describe。

## 最短有效路线
包内已有 `work/commands.json` 初稿。首次直接填它的 operations；每次 apply 后，要在同一路径开始新事务时，改用新的 transactionId 和 `info` 返回的 sceneRevision。`begin` 不会覆盖已有文件，无须为此重新安装依赖或重新生成整页。
1. 读 TASK.json 的任务字段和 design/GUIDE.md，看 assets/overview.jpg、assets/size-map.jpg 与必要原图。总览图为各件独立放大观察；尺寸图用同一毫米比例，判断真实大小以尺寸图和 TASK 为准。materials.metadataHints 直接提供现有素材分类标签，它只是观察线索，实际图片与用户事实优先。TASK 的 creativeBriefRef 指向同一份动态指导；先用 `describe` 查当前需要的命令，遇到高级工艺才读 design/SKILL.md 或对应专题，别在第一次试摆前通读所有文档。保留真实来源、尺寸和用户事实。
2. **试摆阶段**：辨认主角、可写纸面、连接物和小件。让主角、底纸、书写面叠压，并露出有用边缘；素材少时也可让大字或段落成为主块。若 TASK.styles 含“丰富层叠”，先做两种**主块比例或素材职责真正不同**的结构草稿，各用 `preview --commands` 看真实候选 PNG，选更有图文关系的一种再 apply；不要把两套完整 Scene 都写出来。首批 Commands 就从实物轮廓、颜色或动作试一个承担承托、分区或阅读路线的数字图形，不把全部图形留到最后补。若强印刷字卡在缩略图中吞掉整页，应先改露出面积、位置、合法裁片或相邻文字重量，再继续写正文。
3. **内容阶段**：根据试排中的真实书写空间决定正文长度、标题或独立字条，再反过来调整素材。用字重、颜色、行距与分组构成层次；不能把大印刷标题之外的文字都缩成图注。
4. **细节阶段**：在有关联的地方尝试小素材、合法胶带/裁条、数字图形、圈注、笔迹或局部高亮。“丰富层叠”要在不同区域比较**不同作用与尺度**的回应：例如大块浅色衬托书写、一段沿轮廓走的细笔迹、关键词背后的半透明荧光；不是画一个粗箭头和小圆圈就宣布丰富。图形应从本次素材提炼形状或方向；预览无益就删掉或重画。主色可占较大面积，强调色集中在少数关键处。看图决定保留，不凑工具或装饰数量；具体问题查 design/PLAYBOOK.md。`graphic.add` 的 ellipse/rect/arrow/stroke 共用 place/size/style；填色不需要描边时只给 style.fill，手绘短线可用 geometry.kind=stroke 与少量毫米坐标点。复杂手绘化先 `graphics help`，避免手写长 SVG。
5. apply 后 preview 看当前 Scene。返回的 geometryReview 会列出框级空区和大素材上是否有新增图层相交；先据此定位，再打开 PNG 判断，不能把几何提示当成审美结论。若出现大空洞、遮字或素材相互孤立，就用下一事务局部修订。尤其检查是否把几个素材各放一处、配几句解释就结束；应考虑改变主块比例、让纸面承载正文、用叠压建立阅读路线。不为凑轮次重复渲染。design-check 只能辅助定位，不能代替看图。
6. 按 design/REVIEW.md 看整页、文字和局部。分别指出最大无作用空区、最弱的一段新增文字、最像并排展示而缺少关系的素材；存在明显问题就针对这些对象用一批局部 Commands 修正，再看 PNG。特别看大块纹样纸是否只有图案而无图文关系、现成印刷大字是否压过全部新增内容；前者可改成局部底纸或承载相关文字，后者可调整位置与合法裁切。**自评仍能指出这些未解决的显著问题时，不得声明 `review pass`。**除非 TASK 明确要求大留白，默认画面应充实、疏密有序；空洞先用主块/文字/图形重排解决，不撒小物填平；边距、行距和必要停顿必须保留。
7. 补齐 material.decision，review 后 pack。代码校验通过不代表审美完成；最终 PNG、Scene 必须一致。

## 按需工具
- 先运行 `node runtime/shiye.cjs self-test`；只在它报告缺少 Canvas 时安装 `package-lock.json` 指定的依赖，不为每次局部修改重复 `npm ci`。用 `info` 读取当前修订；后续事务用 `begin work/next.json`。
- 不会用某个操作就 `describe <op>`；`--full` 才展开完整 Schema。公共参数查 place/size/style/geometry/region。
- 文字描边/渐变：`text.add / layer.update` 的 style.outline / style.gradient。逐字异体标题：`text.lettering`。看 design/LETTERING.md；字体查询用 `fonts`。
- 图形和绘画统一 `graphic.add`：geometry 决定预设图形、path 或 stroke，place/size/style/order 与修改共用。看 design/GRAPHICS.md。不设置点缀命令；文字、素材、胶带、图形、笔迹都能点缀。数字色带不能冒充有来源的实体胶带。
- 主体、正文与支撑图形占位：layer.update / group.compose / graphic.add；必要裁取用 material.cut / split。不能缩放实物填空。
- `design-check` 仅返回图层框覆盖、字级和空区建议，忽略真实透明度、图案和字形，必须继续看实际 PNG。

不手写 Scene、不写 Python/JS 创作脚本、不复制示例坐标/旧 revision，不执行 native.* 或协议 1。固定例子在 design/RECIPES.md，精细排版例子在 design/LETTERING.md。两份字体相近的文字错位不是渐变，阴影不是完整描边。

## 当前接口分工（不用记同义命令）
普通更新统一 layer.update；显示遮罩 layer.mask（replace/intersect/subtract/clear）；真实裁切 material.cut（region+keep/remove）。分片与命名开窗仍分别用 material.split/material.window。数字复制 layer.duplicate，艺术标题整体重排 text.reflow；两者是结构操作，不塞进普通更新。所有专业操作按需 describe，不通读完整 Schema。

需要手绘化、路径平滑/简化或布尔几何时，按需 `graphics help` 与 design/GRAPHICS_TOOL.md；计算只生成普通 Command 草稿，不直接改作品。
