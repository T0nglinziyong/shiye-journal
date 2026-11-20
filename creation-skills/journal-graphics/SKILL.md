---
name: journal-graphics
description: 用可编辑的参数图形制作花边、花朵、星形、箭头和局部框；用于需要调整结构而非只缩放的装饰与信息组织。
---
# 图形与常用操作

先确认图形要承担承托、界定、连接还是强调。选少量与素材呼应的形状，保持独立可编辑；不要把所有内容套进同一种边框。

## 参数化图形

通过 `describe geometry` 查看几何类型，`describe shapeOptions` 查看各图形可用参数、范围与默认值。`graphic.add` 和 `layer.update` 共用 `geometry: {kind, options}`。只更新一个参数会保留同类图形的其他参数。填充、线色、线宽、透明度与尺寸是独立属性。

| 需求 | kind | 可调结构 |
| --- | --- | --- |
| 小花、花朵轮廓 | flower | petals 花瓣数、petalDepth 花瓣深度、centerRadius 花心大小、showCenter |
| 星形、柔和星角 | star | points 星角数、innerRatio 内外半径比；越大越饱满 |
| 方向与连接 | arrow | headLength 箭头长度、shaftWidth 箭杆宽度；方向由旋转控制 |
| 拱形框、拱形色块 | archFrame | archRise 拱顶高度、frameInset 内框间距、showInnerBorder |
| 矩形花边框 | scallopFrame | lobes 每边花边数、lobeDepth 波幅、frameInset、showInnerBorder |
| 连续分隔线 | wave / zigzag | count 重复数、depth 起伏 |
| 表格、清单 | weeklyTable / checklistTable / habitTracker | rows、columns 及相应线条、标记开关 |

新花朵、星形、箭头和两种边框改变结构参数时外框不变。已有连续纹样的 count、表格的行列数保持单元间距，增减时外框随之变化。若要固定最终占地，更新中明确给出 size。整体缩放不会自动增加花瓣或格子。

空心框使用 `style.fill: null`；不是白色填充。需要实心承托时指定 fill，并按需要关闭内框。拱形框只是数字轮廓；裁切真实素材须使用 material.cut/window，不能把边框当成已经裁好的纸片。花瓣和拱顶使用曲线路径，结构参数会保留在 Scene 中。

## 操作组合

- **票据固定与探出**：material.relate 的 peek/underlay 配合合法胶带或 paperclip 图形，保留日期、地点和编号。数字回形针不代表真实库存。
- **裁片与线条组合**：先 material.cut，再 graphic.add，最后 group.compose 保持关联。不要用多次重画同一条线代替几何更新。
- **照片承托**：先放照片，后放框并调整 layer.order；用 layout.align 定位，而不是逐轮猜坐标。
- **标题与标记**：text.lettering 配合少量 underline、arrow 或空心 star。图形颜色从当前素材中取，正文优先可读。
- **一致性修改**：同批 operations 中一起调整关联对象；合理使用组与 layout.arrange，避免模型为每个对象各调用一轮。

查询各操作合同后执行，不臆造参数。apply 后已有自动预览和检查；先看返回图像与告警，再针对实际问题修改，避免无变化的重复预览。

## 检查

缩小到整页后确认线条仍可见、花边没有压住正文、箭头指向明确。检查轮廓是否超出选择框、空心处是否透明，以及保存重开后能否继续调花瓣、波幅等参数。示意方法来自本次图案、票据与人物层次教程的归纳；具体参数和工具组合属于拾页实现，不是原作者的 API 教程。
