# 统一图形入口 · 开发检查点

用户确认：点缀是一种构图作用，不是独立 Command；小素材、文字、胶带、图形和笔迹都可以承担点缀。禁止新建 graphic.decorate 或在新入口后隐藏旧命令适配器。

当前目标公共操作：graphic.add(id, geometry, place, size?, style?, parent?, order?)。geometry 同时用于 layer.update：预设 kind（ellipse/star 等）、path(paths/viewBox)、stroke(points/unit)。定位只用既有 place，参考尺寸只用 size.reference，不增加 target/placement。图形和笔迹颜色使用 fill/stroke、线宽 strokeWidthMm；所有后续位置、层级和属性仍调用共享 Scene 内核。

Scene 的 shape、ink、group 保留为原生可编辑对象，不增加 decoration 或 graphic 存储类型。已保存 Scene 不改写。旧 shape.add、vector.add、ink.add、draw.decorate 不在新公共注册表中保留别名；新包需要新导出。

本检查点时：本地已移除旧注册和点缀生成器，完成共享 geometry 和 stroke 样式映射，部分回归通过。尚在迁移所有示例、创作指导和端到端测试；不能把此文件当成已测试/已合并/已部署声明。最终以 PR 的准确提交和 CI 为准。
