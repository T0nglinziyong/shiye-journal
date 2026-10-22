# 可编辑艺术字、文字图形化与轻手绘

**字体决定字形，效果决定处理方式。** 单字本来就可用 text.add；text.lettering 便于一次建立整组、每字不同字体或效果。保持统一色彩/方向，避免每字都用完全不相关的处理。大标题、单字、正文块也能独立撑起素材少的页面。

先运行 `node runtime/shiye.cjs fonts` 查看当前环境。fontPreset 是 serif/sans/rounded/hand 类别偏好，不保证机器里都有不同字体；fontFamily 是具体名称，必须确认实际可用。字体文件不打包、不上传；没有字体时换可用字体或保留普通文字，不假装生成了该艺术字体。

## 一字或一段：普通文字上直接做效果
通过相同 style 用于 text.add / layer.update / layer.update。outline=null、gradient=null 清除对应效果，正文仍可改。

```json
{"op":"text.add","id":"accent-word","content":"试","place":{"reference":"page","at":[45,40],"unit":"mm"},"size":{"width":24,"unit":"mm"},"style":{"fontSizePt":30,"fontPreset":"serif","fontWeight":"bold","color":"#426076","outline":{"color":"#D8B980","widthMm":0.6,"offsetMm":[0,0]}}}
```

- **同侧阴影**：style.shadow 的 offsetMm 方向一致。浅底用深字，模糊投影不能冒充描边。
- **完整描边**：style.outline，offsetMm=[0,0]；围绕字形所有边缘，stroke 后 fill 保留实字。
- **偏移轮廓**：同一个 outline 设置 offsetMm，例如 [.6,.8]，偏移方向一致，区别于模糊阴影。
- **真实渐变**：style.gradient 的 stops 从 0 到 1 严格递增；角度 0 为横向，90 为纵向。只改变字形内部颜色，不是把两段文字错位叠加。

```json
{"op":"layer.update","target":"accent-word","style":{"gradient":{"angleDeg":90,"stops":[{"offset":0,"color":"#C77A58"},{"offset":0.5,"color":"#9A7BA3"},{"offset":1,"color":"#526E9C"}]},"outline":{"color":"#EFE4D1","widthMm":0.5,"offsetMm":[0.5,0.7]}}}
```

## 逐字变化：不用人工计算所有字的位置

```json
{"op":"text.lettering","id":"small-title","content":"去看看","place":{"reference":"page","at":[70,25],"unit":"mm"},"gapMm":0.5,"style":{"fontSizePt":24,"fontPreset":"hand","color":"#35516A"},"letters":[{"index":0,"style":{"fontPreset":"serif","outline":{"color":"#D6B365","widthMm":0.6}}},{"index":1,"rotationDeg":-4,"offsetMm":[0,1]},{"index":2,"style":{"gradient":{"angleDeg":90,"stops":[{"offset":0,"color":"#BC7955"},{"offset":1,"color":"#7A719A"}]}},"rotationDeg":3}]}
```

运行时生成普通 Group 与 small-title-g1/g2/g3 文本节点；仍可独立编辑，或整体移动。index 按 Unicode 字素计数，不拆组合音标。只用于短标题，不替代连写语言的整词 shaping，也不自动保证所有字体有全部字形。已知宽高是确定性估算，必须实际预览。

## 小背景、圈点、条纹与跨边
普通字也可借局部小背景获得层次：先放文字，再创建 graphic.add 的 dots/stripes/ellipse/frame 等于后方。小背景围绕**所选文字**，不铺满全页；数字形状可以自由调整尺寸，不改变实物。

## 使用普通图形/笔迹实现局部强调
点缀是一种构图选择，不是专门的 Command。先决定哪句话值得强调，再用统一 graphic.add；不要每段文字都画线。下面是可编辑的普通线条，通过已有 place 指定位置，仍可成为大幅构图线条。

```json
{"op":"graphic.add","id":"word-underline","geometry":{"kind":"line"},"size":{"reference":"node:accent-word","width":0.85,"height":0.06,"unit":"ratio"},"place":{"reference":"node:accent-word","referenceAnchor":"bottom-center","anchor":"top-center","offset":{"value":[0,1.5],"unit":"mm"},"rotationSpace":"reference","rotationDeg":0,"behavior":"linked"},"style":{"stroke":"#8B9E74","strokeWidthMm":0.6,"fill":null},"order":{"after":"accent-word"}}
```

所有图形/笔迹颜色用 fill/stroke；strokeWidthMm 是线宽。自由笔迹用 geometry.kind=stroke、points 和 unit。geometry、place、size、style 在 layer.update 中仍是相同结构，更多例子见 GRAPHICS.md。place 的 linked 只跟随位置和朝向，size.reference 在命令执行时取值，不自动追踪改字后的框宽。不同组内的层级调整须先明确 parent。

图形、笔迹可以成为页面主体：素材少时用自由路径绘制主图，用大字、色块、线框构建区域关系。不要把稀疏文字加几条高亮误认为完整构图。

## 默认可用字体
当前默认 `fontPreset:"hand"`。网页编辑器使用应用已有的 Ma Shan Zheng 艺术手写字体，在测量前等字体加载；离线包不包含字体字节，用 `fonts` 的 recommended.hand 判断当前机器是否有可用艺术字体。找不到时安装合法字体或选择已存在字体，不仅填写一个不存在的名称。`fontPreset` 改变且未明确给 `fontFamily` 时，会清除之前的指定字体覆盖，保证新预设真正生效。

## 在编辑器里继续精修
选中文字后，工具栏“文字样式”或检查器“艺术文字效果”可选择原色、描边、错位轮廓、渐变、渐变描边、投影，并调整颜色与轮廓宽度；仍是同一个可编辑 text 节点，不生成不可编辑的截图。

## 修改整段艺术标题
text.lettering 创建后，普通字位属性仍用 layer.update；需要改变整段内容、增减字数或重排字距时用 text.reflow。例：
```json
{"op":"text.reflow","target":"title","content":"再去看看","gapMm":1.1,"letters":[{"index":1,"style":{"color":"#B46345"},"rotationDeg":5}]}
```
已有字位按索引保留身份与未覆盖的样式，新字位获得独立 ID；指定 style 的字段才统一覆盖。普通单字已被用户接管/锁定时，AI 不可借整体重排覆盖。字体能力以 fonts 实际报告为准。
