# 通用空间参数与组合树

## 1. 公共单位、参考和锚点

页面布局默认毫米；文字字号 pt；角度 degree。ratio 是相对参考框的无量纲比例，不是像素比例。
比例位置允许小于 0 或大于 1，用于有意出血；硬边界由任务语义检查。素材裁切的 source 区域则不得超出真实可用范围。

reference 使用明确命名空间：page、page.left、page.right、parent、node:<id>、region:<id>。
page.left/right 仅在 spread 可用；不是任意字符串静默回退。parent 在根节点上对应页面。区域必须是 Scene 中稳定、有尺寸的对象。

九点锚点：top-left/top-center/top-right/middle-left/center/middle-right/bottom-left/bottom-center/bottom-right。默认目标 anchor=center。

## 2. 两种互斥定位分支

点定位：reference＋at:[x,y]＋unit:mm|ratio。
锚点定位：reference＋referenceAnchor。
两者都可附加 offset、目标 anchor、rotationDeg、边界和行为；不能同时给 at 和 referenceAnchor，也不能在锚点分支留下一个无意义 unit。

mm at 从参考框左上角偏移；ratio at 为框内比例。
offset.value 是位移向量，不是第二个绝对坐标。offset.unit=ratio 时按参考框宽高换算；offset.space 决定位移向量沿 reference/page/parent 哪个轴，默认 reference。

同一对象的第二次 place 不改变其尺寸。rotationDeg 是所选 rotationSpace 下的目标角度，不是累计增量；rotationSpace 默认为 parent。需要增量旋转时应使用单独、明确的 transform 操作，不能让同名字段有时绝对、有时增量。

## 3. 旋转与边界

axes=reference：在参考对象局部方向上定位；axes=page：以参考对象投影到页面的轴对齐包围框定位。默认 reference。
referenceBounds/targetBounds 默认 layout；visible 指裁切、遮罩后的可见内容边界，默认不含阴影等无限延伸效果。组内 hidden/parked 节点不计 visible；空 visible 框须报错或由调用者显式选 layout。

visible 不是准确轮廓上的接触点。沿轮廓定位需要另一种明确的能力，未实现不得把包围盒近似称作 contour 精确定位。

先完成内容/字体测量与 size，再完成旋转，再计算双方锚点，最后解平移。先平移后旋转通常不能保持指定锚点重合。

## 4. 组合树和矩阵

World(node) = World(parent) × Local(node)。矩阵 `[a,b,c,d,e,f]` 定义 x'=a*x+c*y+e，y'=b*x+d*y+f。

将已有节点移入另一个组：LocalNew = inverse(WorldNewParent) × WorldOld。
解组：对子节点应用删除的父组局部矩阵，保持世界位置与顺序。零缩放等不可逆父矩阵必须拒绝。

组不是只用来维护 children 名单。组平移/旋转只更新其自身局部变换，不应每次改写所有后代；组可以嵌套。

归组可能改变非连续同级对象的前后穿插；默认仅允许保持既有遮挡关系的组合。跨多个层级前后交错的 weave 应在原生工艺语义中表达，不靠非法全局 zIndex 绕开树。

组 opacity、mask、blendMode 具有组级合成语义。将 opacity 分别乘到重叠子对象上通常不等价。解组若不能保持效果，应拒绝，不能声称“坐标保持”就等于“视觉保持”。

## 5. layoutBox 与内容 bounds 分离

layoutBox 是稳定的局部排版容器，不等于不断变化的子对象包围盒。可选的内容 bounds 自动计算。
子对象按 parent 的 ratio 定位时，父组必须有明确 layoutBox 或已解定、不循环的布局尺寸。禁止“父宽度由子位置确定，子位置又按父宽度 50%”的循环。

创建有已知局部构图的组后再放置整体，不需要 AI 计算整体宽高；运行时计算组合 layout/visible bounds。

## 6. size 与实体约束

size 接受 mm 或 reference＋ratio。宽高比 preserve 为默认；同时指定矛盾宽高不得偷偷拉伸。free 仅对允许的数字对象生效。text 使用宽度与字体排版，不从不存在的“原图宽高比”推算。
本候选基础契约不提供含糊的 cover 自动裁切。将来提供 fit/contain/cover 时必须区别数字缩放、文本重排与实体显式裁切。

父变换同样受到实体限制。应检查每个实体图层从源毫米到页面毫米的有效线性变换，不能只检查该节点的 scale 字段。平移、旋转、许可镜像可以；父组缩放、斜切、非等比变形不得绕过锁定尺寸。显示/导出 DPI 不属于物理变换。

## 7. once 与 linked

once：计算后保存局部变换，不再追随参考对象。
linked：约束保存进 Scene，布局编译器在相关变化后重算；重新加载也必须保持。

约束图包含父子变换、测量/尺寸和引用依赖。拒绝环和不一致规则；不只检查显式 A→B→A，还要检测“子相对自身祖先的自动内容框”反馈。

手动拖动 linked 对象的默认策略：更新已有约束偏移；明确解除才解除，UI 和 Command 保持一致。拖参考对象触发依赖重算。删除参考对象默认拒绝；显式 detach 时先烘焙当前结果再解除。

## 8. 已提供纯数学模块的边界

placement-math.cjs 已实现矩阵运算、重父级、包围框和锚点平移解算。
它要求调用者提供已解析参考框/矩阵、目标框和最终线性变换；不负责字体测量、解析 Scene、linked 求解、axes/bounds 提取、裁片或渲染。

本纯数学模块的输入输出统一毫米。适配器在读取原生 Scene 时换算为毫米，在写回时换回原生单位；每个边界只转换一次。公共毫米和 Scene canvas unit 的比例由页面物理尺寸明确确定，不能在 Command 编译与 renderer 中重复套用。
