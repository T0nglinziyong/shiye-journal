# 可编辑艺术字、文字图形化与轻手绘

**字体决定字形，效果决定处理方式。** 单字本来就可用 text.add；text.lettering 便于一次建立整组、每字不同字体或效果。保持统一色彩/方向，避免每字都用完全不相关的处理。大标题、单字、正文块也能独立撑起素材少的页面。

先运行 `node runtime/shiye.cjs fonts` 查看当前环境。fontPreset 是 serif/sans/rounded/hand 类别偏好，不保证机器里都有不同字体；fontFamily 是具体名称，必须确认实际可用。字体文件不打包、不上传；没有字体时换可用字体或保留普通文字，不假装生成了该艺术字体。

## 一字或一段：普通文字上直接做效果
通过相同 style 用于 text.add / text.update / layer.update。outline=null、gradient=null 清除对应效果，正文仍可改。

```json
{"op":"text.add","id":"accent-word","content":"试","place":{"reference":"page","at":[45,40],"unit":"mm"},"size":{"width":24,"unit":"mm"},"style":{"fontSizePt":30,"fontPreset":"serif","fontWeight":"bold","color":"#426076","outline":{"color":"#D8B980","widthMm":0.6,"offsetMm":[0,0]}}}
```

- **同侧阴影**：style.shadow 的 offsetMm 方向一致。浅底用深字，模糊投影不能冒充描边。
- **完整描边**：style.outline，offsetMm=[0,0]；围绕字形所有边缘，stroke 后 fill 保留实字。
- **偏移轮廓**：同一个 outline 设置 offsetMm，例如 [.6,.8]，偏移方向一致，区别于模糊阴影。
- **真实渐变**：style.gradient 的 stops 从 0 到 1 严格递增；角度 0 为横向，90 为纵向。只改变字形内部颜色，不是把两段文字错位叠加。

```json
{"op":"text.update","target":"accent-word","style":{"gradient":{"angleDeg":90,"stops":[{"offset":0,"color":"#C77A58"},{"offset":0.5,"color":"#9A7BA3"},{"offset":1,"color":"#526E9C"}]},"outline":{"color":"#EFE4D1","widthMm":0.5,"offsetMm":[0.5,0.7]}}}
```

## 逐字变化：不用人工计算所有字的位置

```json
{"op":"text.lettering","id":"small-title","content":"去看看","place":{"reference":"page","at":[70,25],"unit":"mm"},"gapMm":0.5,"style":{"fontSizePt":24,"fontPreset":"hand","color":"#35516A"},"letters":[{"index":0,"style":{"fontPreset":"serif","outline":{"color":"#D6B365","widthMm":0.6}}},{"index":1,"rotationDeg":-4,"offsetMm":[0,1]},{"index":2,"style":{"gradient":{"angleDeg":90,"stops":[{"offset":0,"color":"#BC7955"},{"offset":1,"color":"#7A719A"}]}},"rotationDeg":3}]}
```

运行时生成普通 Group 与 small-title-g1/g2/g3 文本节点；仍可独立编辑，或整体移动。index 按 Unicode 字素计数，不拆组合音标。只用于短标题，不替代连写语言的整词 shaping，也不自动保证所有字体有全部字形。已知宽高是确定性估算，必须实际预览。

## 小背景、圈点、条纹与跨边
普通字也可借局部小背景获得层次：先放文字，再创建 shape.add 的 dots/stripes/ellipse/frame 等于后方。小背景围绕**所选文字**，不铺满全页；数字形状可以自由调整尺寸，不改变实物。

## 目标导向的下划线、高亮、括号

```json
{"op":"draw.decorate","id":"word-underline","target":"accent-word","kind":"underline","style":{"color":"#8B9E74","strokeWidthMm":0.6},"seed":42}
```

kind 可为 underline/highlight/bracket；可选 size/place/style/order 和 seed。默认下划线放在目标下方、高亮放在目标后方，生成普通可编辑 ink。用来解决强调或连接，不是每段都必须有。highlight 不自动识别句中词语：先把关键词设为单独单行文本框。标记跟随位置，文字标记尺寸按创建时排版估计，其他对象按目标框；目标大幅改字后重建或修改 geometry。

图形、笔迹可以是页面主体，不止这些小标记：素材少时用 vector.add 绘制主图形，shape.add 构建大色块/边框和区域关系，ink.add 画更自由的路径。不要把一页稀疏文字加几条高亮误认为完整构图。
