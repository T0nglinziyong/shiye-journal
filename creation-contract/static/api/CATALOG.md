# 操作索引（自动生成）

来自 api/operations.json。协议定义不等于运行时已实现。发布时必须与 capabilities 取交集。

- `material.add`：放置实体素材，保持来源与物理尺寸。 详情：`describe material.add`。
- `text.add`：创建可编辑文字；位置与字号使用公共参数。 详情：`describe text.add`。
- `text.update`：局部修改正文或通用布局/外观。 详情：`describe text.update`。
- `shape.add`：添加独立可编辑几何图形。 详情：`describe shape.add`。
- `vector.add`：添加可编辑多路径图案，不栅格化。 详情：`describe vector.add`。
- `ink.add`：创建保留笔迹几何的可编辑笔画。 详情：`describe ink.add`。
- `layer.place`：以统一位置协议摆放任何空间节点，包括 Group。 详情：`describe layer.place`。
- `layer.update`：局部修改通用属性，不允许透传任意 Scene 字段。 详情：`describe layer.update`。
- `layer.reparent`：改变父节点，默认保持世界位置。 详情：`describe layer.reparent`。
- `layer.reorder`：调整同一父节点内的绘制顺序。 详情：`describe layer.reorder`。
- `layer.delete`：删除节点；不隐式解除实体裁切消费。 详情：`describe layer.delete`。
- `group.create`：把既有同级节点编为组，保持世界位置。 详情：`describe group.create`。
- `group.compose`：先在局部空间创建组合，再整体摆放。 详情：`describe group.compose`。
- `group.ungroup`：解组并保持后代世界变换与绘制顺序。 详情：`describe group.ungroup`。
- `material.crop`：裁切可用材料区域，保持来源坐标。 详情：`describe material.crop`。
- `material.window`：切除内部区域，并可保留窗芯。 详情：`describe material.window`。
- `material.split`：用源坐标区域分出可寻址裁片。 详情：`describe material.split`。
- `material.mask`：非破坏性显示遮罩，不产生可复用余料。 详情：`describe material.mask`。
- `material.weave`：让一根真实纸条依次通过指定的真实开口。 详情：`describe material.weave`。
- `material.tape`：从校准胶带素材截取一段。 详情：`describe material.tape`。
- `material.edge`：对实体边缘做确定性的工艺处理。 详情：`describe material.edge`。
- `material.decision`：记录本次素材取舍理由，不替代实际使用检查。 详情：`describe material.decision`。
- `layout.arrange`：对一组对象执行水平、垂直或网格布局。 详情：`describe layout.arrange`。
- `layout.detach`：解除指定对象的持续布局约束，保持当前位置。 详情：`describe layout.detach`。
- `page.update`：更新页面视觉配置或尺寸，受任务硬约束限制。 详情：`describe page.update`。
