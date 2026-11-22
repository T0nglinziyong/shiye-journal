---
name: journal-lettering
description: 建立手帐标题、正文和局部批注的层级；用于文字太像报告、标题孤立或缺少可读内容。
---
# 标题、书写与批注

标题的形状和位置应回应素材。印刷文字已经形成主题时，可以直接作为标题；不要再重打一遍。用户没有提供事实时，不编造日期、城市行程和已完成事项。随写可以是直白的小感受，不必每页都用励志标语。

## 文字角色

主标题承担第一眼的焦点；短副题给背景；正文承载可细读内容；批注对应某个具体图像或句子。只选择当前页面需要的角色。正文用稳定的字形、间距和清晰对比，不把艺术处理撒到每个字上。

标题可断行、疏密变化、局部描边或有含义的小符号。用 text.lettering 建可编辑逐字组合，text.add 做段落，graphic.add 做底线、圈注或局部色块。先查精确合同及可用字体，不能凭空假设本机有某款字体，也不能把字体描边当成可自由改笔画的书法。

当前可执行的字效可直接落在可编辑文字上：`title-shadow` 做轻微同向投影，`title-gap-shadow` 用与纸面同色的细描边做硬边间隔阴影（`colors[2]` 填标题所在纸面色），`title-outline` 做字心真正透明的空心字，`title-offset-outline` 做线条错位，`title-gradient-outline` 做渐变字加细描边。用 `creation_recipe(kind="technique",recipeId=方法 ID,parameters={id,text,at,colors,fontFamily,widthMm,style})` 一次创建；`style` 可继续调整描边宽度、阴影方向与颜色。先按周围素材选一种主效果，预览看底色是否透过字心、线条是否糊住笔画、投影是否与背景分开。若只需改已有标题，使用 `layer.update` 的同一套 `style`，无需重新生成文字。

## 手写字形

服务器已预装的字体会在任务开始时列出；底层 `text.add` 用 `style.fontFamily`，教程 `creation_recipe` 用 `parameters.fontFamily`。BaiLuBangBang 是用户提供的粗细变化明显的标题字，适合短而醒目的主标题；WoAiWanWeiWei 是用户提供的细笔手写字，适合轻快的副题和小标题。HongLeiZhuoShu 适合拙趣、有张力的短标题；FontQu Smile 适合随性连笔的短句；Like JianJian 适合自然的青春手记。Xiaolai 适合清楚的日常正文，Sophora 适合松散随笔，Otsutome 适合笔刷标题；Ma Shan Zheng 仅用于需要毛笔感的短题，不把它当作所有手帐的默认笔迹。通常只需一种正文笔触和一种标题笔触，不用每段换字库。部分字体缺字由 Xiaolai 补字；看实际预览核对粗细和基线。不要要求手机传送字体，也不要向任意网址下载字体。

调用 `creation_recipe` 时，标题、记录、图注、气泡和素材留白书写都可传 `fontFamily`；`read_skill level=methods` 的参数会列出预装字体及显示名称。标题的 `runs[].fontFamily` 可让主词与副词采用不同字体，标题小注另用 `captionFontFamily`；未指定的小注沿用标题字体。例如标题传 `fontFamily:"HongLeiZhuoShu"`，一个副词传 `fontFamily:"Xiaolai"`，正文记录传 `fontFamily:"Sophora"`。这些都是可编辑文字，换字后要重新预览断行和对齐。

## 与材料相处

短标题可以组成窄的阅读路径，或聚成面状焦点。`lettering-cluster` 对比这两种结构：字群更紧凑时要额外检查读序，不能将正文也拆得七零八落。逐字错落保留相邻关系，只强调少数关键字。手写教程中的偏旁拆解、改笔画属于另一种能力；现有 text.lettering 只映射支持的整字参数，不能用错误字形冒充。

文字可以写在纸片空区、顺着照片组边缘，或由小纸条承载。深色底适合清楚的浅字；浅色底使用深字。小面积强调色对应重点，避免每行一种颜色。不要在复杂图案上叠长正文。英文与中文混用须有内容理由，不随意生成无关英文装饰。

### 三层组合手写标题

`title-composed` 将短标题分为可独立设定的三层，全部由可编辑的文字、荧光笔色块和手写笔路径组成，不调用素材库：

1. **字形**：`glyph.split` 把每字上下两段分开，`middleText` 在中间写一条短字，英文首尾分别对齐中文标题左右边界，并在上下半字之间垂直居中；中文字距略收紧；`waveMm` 控制字位起伏，`gapMm` 拉开上下半字并拉长整体比例；默认比普通标题更高。`glyph.strokes` 对指定字位的指定竖撇局部先做非破坏遮罩，再画热狗形圆棒或倒三角；必须依据预览指定 `index` 与 `box:[x,y,w,h]`，不会自动猜出汉字笔顺。`glyph.numberShadow` 给选中的数字加小半圆影。拆字与替换笔画分别使用，其他两个笔画选项可在同一标题内组合。
2. **字效**：`style.color`、`style.shadow`、`style.outline`、`style.gradient` 与 `letterStyles` 的逐字样式可以独立调整和叠加。留白间隔阴影用与实际纸色相同的细 `outline` 再加无模糊 `shadow`；浅字反白时显式设置浅色 `style.color`。
3. **字下与周围**：`backgrounds` 可叠放 `dots`、`squares`、`lines`、`hashes`、`mixed`、`reverse`、`enclosure`；`accents` 将独立的小圆点、星芒或音符放在周围、右上或四角。`mixed` 混排小圆与方块，大小、颜色、纵向位置和方块角度有变化，彼此留空；`lines` 横跨整个标题宽度，`hashes` 将横竖线交错为整片井字底纹，`count` 调线数。点缀相对大标题保持小比例，整片底纹用较低不透明度放在字后。右上音符与包围线也由手写笔路径绘制。

先用 `read_skill level=methods` 查 `title-composed` 的完整参数和可执行示例。用 `creation_recipe(kind="technique",recipeId="title-composed",parameters={id,text,at,fontFamily,fontSizePt,widthMm,glyph,style,letterStyles,backgrounds,accents,colors})` 创建。六种建议起点：拆字加小字与同向影；热狗笔画加右上音符；倒三角笔画加少量小方块；数字半圆影加包围线；英文连写加分离圆点；浅字加深色反白底与角落星芒。每种都需看真实预览，确认笔画覆盖的是目标竖撇、底纹不挡读字、不同颜色有主次。对于复杂字体或不确定笔画位置，先只做字效与背景，待观察单字后再指定 `box`。

预览检查实际断行、标点、最小字是否可读、文字与纸边的距离；不要只看文本框。修正字号、宽度或位置后重渲染，旧预览不能证明修订后的可读性。文字太多先删重复的表达，文字太少先补内容关系，不能用无意义短词凑密度。

## 按需用法与组合

GitHub 仓库中的 `creation-contract/release-v3/design/LETTERING.md` 是底层文字能力合同。这里将其中的描边、偏移轮廓、渐变、阴影、逐字变化和局部图形整理为方法；字体查询、文字重排和 linked 跟随仍使用原工具，不再包装一层重复工具。查阅方法时要区分整字效果与原教程的笔画操作，后者是否支持见文末能力映射。

`read_skill level=methods` 分页查看当前标题方法，每种都有原理、步骤、检查点、执行示意和完整参数示例。先决定需要的字形关系：连续短题、分行字块、竖向阅读、主次词组，再选择描边、阴影、渐变、底色、圈注或旁注。效果可以组合，但不要给每个字堆同样多的效果。

### 先选结构，再选处理

| 页面需要 | 查阅方法 | 调整依据 |
| --- | --- | --- |
| 宽窄受限或需要一团字成为焦点 | `title-stack`、`title-vertical`、`title-phrases` | 按语义断行；主词最大，副词保持可读；竖排不用于长正文 |
| 有节奏但仍能一眼读完 | `title-stagger`、`title-curve` | 错落以词组为单位；弧线回应附近素材轮廓，不围着整页兜圈 |
| 与背景分离或增加字形层次 | `title-outline`、`title-shadow`、`title-gap-shadow`、`title-offset-outline` | 空心适合简单底色；同侧投影保持统一光向；间隔阴影用无模糊偏移；小字优先实心 |
| 延续素材配色 | `title-gradient`、`title-gradient-outline`、`title-highlight` | 从已有素材取主色与强调色；高亮只落在关键词 |
| 让标题成为局部图文组 | `title-label`、`title-tape`、`title-underline`、`title-circle`、`title-caption` | 底卡、半透明数字胶带、下划分隔、圈注或旁注；选择需要的关系 |

方法不是互斥风格。结构、字形处理、局部承载可以组合，例如主次词组配同侧投影、两行标题配局部底色、文字组配小旁注。通常先确定一种结构和一个主要强调，再根据实际素材决定是否补小图形。不要为了展示工具把所有处理叠在一起。

`title-tape` 根据实际字行生成短的半透明数字胶带，`pattern` 可选 `plain/dots/stripes/grid`，`tapeOpacity` 控制透明度，`fontFamily` 和 `runs[].fontFamily` 仍可分别调整。它适合跨在附近纸片或照片的边缘；若有真实胶带素材，需要使用实体胶带工具，不能把数字底形记作实体用量。长标题分行时逐行核对胶带边缘和字形对比。这个连接思路参考 [journal-page](https://github.com/lumen-prism/journal-page) 的公开教程；图形与参数由拾页独立实现，未复制其代码或图片。

### 从标题组到整页

1. 读取页面剩余空间与素材主色；印刷标题已经明确时，先考虑直接利用它。
2. 写出完整标题，再分 `runs`。字数变长时增加换行或可用宽度，不能省掉后半句，也不能拉伸实物填空。
3. 用一个标题配方建立可编辑组。同一调用的 `style` 可叠加阴影、描边或渐变，不需要重新创建同一段标题。
4. 需要照片、纸片或图形回应时，将标题组与它们靠近、对齐或轻微跨边；通过模板 `bindings[].node` 复用已有组。数字底形不代表用户拥有一张实体纸。
5. 编辑后看整页预览：先看阅读顺序和标题与主图的关系，再看小字、行距、遮挡和对比。减少重复点缀通常比继续加效果更有效。

`creation_recipe` 的标题方法共用参数：`text` 保留完整内容，`runs` 按语义分词组，分别设置角色、换行、角度和基线；不提供词组时不自动交替旋转每个字。`emphasis` 必须是原文中的词，只对它加底色或圈注。`style` 与 `text.add` 相同，可覆盖描边宽度、偏移、渐变方向和色标、同侧投影。文字背景花纹限局部区域。

真正空心字使用 `style.fillOpacity:0`，图片能透过字心；`fillOpacity:1` 恢复实字。主词组先保持可读字号，空间不足时换行或扩大文字区域，不缩放实物。弧形标题只用于单行，过窄会明确拒绝，不截掉后半句。结果是可编辑文字和图形组，可以嵌入模板；改变组内字数后应重新检查图文关系。

## 来源

[水岸芝芝：大标题教程 2.0](https://www.xiaohongshu.com/explore/695695500000000022033ace)，2026-11-22 查看 3 分 28 秒视频的开头、制作阶段与结尾，并逐帧核对约 145–167 秒的深色纸标题：先画四个错位的空心蓝方框，再写第一组浅蓝字；第二组浅蓝字压在一大一小的红圈线上，旁边只有少量色点。另可见同向阴影、空隙明显的彩色影、描边、局部条纹等做法。本轮按字下几何底形、字体选择、描边、阴影、渐变与纹样实现，不把字形变形列为该教程的步骤。

[水岸芝芝：大标题邪修 3.0](https://www.xiaohongshu.com/explore/69be8c03000000001e00dc9f)，2026-10-26 保存五张关键帧；关注同词不同大小与字重、字组基线、局部笔画变化。当前字体候选中，HongLeiZhuoShu 更接近其短标题的断续与粗细变化，Like JianJian 适合较细的手写底稿；实际字形仍需看预览。标准字体转路径只得到填充轮廓，不会自动得到作者下笔顺序或每一笔的可编辑路径。指定笔画的变形需要独立的笔画数据或人工描画。

[倪以七：六种标题写法](https://www.xiaohongshu.com/explore/6ad0880d000000001203c470)，2026-11-20 已阅读正文及全部七张图。提炼的是排版、留白、同侧阴影、局部纹样和纸片承载关系，不复制原例标题。六种写法的能力映射如下：

| 原教程的做法 | 当前可执行部分 | 尚未具备的部分 |
| --- | --- | --- |
| 细长中文字、中间穿过小字、同侧阴影 | `title-composed` 的 `glyph.split`、`style.shadow`；`title-cross-shadow` 可保留原横带形式 | 当前按字裁开，无法自动把任意字体压窄、拉高 |
| 分散字位、把部分笔画改成圆棒 | `title-composed` 的 `glyph.strokes.kind=hotdog`，指定字位和局部比例框 | 不自动识别汉字笔顺；需检查选框是否正对竖撇 |
| 分散字位、部分笔画改成三角形 | `title-composed` 的 `glyph.strokes.kind=triangle`，可与热狗笔画在同组使用 | 同上 |
| 数字倾斜、局部半圆影、外围线条 | `title-composed` 的 `glyph.numberShadow` 与 `backgrounds.kind=enclosure` | 不自动找出数字印刷字体的某一笔作局部涂色 |
| 连写英文与圆点背景 | `title-composed` 的 `backgrounds.kind=dots`，或 `title-script-dots`；小圆点彼此分离 | 手绘字形与笔触的完全复刻 |
| 深色反白底承载浅字 | `title-composed` 的 `backgrounds.kind=reverse`、浅色 `style.color`，或 `title-paper-lettering` | 纸张真实纹理生成 |

`text.lettering` 操作整字，`text.add` 保持整词连写，`graphic.add` 可画路径。`title-composed` 的笔画替换是用户或模型明确给出局部区域后的可编辑遮罩与数字笔画，不声称自动恢复原作者笔顺，也不把周围三角点缀冒充字内三角笔画。

以上工具都是可编辑的文字与矢量底形组。**字下背景与字旁点缀是两种不同关系**：传统标题方法的 `backdrop.kind=dots|squares|mixed` 与新组合方法的 `backgrounds` 都先画底形，再画文字；`ornament` 和 `accents` 则放在文字周围。填充圆点、方块按主字比例缩小并保持间隙；`title-script-dots` 默认用分离的小黄色圆点。**《大标题教程 2.0》中另一种关系是空心方框和大圈线**：使用 `title-outline-block-ring`，前一组词的 `runs[].backdrop={kind:'squares',strokeOnly:true,...}` 生成四个错位蓝框，后一组词的 `{kind:'ring',...}` 生成宽松的红圈，再让浅色手写字盖上去。方框和圈线分别跟随相应的词组，不均匀铺满标题，也不画到字群外圈。深色整块底卡配浅字选 `title-paper-lettering`。`title-cross-shadow` 必须提供真实的小字 `caption`；错落和数字工具必须给出语义明确的 `runs`。

[闹钟为什么赖床：手帐标题字写法分享](https://www.xiaohongshu.com/explore/693e8a11000000001f00a194)，2026-11-20 阅读全部五图与正文；第三图明确展示窄标题与聚合字群，并提示后者可读性稍差。示意图用于判断整页关系，不提供字体文件。
