# 图形与绘画：一个入口，一套参数

只有 `graphic.add` 创建图形与笔迹；后续使用 `layer.update`。不存在“点缀命令”：文字、材料、胶带和绘画都可能承担主视觉、连接、注释或点缀，作用由构图决定。

## 公共参数
- geometry：要画的几何。预设 kind 如 rect/ellipse/star/sparkle/flower/dots/bracket；`sketch` 直接生成可编辑手绘线形；自由 SVG 使用 path；压感笔迹使用 stroke。
- place：唯一定位入口。页面毫米、比例、相对对象或父组的锚点/偏移均沿用原定义，不另设 target/placement。
- size：统一宽高与 mm/ratio；ratio 明确 reference。预设和 path 必须给 size；stroke 可省略使用毫米点集本身的尺寸。单维通常保留比例，横/竖直笔迹的零跨度轴保留笔宽，不能从一条线拉出曲线。
- style：填充用 fill，线条和笔迹都用 stroke，线宽 strokeWidthMm。opacity/blendMode/shadow 共用；penStyle 用于笔迹，填充和虚线等用于图形。不适用字段会报错，不默默忽略。
- parent、order：组合归属与同级先后。相对定位并不自动改变父组；order.before/after 必须指向同级对象。

`describe graphic.add` 是短帮助；`describe geometry` 查看几何形式，`--full` 才获取完整 Schema。以下都是操作片段，引用名称须换成本次实际存在的节点。

### 从素材取图形，而不是给素材贴图形
先问实物里最有辨识度的是轮廓、局部颜色、运动方向，还是印刷字的节奏。先从其中一个特征做**组织画面的图形**：沿真实纸边或物件动作方向的一段笔迹、跨过两件素材交界的局部色带，或回应印刷孔洞/纽扣的一组大小有别的圈线。大书写面优先使用已有真实纸片；不要用与素材无关的大浅色圆角/椭圆把一页变成界面卡片。随后在另一区域用局部圈线/荧光回应具体字句；只有小圈和短线时，主结构仍可能只是素材陈列。要强调一句话，用短 marker 放在字后，`order.before` 指向该文字；把图形锚定在相关 `node:<id>`，材料或文字移动后关系才容易保持。粗大的预设箭头容易像演示文稿，若视觉语气是随手记录，优先试少量点构成的轻笔迹并在真实 PNG 上比较。一个图形也可以不闭合、不居中、不完整露出；不能因预设形状省事就让它与实物无关。

首个图形若显得像流程箭头，换**用途**而不只换颜色：在纸边试不闭合的 `sketch.corner`，圈出实物局部试 `sketch.loop`，沿照片下沿试 `sketch.underline`，回应票边或衣物节奏试 `sketch.scallop`；需要跨纸边阅读路线用 `sketch.trail` 的断续五笔，回应纽扣、花束或印刷星点用 `sketch.rays` 的不等长七笔。`seed` 固定手绘扰动；相同输入可重复渲染。这些线形直接编译成可编辑 path，与 `graphic.add` 的 place/size/style/order 共用，不另开工具文件。改变 size、旋转和锚点，让它们贴合**本次素材**；不要把示例坐标套在每一页。例如：
```json
{"op":"graphic.add","id":"photo-edge","geometry":{"kind":"sketch","motif":"corner","seed":23},"place":{"reference":"node:photo","at":[0.04,0.05],"unit":"ratio","rotationSpace":"reference","behavior":"linked"},"size":{"width":40,"height":30,"unit":"mm"},"style":{"fill":null,"stroke":"#799897","strokeWidthMm":0.55},"order":{"after":"photo"}}
```

## 同一个星形：既可做主图，也可做小呼应
主图使用页面位置和较大尺寸：
```json
{"op":"graphic.add","id":"main-star","geometry":{"kind":"star"},"place":{"reference":"page","at":[65,65],"unit":"mm"},"size":{"width":50,"height":50,"unit":"mm"},"style":{"fill":"#E8CC88","stroke":"#526E65","strokeWidthMm":0.5}}
```
同一图形在某段文字旁变小，改变的是公共参数，不是 Command：
```json
{"op":"graphic.add","id":"small-star","geometry":{"kind":"star"},"place":{"reference":"node:caption","referenceAnchor":"top-right","anchor":"bottom-left","offset":{"value":[2,-2],"unit":"mm"},"rotationSpace":"reference","rotationDeg":0,"behavior":"linked"},"size":{"width":7,"height":7,"unit":"mm"},"style":{"fill":null,"stroke":"#8B9E74","strokeWidthMm":0.45}}
```

## 圈出一块区域：仍是普通椭圆
用显式参考比例决定圈线尺寸，明确边框与填充。
```json
{"op":"graphic.add","id":"ring","geometry":{"kind":"ellipse"},"place":{"reference":"node:caption","referenceAnchor":"center","rotationSpace":"reference","rotationDeg":0,"behavior":"linked"},"size":{"reference":"node:caption","width":1.1,"height":1.15,"unit":"ratio"},"style":{"fill":null,"stroke":"#B38652","strokeWidthMm":0.5}}
```
`size.reference` 默认一次求值；设置 size.behavior="linked" 后，比例尺寸持续跟随参考对象。place.behavior 独立控制位置跟随。尺寸与位置依赖统一进行循环检测；不可用该机制缩放实体材料或整个组。当前测量的是布局框，不假装识别关键词或字形像素边缘。

## 自由笔迹与高亮：保留真实点与压感
```json
{"op":"graphic.add","id":"mark","geometry":{"kind":"stroke","unit":"mm","points":[{"x":0,"y":0,"pressure":0.3},{"x":12,"y":0.7,"pressure":0.6},{"x":25,"y":0,"pressure":0.4}]},"place":{"reference":"node:caption","at":[0.5,0.4],"unit":"ratio","rotationSpace":"reference","rotationDeg":0,"behavior":"linked"},"style":{"stroke":"#E8D66B","strokeWidthMm":4,"penStyle":"marker","opacity":0.4,"blendMode":"multiply"},"order":{"before":"caption"}}
```
高亮只是这条笔迹的用途。先选值得强调的内容并确保文字在上方；不会自动查找句子中的某个词。自由手绘、曲线、圈线也可提供自己的 points；笔形可选 ballpoint/fountain/brush/pressure/marker，效果以实际预览为准。

## 自定义矢量：同一入口，多路径可编辑
```json
{"op":"graphic.add","id":"leaf-mark","geometry":{"kind":"path","viewBox":[0,0,20,30],"paths":[{"d":"M2 28 C1 12 10 2 18 2 C19 18 10 28 2 28 Z","style":{"fill":"#8B9E74"}},{"d":"M2 28 L15 6","style":{"fill":null,"stroke":"#E7EDDF"}}]},"place":{"reference":"page","at":[95,130],"unit":"mm","rotationDeg":15},"size":{"width":15,"unit":"mm"},"style":{"strokeWidthMm":0.5}}
```
paths 的点位使用自身 viewBox，不是页面坐标；place/size 负责页面上的整体位置与大小。

## 修改与清除
```json
{"op":"layer.update","target":"main-star","geometry":{"kind":"ellipse"},"size":{"width":42,"height":28,"unit":"mm"},"style":{"fill":null,"stroke":"#526E65","strokeWidthMm":0.7}}
```
图形可在预设与 path 间替换，旧路径会真正清除。stroke 更新同样使用 geometry.kind=stroke 与相同 points。不会把有压力的 ink 节点隐式变成 shape；跨 Scene 类型转换需要重新创建数字对象，避免丢笔迹语义和编辑权限。

## 创作判断，而非装饰配额
先看局部缺什么：联系、强调、方向、重心还是内容。适合小贴纸就使用真实素材，适合短句就写文字，适合图形才用 graphic.add；没有改善就删。点缀阶段是设计判断阶段，不是 API 类别。所有效果用真实 preview 验证；不可用数个小圆填补缺少主块的大片空白。

## 图形也可有艺术外观
style.outline 与文字同样使用 color、widthMm、offsetMm，style.gradient 使用 angleDeg 和从 0 到 1 的 stops；null 清除。普通图形渐变填在几何内，笔迹渐变沿笔迹图形上色，outline 是外观而非改变来源/路径。自定义 path 的局部显式 fill 优先于全局渐变，需要统一渐变时省略局部 fill。

大小、描边、渐变、透明度与形状可灵活组合。不要因“只是点缀”把所有图形缩成同样小的单色符号；主体图形和较大的图文连接同样有价值。复制后改参数用 layer.duplicate + layer.update，不建立点缀专用接口。

图形渐变作用于已有填充；fill 为 null 时作用于描边/线条，不把空心图形暗中填满。SVG 子路径显式的 fill/stroke 仍优先。文字、图形、笔迹的检查器共用效果面板；效果不替代原始几何或笔迹压力。
