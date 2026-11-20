# 创作教材完成度审计

目标：按用户最新要求，暂时保留现有 78 个模板并完善其质量与解析；每个具体用法都有介绍、示意、灵活工具和验证；可从空白页依输入元素重建模板。当前未完成。

## 验收依据

| 要求 | 当前证据 | 结论 |
| --- | --- | --- |
| 每个现有方法有原理、步骤、检查点和完整调用 | methods.json 的 lesson；describeTechnique 的 example.prepare 与完整 parameters；creation-library.test.js 逐项执行 | 已覆盖当前 64 项；不代表所有教程方法已经穷尽 |
| 示意与可执行工具一致 | build-creation-library-illustrations.mjs 运行真实 Scene，manifest 校验 64 张方法图；查看全表及标题细图 | 当前方法已生成并查看；需要真实创作复验 |
| 结构参数可修改 | 图形直接使用 geometry.options；标题共用 style、runs、emphasis；编辑与导出共用绘制 | 已实现并有针对测试 |
| 不臃肿、按需检索 | read_skill 每页 8 项；统一 creation_recipe；题目目录预载而非所有图片常驻 | 保持 |
| 模板数量与结构 | templates.json 为 78 个独立来源面板 | 用户确认数量暂时足够，不再增加；逐项质量验收继续 |
| 每个模板从空白页完整重建 | compiler.js 已支持数字图形、配色、文字样式、显式层级和省略；43 个模板具有逐项元素与完整合成夹具；全部 78 张图改用真实命令渲染 | 未完成：其余 35 个仍只有主要结构；现有模板的字体笔画、手绘轮廓等细节仍与原图有近似差异，不能当作像素复刻 |
| 模板风格多样且高质量 | 八篇源教程的 78 个结构；当前几何匹配有绝对尺寸和成对尺寸约束 | 不能仅凭标签/数量证明；需扩充并逐图审阅 |
| 真实素材实例 | 既有 14 件材料的两次 DeepSeek 私有验收，新增八张本机模板实例；非每模板实例 | 待补，不能以合成图代替真实案例；新增八张未调用模型 |
| 全部历史教程均已学习 | 各 Skill 明确列出只看过的图片/视频片段 | 未完成；不得把总览当作已读所有页 |

## 专题覆盖

下面是已接入的具体方法；专题文字原则不等于每个原则已有独立执行配方。

| 专题 | 方法 |
| --- | --- |
| journal-lettering | title-underline, title-outline, title-highlight, title-stack, title-vertical, title-stagger, title-label, title-curve, title-shadow, title-offset-outline, title-gradient, title-gradient-outline, title-phrases, title-circle, title-caption |
| paper-layering | paper-underlay, paper-peek, paper-tear, paper-window, paper-window-reuse, paper-weave, paper-split |
| photo-story | photo-row, photo-grid, photo-stagger, photo-caption |
| journal-graphics | graphic-loop, graphic-route, graphic-corner, graphic-rays, graphic-flower, graphic-star, graphic-arrow, graphic-arch, graphic-scallop-frame, graphic-paperclip, graphic-wave, graphic-zigzag, graphic-bubble |
| pattern-and-doodle | pattern-dots, pattern-stripes, pattern-grid, pattern-scallop |
| tape-and-vellum | tape-fix, tape-corners, tape-divider |
| functional-journal | record-checklist, record-timeline, record-columns, record-on-material |
| journal-color | color-echo, color-bands |
| quiet-photo-journal | quiet-pair, quiet-note |
| layered-journal | layered-center, layered-diagonal |
| magazine-journal | magazine-offset, magazine-headline |
| playful-journal | playful-bubble, playful-number |
| vintage-journal | vintage-ticket, vintage-postmark |
| journal-composition | composition-triangle, composition-s |

## 继续核查的能力

- 文字：旧 LETTERING 的整字描边、偏移轮廓、阴影、渐变与词组布局已接入。偏旁拆解、任意改笔画尚未实现；不能伪装为字体旋转。倪以七六种标题的全部七图和正文已核对，Skill 逐项区分排版可执行部分与笔画能力缺口；其他历史来源仍按各自阅读记录判定。
- 纸片：已有撕纸、开窗、分裁与露边。窗芯复用与平面纸条穿插现有多步配方、示意及几何验收；跨边文字与更多复杂余料重组仍需补充真实例子。真实折页、口袋不属于当前平面工具能力。
- 图案：花瓣、星角、箭头、花边和重复图案已有参数；仍需针对稀疏、密集与小字号场景检验是否抢占主体。
- 图文和双页：现有方法以局部组为主，跨页非对称叙事和围绕主体的多组关系需要在模板重建阶段验证，不能以单组工具替代整页设计。
- 模板：分别保存来源面板、人工解析、可执行描述和重建结果；遗漏的数字图形不应伪造为用户拥有的实体材料。输入缺失时保留空位，完整夹具时须能核对每一个元素。
- 验收：所有代码修改先走本地与浏览器测试；发布涉及真实站点，当前不合并 test。

## 本轮重建验证

- 4 个 center 模板逐个执行全元素夹具，检查所有元素存在、层级顺序一致、实物无缩放；现有标题组插入后也保持目标层级。
- 颜色覆盖只影响数字图形和文字，不修改原素材；缺失素材不生成假占位，省略元素不会被自动分配重新填回。
- 完整测试 1865 项通过、0 失败、1 项跳过。本轮 UI smoke、React 页面流程与 7 视口路由验证通过；目录在 390/768/1024/1440 宽度无横向溢出。实体设备未验证。
- 在月游 14 页已逐项解析并渲染审阅；三张真实素材实例暴露正文区与装饰线外接框混用问题，修复为独立文字区。正文与彩点遮挡已在三张实例中重看；这只证明已测输入，不等于任意长文均能容纳。
- 三分构图与文字三段式新增四个模板，合成重建均已逐图检查，并补两张真实素材实例。显式绑定过大标签曾挡住另一素材文字；最终示例省略该位置。当前匹配分数不能代替真实叠压检查，也不能据此宣称任意绑定都能自动避让。
- 书写便签方法通过真实 Scene 事务验证，正文跟随旋转和位移，不裁掉长文。
- 70 个来源面板均已通过提取后的 SHA-256 校验；四点透视面板使用保存的输出尺寸重建，提取工具不再把四边形当作矩形裁切。
- 新增 4 个 S 形与 9 个单页的逐项描述，均已对照来源和真实命令输出检查。单页源面板原先裁掉顶部，已按各图重新提取；教学底色与外框不混入页面元素。合成图保留结构关系，字形、手绘轮廓和配色差异记录在每个模板中。
- 条纹原先在小格内旋转，细长区域会出现断线和错误角度。改为在实际尺寸内连续绘制与裁切；横、竖细长区域的三种角度通过像素连续性测试。S 形与斜向单页新增两张真实素材本机实例，未调用模型；均保持实物尺寸并检查正文和图像遮挡。

## 八个双页模板补充核验

- 奶油儿球球第六期的八个独立抽象结构已解析为 105 个素材、文字及图形元素，封面和下方真实成品未重复计数。纸面教学底色不作为真实材料；字素是素材位置，写字区域是可编辑文字。原图、面板和输出均已核对。
- 真实材料示例使用此前授权的七件素材在本机渲染，保留毫米尺寸和透明轮廓，没有调用模型或上传图片。第一稿页底材料稍微越界，增大纸张后复验；缺少的右下角底纸保持空缺。这是部分库存的布局验证，未称为繁复风格成品或源图完整复刻。
- 修复文字位置带示意线时不能绑定已有标题组的问题。绑定后保留组内文字、标题效果和相邻元素顺序，原示意线不再重复出现；普通数字图形位置仍不接受实体绑定。
- 当前 43 个模板有逐项描述，其中 21 个状态为 `structure-reviewed`，22 个早期记录仍标为 `pending-visual-review`，后续须重新核对状态；另 35 个只有主要结构，不能计为完整模板。
- 本轮全量：1882 项通过、1 项跳过、0 失败；UI smoke、React 页面流程及 7 视口路由通过。新增模板目录的筛选、详情展开和图片加载已在 390/768/1024/1440 宽度检查，无横向溢出；不是实体 Safari 验收。

## 纸张工艺闭环与目标调整

- 用户确认现有 78 个模板暂时足够，后续不再增加数量，集中补齐现有模板解析及技巧能力。
- 新增 `paper-window-reuse` 与 `paper-weave`：都有原理、准备材料、完整参数、真实命令示意及检查条件。窗芯按裁下后的真实尺寸定位；穿插可以混用已命名窗口与新孔，报告返回替代外框及隐藏窗芯 ID，不再重复添加来源材料。
- 逆序开孔测试暴露了孔洞几何排序与命名顺序不一致的问题。现在每次开窗按源坐标中的孔洞轮廓重新关联稳定编号；相连、合并或缺少编号的孔洞明确拒绝，不静默绑定错误窗口。
- 六项专项测试覆盖窗芯透明孔与独立位置、来源面积守恒、反向开孔像素一致性、前后面切换、已开孔与新孔混用，以及窄孔/错位/相连孔的事务回滚。整套门禁 1890 项通过、1 项跳过、0 失败；UI smoke、React 流程与 7 视口路由通过。
- 目录中的教程筛选、教学与完整参数展开、图片加载在 390/768/1024/1440 宽度验证无横向溢出。新示意使用合成材料，未发送私人图片，也未进行实体 Safari 验收或上线。
