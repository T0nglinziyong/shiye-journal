---
name: journal-graphics
description: 用可编辑的参数图形制作花边、花朵、星形、箭头和局部框；用于需要调整结构而非只缩放的装饰与信息组织。
---
# 图形与常用操作

先确认图形要承担承托、界定、连接还是强调。选择数量与范围符合用户方向、且与素材呼应的形状，保持独立可编辑；不要把所有内容套进同一种边框。

## 参数化图形

通过 `creation_help({topics:["geometry","shapeOptions"]})` 查看几何类型及各图形可用参数、范围与默认值。`graphic.add` 和 `layer.update` 共用 `geometry: {kind, options}`。只更新一个参数会保留同类图形的其他参数。填充、线色、线宽、透明度与尺寸是独立属性。

| 需求 | kind | 可调结构 |
| --- | --- | --- |
| 小花、花朵轮廓 | flower | petals 花瓣数、petalDepth 花瓣深度、centerRadius 花心大小、showCenter |
| 星形、柔和星角 | star | points 星角数、innerRatio 内外半径比；越大越饱满 |
| 方向与连接 | arrow | headLength 箭头长度、shaftWidth 箭杆宽度；方向由旋转控制 |
| 拱形框、拱形色块 | archFrame | archRise 拱顶高度、frameInset 内框间距、showInnerBorder |
| 矩形花边框 | scallopFrame | lobes 每边花边数、lobeDepth 波幅、frameInset、showInnerBorder |
| 连续分隔线 | wave / zigzag | count 重复数、depth 起伏 |
| 格纹、点纹、条纹纸 | grid / dots / stripes | rows、columns 各 1–128、showOuterBorder；dots 的 dotSize；stripes 的 angle（0 横向、90 纵向） |
| 撕口纸条或纸形 | washi | count 撕口数量、depth 撕口深度；纹样另建一层并与底形对齐 |
| 表格、清单 | weeklyTable / checklistTable / habitTracker | rows、columns 及相应线条、标记开关 |

新花朵、星形、箭头和两种边框改变结构参数时外框不变。已有连续纹样的 count、表格的行列数保持单元间距，增减时外框随之变化。若要固定最终占地，更新中明确给出 size。整体缩放不会自动增加花瓣或格子。

空心框使用 `style.fill: null`；不是白色填充。需要实心承托时指定 fill，并按需要关闭内框。拱形框只是数字轮廓；裁切真实素材须使用 `material.cut` / `material.window`，不能把边框当成已经裁好的纸片。花瓣和拱顶使用曲线路径，结构参数会保留在 Scene 中。

## 操作组合

- **票据固定与探出**：material.relate 的 peek/underlay 配合合法胶带或 paperclip 图形，保留日期、地点和编号。数字回形针不代表真实库存。
- **裁片与线条组合**：先 material.cut，再 graphic.add，最后 group.compose 保持关联。不要用多次重画同一条线代替几何更新。
- **照片承托**：先放照片，后放框并用 `layer.update.order` 调整层序；用 layout.align 定位，而不是逐轮猜坐标。
- **标题与标记**：text.lettering 配合少量 underline、arrow 或空心 star。图形颜色从当前素材中取，正文优先可读。
- **一致性修改**：同批 operations 中一起调整关联对象；合理使用组与 layout.arrange，避免模型为每个对象各调用一轮。

查询各操作合同后执行，不臆造参数。apply 后已有自动预览和检查；先看返回图像与告警，再针对实际问题修改，避免无变化的重复预览。

## 检查

缩小到整页后确认线条仍可见、花边没有压住正文、箭头指向明确。检查轮廓是否超出选择框、空心处是否透明，以及保存重开后能否继续调花瓣、波幅等参数。示意方法来自本次图案、票据与人物层次教程的归纳；具体参数和工具组合属于拾页实现，不是原作者的 API 教程。

需要把单个图形变成有主次的局部点缀时，读取 `journal-accents`：先确定接触位置与保护区域，再选择图案或真实小素材组合；不要平均填满所有空白。
## 图案和活泼形状的基础用法

单个花、星、箭头、波浪、回形针、拱形框、点阵、条纹和网格直接使用 `graphic.add` 的 `geometry` 与 `style`，无需读取配方。它们的参数由 `creation_help` 的 shapeOptions 与 geometry 给出。需要把若干线条组成一个可编辑的标记时使用 `graphic-loop`，可用 `parameters.variant=corner|rays|scallop` 切换角线、放射线或波浪边；有实际阅读转折时用独立的 `graphic-route`，短批注框用 `graphic-bubble`。变体键不是方法 ID。

图案纸可作局部承托，少量线条与已有裁片形成关系；细小正文应避开密集图案。童趣页面可以使用异形写面、错落字组与内容相关的图形，不必默认动物贴纸或四角星点。

用形状代替纸或胶带时，比较单元大小与间距：参考的细密点纹若变成两三个巨大圆点，视觉作用已经改变。重复纹样优先用一个参数图形；不规则手绘点才逐个安排。`grid/dots/stripes` 用 `style.fill` 作底色、`style.stroke` 作纹样色，避免背景纸与纹样框意外错位；不需要外框时设 `geometry.options.showOuterBorder:false`。保持相近效果即可，不逐点临摹；形状不是原始实物或复杂插画的复原品。

## 图形的组合依据

同色可以通过线宽、填实、空心、反白、局部纹样和大小变化建立层次；颜色丰富不要求每个图形都换色。装饰线可分段、箭头可指向具体照片，路径可串起游览片段，内容相关轮廓可与文字呼应。这些关系可以叠加组合。画面里真正需要的不是某个图形种类，而是承托、组织、连接或强调。

四角放图、照片环绕正文、异形底上写字都可能有效；不能把“不要四角撒点”误解为禁止四角构图。若图形看起来与图文无关，先改它的位置、尺度、线宽与用途，不先增加数量。

多作者交叉来源、实际阅读范围和方法边界见 `creative-agent/research/tutorial-expansion-same-source-2026-11-23.md`。

## 数字纸面的质感

图形承托可以使用 `style.paperSurface:{kind:"matte",intensity:0.45,seed:17}`，纤维较明显的纸用 `kind:"fiber"`；设为 null 可去除。这是可编辑的数字纸面，不是实体库存。与 `style.fill` 搭配，颜色先呼应实际素材的冷暖、明度与饱和度；不统一用米黄或纯白。质感为细微颗粒、纤维和缓慢色差，强度服从素材与文字可读性，不以做旧为通用目标。实体图像已经有纸纹时优先保留，不叠加模拟纸纹。

直裁纸可以保留直边；需要撕口才使用 washi 或自由路径，不把所有底纸变成锯齿。创作不使用阴影，以露边、纹理和透明叠色表达叠放。图形色块也可能是平涂笔迹，无需全部纸化。先比较相邻材料是否协调，再决定加纹理、改色、改边缘或调整接触关系。

撕边纸有现成预设：`style.paperSurface:{kind:"torn"}` 即可获得细微纤维和真正透明的不规则纸边，默认强度 0.45、seed 17，可按需覆盖 intensity 与 seed。适合 rect 底纸或题签，不用叠白色锯齿遮罩，也不需要逐点画撕口。边缘尺度按毫米生成，大纸不会变成巨大锯齿。用 rect 搭配该预设即可，避免再叠加规则 washi 齿边。并非所有纸都应撕边：真实素材保持原样，直裁纸可选 matte 或 fiber。

## 一次调用的质感纸张

高级图形 `graphic.add.geometry:{kind:"paper",options:{paperPattern:"ruled",grain:0.65,torn:true,rows:12}}` 会生成一张可编辑的有纹理横线纸，不必另铺底卡再逐条画线。paperPattern 可选 plain / ruled / grid / dots；不透明度统一用 style.opacity，范围 0–1，1 为不透明、0 为全透明，0.55 左右可作半透明薄纸；纸张和胶带使用相同参数，文字另放在纸上保持清楚。fill 控制纸色，stroke 控制印纹色，strokeWidthMm 控制线宽；印纹行列、纸纹、撕边可以分别调整。默认无阴影。

纸面优先考虑本白、米白、牛皮棕、灰纸及常见淡彩纸，允许同色相邻，也允许反差；不要用一片完全平涂的色块代替所有纸面。创作不使用阴影。层次主要来自露边、纹理、印纹、透明叠色与内容关系。不是每张纸都需要横线或撕边。半透明纸叠在纹样、图片或不同底色上才看得出透光；避免覆盖人脸和重要字，不能把图层整体变淡后让正文也失去对比。
