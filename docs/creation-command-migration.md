# 创作命令能力映射（统一协议 2）

当前入口是 `node runtime/shiye.cjs`。外部只接受协议 2；25 个简洁操作与 39 个 `native.*` 原生操作都写入同一份 commands.json，经同一事务修改唯一 Scene。不存在协议 1 或 advanced.v1.* 的外部兼容分支。底层复用已验证的 Scene 原语，不为了接口改名重写材料几何和账本。

## 日常创作

| 操作 | 语义 |
|---|---|
| material.add / text.add / shape.add / vector.add / ink.add | 创建对象，统一 place / size / style / parent / order 中适用的参数 |
| text.update / layer.place / layer.update | 局部更新，与创建相同的参数语义；不重建整页 |
| layer.reparent / layer.reorder / layer.delete | 父级、同级层序与删除；维护 linked 依赖与世界位置 |
| group.create / group.compose / group.ungroup | 真正局部组合树；compose 可先创建，再在组内修订 |
| layout.arrange / layout.detach | 横向、纵向、网格的一次性排列；或解除对象的持续定位 |
| material.crop / split / window / mask / weave / tape / edge | 实体裁片、余料、窗芯、多孔穿插、胶带、撕边和非破坏性显示蒙版 |
| material.decision / page.update | 素材取舍与纸张颜色；不绕过任务物理约束 |

旋转使用 parent/page/reference 三种明确空间。省略角度时，已有节点保持当前世界角度，linked 会存下绑定时的角度偏移。相同 Scene 重复求解必须不变。自动排列不通过缩放真实素材解决溢出。

## 原生能力（完整保留，同一协议）

下面名称均加 `native.` 前缀调用，准确参数用 `describe native.<名称>` 获取：

```text
material.add                 material.process             material.craft
material.tape                material.glyphKnockout       material.decision
text.add                     shape.add                    ink.add
page.update                  layer.update                 layer.delete
layer.move                   layer.insert                 layer.replaceMaterial
layer.repeatStamp            layer.reuseLayout            group.transform
group.create                 group.ungroup                scene.compose
tool.compose_page            tool.place_materials         tool.draw_tape_strips
tool.edit_materials          tool.upsert_materials        tool.move_elements
tool.arrange_elements         tool.align_elements          tool.fit_text_to
tool.upsert_primitives        tool.upsert_text             tool.style_elements
tool.group_elements          tool.ungroup_elements        tool.delete_elements
tool.set_paper               tool.finish_design           tool.apply_craft_plan
```

原生层保持专业加工参数以避免功能退化；普通摆放优先使用简洁层，不需要 AI 构造来源修订号、矩阵或完整 Scene。能执行不等于全部参数组合已逐项完成跨浏览器人工视觉验收。

## 按需参数发现

`describe place/size/style/region/order/layoutBox` 返回公共参数，`describe <op>` 返回自包含的真实执行 Schema 与示例；它们与包内 commands.schema.json 来自同一注册表。RECIPES 固定为操作片段，通过 begin 获取本轮 transactionId/revision，不能复制历史事务。

## 验证与边界

空间14项和排列4项专项回归检查旋转漂移、手动移动、笔迹、重复求解和容器溢出；完整创建/修改、实体工艺、事务一致性和两种后端的导出包链路在项目测试中验证。结果以实际 CI 为准。

visible 精确轮廓锚点、region: 自定义布局区域和 linked 自动排列未发布。纸张几何由 TASK 固定。跨机器字体像素一致性与真机手写体验不可用合成测试代替。详见 creation-integration-status.md 与 creation-build-artifacts.md。
