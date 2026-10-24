# 常用局部配方（自动生成）

这些是 operations 中的单条操作，不是完整任务，不承诺满足本次全部必用素材要求。
`m1`、`m2`、`photo` 等为角色示例；先通过 TASK/inspect 确认真实别名与图层 ID。
不得把配方当成事实来源，也不要省略任务硬约束。事务外壳由 begin 创建，禁止复制旧 Scene 哈希。

## material.add

放置实体素材，保持来源与物理尺寸。

```json
{
  "op": "material.add",
  "id": "photo",
  "asset": "m1",
  "place": {
    "reference": "page",
    "at": [
      50,
      60
    ],
    "unit": "mm",
    "anchor": "center"
  }
}
```

- 运行时分配真实素材单元；不可默认复制已占用单元。
- asset 是 TASK/manifest 中的短别名，不是图片路径。

## text.add

创建可编辑文字；位置与字号使用公共参数。

```json
{
  "op": "text.add",
  "id": "caption",
  "content": "今天的想法，写在这里。",
  "place": {
    "reference": "node:photo",
    "referenceAnchor": "bottom-center",
    "anchor": "top-center",
    "offset": {
      "value": [
        0,
        4
      ],
      "unit": "mm"
    }
  },
  "size": {
    "width": 60,
    "unit": "mm"
  },
  "style": {
    "fontSizePt": 11,
    "color": "#333333"
  }
}
```

- 默认按 width 换行、自然高度；显式 height 不能偷偷裁掉正文。
- 文字排版用经过解析的字体配置，不使用设备像素设定字号。

## text.update

局部修改正文或通用布局/外观。

```json
{
  "op": "text.update",
  "target": "caption",
  "style": {
    "fontSizePt": 12
  }
}
```

- 只修改给出的字段；未给出的字段保留。

## shape.add

添加独立可编辑几何图形。

```json
{
  "op": "shape.add",
  "id": "dot",
  "kind": "ellipse",
  "place": {
    "reference": "page",
    "at": [
      20,
      20
    ],
    "unit": "mm",
    "anchor": "center"
  },
  "size": {
    "width": 5,
    "height": 5,
    "unit": "mm"
  },
  "style": {
    "fill": "#A8BCD5"
  }
}
```

- 样式中不适用于当前 kind 的字段返回错误，不得忽略。

## vector.add

添加可编辑多路径图案，不栅格化。

```json
{
  "op": "vector.add",
  "id": "triangle",
  "viewBox": [
    0,
    0,
    10,
    10
  ],
  "paths": [
    {
      "d": "M 0 10 L 5 0 L 10 10 Z",
      "style": {
        "fill": "#A8BCD5"
      }
    }
  ],
  "place": {
    "reference": "page",
    "at": [
      20,
      20
    ],
    "unit": "mm",
    "anchor": "center"
  },
  "size": {
    "width": 10,
    "height": 10,
    "unit": "mm"
  }
}
```

- 路径仅允许已声明的 SVG 路径数据语法；禁止脚本、外部资源引用。
- viewBox 的宽高必须为正，运行时检查。

## ink.add

创建保留笔迹几何的可编辑笔画。

```json
{
  "op": "ink.add",
  "id": "underline",
  "points": [
    {
      "x": 0,
      "y": 0
    },
    {
      "x": 30,
      "y": 1
    }
  ],
  "unit": "mm",
  "place": {
    "reference": "page",
    "at": [
      50,
      90
    ],
    "unit": "mm",
    "anchor": "center"
  },
  "style": {
    "penStyle": "marker",
    "strokeWidthMm": 3,
    "color": "#E8D66B"
  }
}
```

- points 位于笔迹自身局部空间；place 移动整个笔迹。
- style 必须含 strokeWidthMm、color；采用压力算法版本必须入 Scene。

## layer.place

以统一位置协议摆放任何空间节点，包括 Group。

```json
{
  "op": "layer.place",
  "target": "caption",
  "place": {
    "reference": "node:photo",
    "referenceAnchor": "bottom-center",
    "anchor": "top-center",
    "offset": {
      "value": [
        0,
        4
      ],
      "unit": "mm"
    }
  }
}
```

- 先完成尺寸与旋转，再对齐锚点。
- 默认 once；linked 必须持久化约束并进行循环检测。

## layer.update

局部修改通用属性，不允许透传任意 Scene 字段。

```json
{
  "op": "layer.update",
  "target": "caption",
  "style": {
    "opacity": 0.9
  }
}
```

- 无修改字段的空更新拒绝。
- 深层部分更新；数组整值替换；null 默认非法，清除约束使用 layout.detach。

## layer.reparent

改变父节点，默认保持世界位置。

```json
{
  "op": "layer.reparent",
  "target": "photo",
  "parent": "card",
  "preserveWorld": true
}
```

- parent:null 表示页面根；禁止自包含与树循环。
- Mlocal_new = inverse(Mparent_new_world) * Mworld_old。

## layer.reorder

调整同一父节点内的绘制顺序。

```json
{
  "op": "layer.reorder",
  "target": "caption",
  "order": {
    "after": "photo"
  }
}
```

- before/after 必须是同级节点；跨组遮挡需重分组或专用穿插结构。

## layer.delete

删除节点；不隐式解除实体裁切消费。

```json
{
  "op": "layer.delete",
  "target": "dot",
  "dependentLinks": "reject"
}
```

- 默认拒绝非空组删除与仍有 linked 引用的对象。
- 删除不等于撤销裁切；恢复材料使用事务 undo。

## group.create

把既有同级节点编为组，保持世界位置。

```json
{
  "op": "group.create",
  "id": "card",
  "targets": [
    "photo",
    "caption"
  ]
}
```

- 不连续同级节点的打组可能改变遮挡，必须返回诊断；默认拒绝改变既有遮挡关系的重排。
- 未指定 place 时，保持所有子节点世界矩阵。

## group.compose

先在局部空间创建组合，再整体摆放。

```json
{
  "op": "group.compose",
  "id": "card",
  "layoutBox": {
    "width": 90,
    "height": 100,
    "unit": "mm"
  },
  "children": [
    {
      "op": "material.add",
      "id": "photo",
      "asset": "m1",
      "place": {
        "reference": "parent",
        "at": [
          0.5,
          0.45
        ],
        "unit": "ratio"
      }
    },
    {
      "op": "text.add",
      "id": "caption",
      "content": "局部组合",
      "place": {
        "reference": "node:photo",
        "referenceAnchor": "bottom-center",
        "anchor": "top-center",
        "offset": {
          "value": [
            0,
            4
          ],
          "unit": "mm"
        }
      },
      "size": {
        "width": 60,
        "unit": "mm"
      }
    }
  ],
  "place": {
    "reference": "page.right",
    "at": [
      0.5,
      0.5
    ],
    "unit": "ratio",
    "rotationDeg": -4
  }
}
```

- children 复用同一 Command 定义，默认 parent 为本组。
- 禁止嵌套事务、page.update，以及修改本组外已有对象；不允许用 children 绕过权限。
- 组内按 parent 比例定位前必须有稳定 layoutBox；依赖排序和修改顺序规则见协议。

## group.ungroup

解组并保持后代世界变换与绘制顺序。

```json
{
  "op": "group.ungroup",
  "target": "card"
}
```

- 默认有指向本组的约束时拒绝，除非明确 detach。
- 应保持分组合成效果；非平凡组 opacity/mask/blend 无法无损展开时拒绝。

## material.crop

裁切可用材料区域，保持来源坐标。

```json
{
  "op": "material.crop",
  "target": "photo",
  "region": {
    "shape": "rect",
    "space": "source",
    "unit": "ratio",
    "box": [
      0.2,
      0.2,
      0.6,
      0.6
    ]
  },
  "keepRemainder": true
}
```

- 裁切是实体消费，结果和余料共享同一个 source 单元分区账本。
- 不改变已有可见区域在世界中的位置；可编辑几何不可仅存合成位图。
- keepRemainder 默认 true；false 表示废弃，不表示源区域重新可用。

## material.window

切除内部区域，并可保留窗芯。

```json
{
  "op": "material.window",
  "target": "photo",
  "region": {
    "shape": "ellipse",
    "space": "source",
    "unit": "ratio",
    "box": [
      0.2,
      0.2,
      0.6,
      0.6
    ]
  },
  "keepRemainder": true,
  "cutoutId": "window-core",
  "windowId": "hole-a"
}
```

- 裁切是实体消费，结果和余料共享同一个 source 单元分区账本。
- 不改变已有可见区域在世界中的位置；可编辑几何不可仅存合成位图。
- keepRemainder 默认 true；false 表示废弃，不表示源区域重新可用。

## material.split

用源坐标区域分出可寻址裁片。

```json
{
  "op": "material.split",
  "target": "photo",
  "pieces": [
    {
      "id": "strip-a",
      "region": {
        "shape": "rect",
        "space": "source",
        "unit": "ratio",
        "box": [
          0,
          0,
          0.5,
          1
        ]
      }
    },
    {
      "id": "strip-b",
      "region": {
        "shape": "rect",
        "space": "source",
        "unit": "ratio",
        "box": [
          0.5,
          0,
          0.5,
          1
        ]
      }
    }
  ]
}
```

- piece.id 是图层稳定 ID，来源单元不能重复分配。
- 目标完整形态被消费；剩余部分记录入材料账本；所有面积与交叠检查统一 epsilon。

## material.mask

非破坏性显示遮罩，不产生可复用余料。

```json
{
  "op": "material.mask",
  "target": "photo",
  "region": {
    "shape": "ellipse",
    "space": "local",
    "unit": "ratio",
    "box": [
      0,
      0,
      1,
      1
    ]
  },
  "mode": "intersect"
}
```

- mask 仅改变可见性，整片实体仍占用；不要把遮罩误当裁切。
- 严格实体模式是否允许纯数字遮罩，由 TASK.processingPolicy 明确决定。

## material.weave

让一根真实纸条依次通过指定的真实开口。

```json
{
  "op": "material.weave",
  "strip": "strip-a",
  "through": [
    {
      "target": "paper",
      "window": "hole-a",
      "sideAfter": "back"
    },
    {
      "target": "paper",
      "window": "hole-b",
      "sideAfter": "front"
    }
  ]
}
```

- 必须引用有几何与稳定 ID 的真实开口；不由运行时猜测交点或虚构开口。
- 渲染分段不等于复制实体材料；共享一份实体身份。
- 路径不连通、尺寸不足、语义含糊应报错，不近似伪造穿插。

## material.tape

从校准胶带素材截取一段。

```json
{
  "op": "material.tape",
  "id": "tape",
  "asset": "m2",
  "lengthMm": 30,
  "place": {
    "reference": "page",
    "at": [
      45,
      30
    ],
    "unit": "mm",
    "anchor": "center"
  }
}
```

- 宽度取素材校准值；长度消耗卷材库存。
- 平铺/抽取模式必须使用素材许可的连续纹理语义。

## material.edge

对实体边缘做确定性的工艺处理。

```json
{
  "op": "material.edge",
  "target": "photo",
  "edge": {
    "style": "torn",
    "roughness": 0.2,
    "seed": 42
  }
}
```

- 撕边必须改变源区域/材料账本；不能用绘制效果冒充真实裁片。
- 仅视觉装饰若需提供，应另设 style 效果，不复用实体 cut 语义。

## material.decision

记录本次素材取舍理由，不替代实际使用检查。

```json
{
  "op": "material.decision",
  "asset": "m1",
  "choice": "intact",
  "reason": "保留主体，与文字形成一个局部组合。"
}
```

- 必用素材不能 omitted；标记 intact 不代表素材确实出现在画面。

## layout.arrange

对一组对象执行水平、垂直或网格布局。

```json
{
  "op": "layout.arrange",
  "targets": [
    "photo",
    "caption"
  ],
  "container": "page.left",
  "rule": {
    "direction": "vertical",
    "gapMm": 4,
    "align": "center",
    "behavior": "once"
  }
}
```

- 测量文字和可见边界后排列；不以缩放实体素材解决容器溢出。
- linked 规则保存到 Scene；once 仅保存解算后的坐标。

## layout.detach

解除指定对象的持续布局约束，保持当前位置。

```json
{
  "op": "layout.detach",
  "target": "caption"
}
```

- 只删除该对象的主动定位/尺寸约束，不删除引用它的其他对象。

## page.update

更新页面视觉配置或尺寸，受任务硬约束限制。

```json
{
  "op": "page.update",
  "paperColor": "#FFFDF7"
}
```

- 无字段更新拒绝；任务锁定的纸张尺寸不可覆盖。
- linked 约束重新解算；once 位置不自动变比例。

