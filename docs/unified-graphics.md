# 图形与绘画统一入口

对外只保留 graphic.add。geometry（预设 / path / stroke）、place、size、style、order、parent 与 layer.update 共用；不设置 target+placement 第二种定位语言，不创建 graphic.decorate 或“装饰对象”。文字、图形、素材、胶带都能承担点缀，决定如何使用它们属于 Skill 的构图判断。

运行时 graphic-geometry 直接创建或修改现有 Scene shape/ink 节点，未把请求翻译回旧 Commands。shape.add、vector.add、ink.add、draw.decorate 的公共注册与专门装饰生成器删除；旧事务明确拒绝，新创作包需重新导出。现有 Scene 格式不变，已有作品不被迁移/栅格化。

基本图形/自由矢量支持 fill、stroke、strokeWidthMm；自由笔迹同样使用 stroke/strokeWidthMm，映射到原生 ink 的 color/width 是存储边界，不是另一套公开字段。文字的 color 仍表示字身颜色。不同类型不适用的样式明确报错。

参考对象只在 place.reference 或 size.reference 中指定，两者分别负责位置与取尺寸；size 是本次求值，linked 仅持续跟随位置和旋转，未新增持续缩放图。没有自动关键词识别、周边位置默认、用途限定或隐藏的 parent 推断。

点集笔迹保留压力与局部旋转，可使用公共 size 缩放路径但不暗中放大笔宽。尺寸小于笔宽和把零跨度线拉成面都会明确报错。预设与 SVG path 可以交换几何，移除旧路径不留下覆盖；笔迹和 shape 不隐式转换节点类型。所有更新经过同一 Scene 内核、权限与事务检查。

Scope: 统一当前离线/网页 AI 创作包 Commands 与共享几何更新规则。应用内模型提供方既有内部工具合同、Fabric 输入采样和成熟原生图形/笔迹渲染仍复用，不谎称所有提供方协议一并重写。

测试覆盖：旧操作拒绝、参数 Schema、全部图形预设、创建/更新同字段、相对坐标/旋转父组/linked、压感与大小/独立线宽、路径清除、填充 null、权限/重复编号/回滚、真实 Canvas/Fabric 绘制、导出 ZIP 在 Node/Chromium 执行并重开。正常/绝对位置与主视觉/小图形只区别于参数值，不是不同 API。发布以准确提交 CI 为准，不把合成可视验证当成自主创作质量提升证明。
