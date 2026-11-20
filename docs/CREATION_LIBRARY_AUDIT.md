# 创作教材完成度审计

目标：100 个多样、高质量、已解析的模板；每个具体用法都有介绍、示意、灵活工具和验证；可从空白页依输入元素重建模板。当前未完成。

## 验收依据

| 要求 | 当前证据 | 结论 |
| --- | --- | --- |
| 每个现有方法有原理、步骤、检查点和完整调用 | methods.json 的 lesson；describeTechnique 的 example.prepare 与完整 parameters；creation-library.test.js 逐项执行 | 已覆盖当前 62 项；不代表所有教程方法已经穷尽 |
| 示意与可执行工具一致 | build-creation-library-illustrations.mjs 运行真实 Scene，manifest 校验 62 张方法图；查看全表及标题细图 | 当前方法已生成并查看；需要真实创作复验 |
| 结构参数可修改 | 图形直接使用 geometry.options；标题共用 style、runs、emphasis；编辑与导出共用绘制 | 已实现并有针对测试 |
| 不臃肿、按需检索 | read_skill 每页 8 项；统一 creation_recipe；题目目录预载而非所有图片常驻 | 保持 |
| 模板达到 100 个且有独立结构 | templates.json 为 70 个独立来源面板 | 未完成，还需 30 个 |
| 每个模板从空白页完整重建 | compiler.js 已支持数字图形、配色、文字样式、显式层级和省略；22 个模板具有逐项元素与完整合成夹具；全部 70 张图改用真实命令渲染 | 未完成：其余 48 个仍只有主要结构；四个 center 的字体笔画、条纹等细节仍与原图有近似差异，不能当作像素复刻 |
| 模板风格多样且高质量 | 七篇源教程的 70 个结构；当前几何匹配有绝对尺寸和成对尺寸约束 | 不能仅凭标签/数量证明；需扩充并逐图审阅 |
| 真实素材实例 | 既有 14 件材料的两次 DeepSeek 私有验收，新增五张本机模板实例；非每模板实例 | 待补，不能以合成图代替真实案例；新增五张未调用模型 |
| 全部历史教程均已学习 | 各 Skill 明确列出只看过的图片/视频片段 | 未完成；不得把总览当作已读所有页 |

## 专题覆盖

下面是已接入的具体方法；专题文字原则不等于每个原则已有独立执行配方。

| 专题 | 方法 |
| --- | --- |
| journal-lettering | title-underline, title-outline, title-highlight, title-stack, title-vertical, title-stagger, title-label, title-curve, title-shadow, title-offset-outline, title-gradient, title-gradient-outline, title-phrases, title-circle, title-caption |
| paper-layering | paper-underlay, paper-peek, paper-tear, paper-window, paper-split |
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
- 纸片：已有撕纸、开窗、分裁与露边。需要把余料再用、穿插编织及跨边文字的完整多步关系补成可复验例子。真实折页、口袋不属于当前平面工具能力。
- 图案：花瓣、星角、箭头、花边和重复图案已有参数；仍需针对稀疏、密集与小字号场景检验是否抢占主体。
- 图文和双页：现有方法以局部组为主，跨页非对称叙事和围绕主体的多组关系需要在模板重建阶段验证，不能以单组工具替代整页设计。
- 模板：分别保存来源面板、人工解析、可执行描述和重建结果；遗漏的数字图形不应伪造为用户拥有的实体材料。输入缺失时保留空位，完整夹具时须能核对每一个元素。
- 验收：所有代码修改先走本地与浏览器测试；发布涉及真实站点，当前不合并 test。

## 本轮重建验证

- 4 个 center 模板逐个执行全元素夹具，检查所有元素存在、层级顺序一致、实物无缩放；现有标题组插入后也保持目标层级。
- 颜色覆盖只影响数字图形和文字，不修改原素材；缺失素材不生成假占位，省略元素不会被自动分配重新填回。
- 本轮 173 项库测试通过；最终完整测试 1851 项通过、0 失败、1 项跳过。UI smoke、React 页面流程与 7 视口路由验证通过；目录在 390/768/1024/1440 宽度无横向溢出。实体设备未验证。
- 在月游 14 页已逐项解析并渲染审阅；三张真实素材实例暴露正文区与装饰线外接框混用问题，修复为独立文字区。正文与彩点遮挡已在三张实例中重看；这只证明已测输入，不等于任意长文均能容纳。
- 三分构图与文字三段式新增四个模板，合成重建均已逐图检查，并补两张真实素材实例。显式绑定过大标签曾挡住另一素材文字；最终示例省略该位置。当前匹配分数不能代替真实叠压检查，也不能据此宣称任意绑定都能自动避让。
- 书写便签方法通过真实 Scene 事务验证，正文跟随旋转和位移，不裁掉长文。
- 70 个来源面板均已通过提取后的 SHA-256 校验；四点透视面板使用保存的输出尺寸重建，提取工具不再把四边形当作矩形裁切。
