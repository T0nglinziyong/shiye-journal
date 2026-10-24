> 当前绘画入口已统一为 graphic.add，点缀是构图作用；旧绘画命令不再接受。具体字段与边界见 unified-graphics.md 和实际 describe。

# 当前操作与能力覆盖

旧名称仅列在此迁移说明，不是别名，不接受旧参数。唯一外部入口为协议 2 当前注册表；无 native.*，无第二个事务解析器。

| 原先能力 / 操作组 | 当前等价表达 |
|---|---|
| material.add / tool.place_materials / tool.upsert_materials | material.add + 公共 place/style/order；修改用 layer.update，来源替换用 material.replace |
| text.add / tool.upsert_text / layer.update | text.add / layer.update / layer.update；相同 size/style/content 经同一重排 |
| shape.add / tool.upsert_primitives | shape.add / vector.add / ink.add；几何更新 layer.update.geometry |
| ink.add | ink.add；压感、笔形、线宽、局部点和世界定位分离 |
| material.process / tool.edit_materials | crop、trim、diagonal、contour、edge、window、mask、restore；加工步骤不直接暴露内部 snake_case |
| material.craft / tool.apply_craft_plan | 同一原子 operations 中 add→split→window→weave/relate；运行时推导 sourceRevision、占用、余料和 commandId；无需模型填完整 plan |
| material.tape / tool.draw_tape_strips | material.tape 的 lengthMm 或 path、widthMm、texture、caps、place；折线不丢中间点 |
| material.glyphKnockout | material.glyphKnockout(text,style,place) 或 region 数值轮廓 |
| layer.replaceMaterial | material.replace，保留中心、层级，使用新来源真实尺寸 |
| layer.repeatStamp | layer.repeat，copies 使用普通 place/size/style/order；数字图形独立身份 |
| layer.reuseLayout | layout.reuse 引用已有组并显式 materialMap；外部模板改为 group.compose 的统一子命令，不接受原始 Scene 快照作操作 |
| group.transform / tool.move_elements | layer.update，用显式旋转空间、参考锚点和偏移表达；不暴露任意矩阵或缩放真实素材 |
| group.create / tool.group_elements | group.create 或 group.compose，真实空间树 |
| group.ungroup / tool.ungroup_elements | group.ungroup，保持世界位置 |
| layer.move / tool.align_elements / tool.arrange_elements | layer.reparent/reorder/place + layout.align/arrange |
| tool.fit_text_to | text.fit，size 可以相对 node:<id>，字号范围明确且不丢正文 |
| tool.style_elements | layer.update.style，按真实节点类型校验 |
| layer.insert / scene.compose / tool.compose_page | 各类 add + group.compose；不暴露 raw node/整页任意字段覆盖 |
| layer.delete / tool.delete_elements | layer.delete，linked 引用策略明确 |
| page.update / tool.set_paper | page.update：纸色、图案、rulingMm、中缝；尺寸为任务硬约束 |
| material.decision / tool.finish_design | material.decision + 实际 preview/review/pack；不伪造审美通过 |

若能力要扩展，只修改当前 spec 与处理器，添加真实 Command/Scene/PNG 测试。不得重新引入 native 名称或把旧参数藏在 arguments/set 里。内部仍可调用已有生产几何算法，它们不是外部协议兼容层。
