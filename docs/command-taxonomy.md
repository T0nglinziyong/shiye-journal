# Command 分类与丰富创作

## 原则与范围

共享字段与类型，不混淆语义。不是把所有操作塞进一个巨大 update，也不为同一行为保留多个名字。当前创作包公开 **30** 个操作；运行时管理工具仍单独计数。已有 Scene 的 shape/ink/text/material/group 不替换、不栅格化；新字段是可选数据。旧命令事务明确拒绝，使用新包须重新导出。

| 分类 | 当前边界 |
|---|---|
| 创建 | material.add、text.add、graphic.add；三种核心内容 |
| 普通修改 | layer.update：content/geometry/style/size/place/order 等已存在节点属性 |
| 结构 | layer.reparent/delete/duplicate、group.*；不把任意子树或来源字段塞进 update |
| 艺术标题 | text.lettering 创建、text.reflow 改正文/字位/字距；会增删子节点，所以不是 update 别名 |
| 非破坏性显示 | layer.mask：replace/intersect/subtract/clear；包括实体素材，但绝不释放材料 |
| 真实裁切 | material.cut：region+keep/remove；命名孔洞、多个独立裁片继续使用 window/split |
| 专业工艺 | tape/edge/contour/weave/glyphKnockout/replace/restore/relate 保留实际来源语义 |
| 布局/纸张 | layout.arrange/align/detach 与 page.update；material.decision 仍是取舍记录 |

移除：text.update、layer.place、layer.reorder、material.mask、material.crop/trim/diagonal、layer.repeat、layout.reuse。无兼容别名或旧命令转译器。普通更新始终共用同一 Scene 属性、布局、权限与事务内核。

## 裁切与显示

`material.cut` 的 region 包括 rect/ellipse/polygon/path/geometry/edge/halfPlane；单位和 source/local 坐标共用。mode 显式 keep/remove。默认在原有素材局部坐标框内更新真实轮廓，不新增可用余料；需要独立裁片/紧包围框时提供新 resultId；keepRemainder=true 必须有 resultId。原目标会被消耗并产生合法来源记录。空结果、过小裁片、无许可裁切、占用冲突回滚。

命名孔用于穿插，不由普通 cut 暗中重编号；需要多个独立区域时用 split。layer.mask 的 clear 只删除显示遮罩，不能恢复被剪掉的实体。数字节点使用 local，素材还支持 source 映射；笔迹遮罩仍先编组。

## 图形与笔迹外观

`style.outline`、`style.gradient` 与文字使用相同公开字段和单位。shape 的原生保存字段为 graphicOutline/graphicGradient，ink 同样保留压力点；Scene 单位只存在存储边界。outline 为真实完整/偏移轮廓，gradient 为真实填色；有填充时作用于填充，无填充时作用于描边/线条。SVG 子路径明确指定颜色时仍优先。null 清除。

共享 Canvas/Node Canvas/Fabric 原生矢量投影和导出使用同样几何。为避免不同 SVG 后端对 non-scaling-stroke 的差异，轮廓使用派生的物理坐标绘制，曲线保留为曲线（圆弧转换为分段三次贝塞尔），而非修改源路径或用贴图冒充可编辑对象。文字、图形、笔迹检查器复用同一个效果面板；素材不支持这些数字绘制效果。

## 尺寸 linked

`size:{reference,unit:"ratio",width?,height?,behavior:"linked"}` 保存尺寸依赖；缺省/once 仍一次求值。`place.behavior` 与 size 的行为独立；layout.detach 可指定 scope=place/size/all。重新设定一次性尺寸只解除尺寸跟随，人工拉伸也解除尺寸约束而保留位置关系；align/arrange 只解除主动定位。

图依赖包含父级、位置与尺寸，拒绝自引用、混合环、无稳定布局框的父级参考、锁定和手工接管的间接受影响节点。先计算上游尺寸与文字重排，再定位和求解下游；没有固定点迭代。只支持 text/shape/ink，不隐式缩放实体素材或组合。文字高度仍是最小高度，不裁掉正文；text.fit 是显式一次性排字，不接受 linked 后默默忽略。

## 通用复制

layer.duplicate 支持文字、图形、压感笔迹和组合。所有节点独立新身份，内部链接与标题字位引用重映射；外部关系解除，保留当前外观。parent 省略沿用原父级，null 表示页面根级，世界/父级坐标正确换算。复制是读取原稿，不要求抹掉手工接管，但仍禁止复制锁定内容。

包含实体时 materialMap 按原素材节点 id/别名映射到本次任务合法素材 alias，使用新来源的完整物理尺寸，不能照搬原裁片蒙版或制造库存。没有授权标记继承。胶带须显式取段，不由复制偷取新库存。

## 艺术标题整体重排

text.reflow 只用于带 lettering 元数据的艺术标题组。正文增减保持已有字位 ID，新增字位单调编号不复用，移除被引用字位会拒绝。省略样式时保留逐字差异；显式公共样式修改所有字位，letters 再覆盖指定字位。字体预设替换正确清除先前指定字体，既影响旧字位也影响新字位。

位置、层级仍用 layer.update；改变整组字尺度用 text.reflow 的 style.fontSizePt，不给组合新增任意 scale。已有子树被人工拆散时可以继续普通编辑，但不再假装可自动重排。锁定/手工接管子节点不可被 AI 覆盖。

## 创作指导

不要吝啬装饰。默认目标是丰富而有主次的成稿，不是克制的展示板。结构和可读内容稳定后，应主动在人物旁、标题周围、纸张交界、段落转折、视觉空洞等多处尝试有意义的变化：小材料、允许使用的胶带、艺术字、圆圈/星芒/图案、笔迹、色带、旁注都可采用。

通过实际 PNG 判断哪些保留、变化、删除；出现具体遮挡、拥挤、层级竞争或无关堆砌时才有针对性地精简。不是固定数目，也不以占画面比例判断美观。素材不足时主动以文字和图形承担主块，而不是用碎点填大片空白。不新增 decoration 接口。

## 验证与未承诺

专项测试：旧入口拒绝、共享字段、真实来源/余料、两种 mask、效果像素、创建/更新/清除、尺寸依赖和循环、人工/锁定保护、子组坐标、复制重映射、艺术标题增减与保存重开、相同样式一致性。实际浏览器测试检验像素、编辑性和效果面板。导出的真实创作包执行 check/apply/preview/pack 并比较同源哈希。

合成示例展示“结构→丰富细节”，不是自主 AI 审美 A/B；物理 iPad/Pencil 未在此测试。字体依赖宿主环境，不包含视频、私有素材或字体文件；不实现语义关键词查找、图像主体分割、任意路径排字、节点类型暗转或持续缩字适配。发布状态以最终准确提交的 CI 与 CloudBase 线上 SHA 校验为准。
