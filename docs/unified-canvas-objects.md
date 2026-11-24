# 统一画布对象操作

画布操作的完整合同从 `creation-command-spec.js` 生成，作为创作模型的固定输入；公共参数定义只发送一份，所有受主机支持的工具从首轮可用。`creation_help` 用于诊断重查，不是执行操作的前提。技巧库仍可用于选择复杂的创作配方。

## 创建与修改

`material.add`、`paper.add`、`title.add`、`text.add`、`graphic.add` 可以放在同一 `creation_apply.operations` 中。公共字段为 `id/place/size/style/order`，各对象只接受适用字段；真实素材不能通过 size 缩放。新建未指定 place 时进入 tray；组合内部新建对象默认在父组局部中心。组合已有对象不改变原位。

所有常规修改使用 `layer.update`，对象编号写 target，只写变化字段。嵌套对象按字段合并，数组整体替换；允许 null 的效果用 null 清除。标题整体的内容、宽度、字体、字效、字后底形可直接修改，无需查找子文字。改标题正文时，如果此前指定 runs，需同时提供新的 runs 或 runs:null，避免保留拼不成新句子的词组。

```json
{"op":"title.add","id":"heading","content":"今天出门","size":{"width":70,"unit":"mm"},"style":{"fontSizePt":26,"color":"#354C60"},"effect":"outline"}
{"op":"layer.update","target":"heading","effect":"offset-outline","style":{"fontSizePt":30}}
{"op":"paper.add","id":"paper","size":{"width":65,"height":90,"unit":"mm"},"style":{"fill":"#CADCE5"},"texture":"rough","edge":{"style":"torn","edges":["bottom"],"seed":42}}
{"op":"layer.update","target":"paper","edge":{"roughness":0.6},"pattern":"ruled"}
```

标题仍保存为可编辑子图层。整体重排遵循原有人工修改、锁定和外部 linked 引用保护；不能覆盖用户接管的子对象。数字纸保存原始纹理框，裁片的可见轮廓作为摆放锚点，纹理不会因裁切而重新生成。

## 分片、裁切和解组

`layer.split` 支持实体素材与生成纸张；split.through 指定局部经过点，unit 是 mm 或 ratio，rotationDeg 为顺时针方向角，0 水平、90 竖直。直线自动延伸到两侧边界；edge.style 为 clean 或 torn。两片共享同一切口，无重复材料。pieces[0] 在有向线叉积为正的一侧（水平方向向右时为下方），pieces[1] 为另一侧。

```json
{"op":"layer.split","target":"paper","split":{"through":[0.5,0.45],"unit":"ratio","rotationDeg":30,"edge":{"style":"torn","seed":42}},"pieces":[{"id":"a","place":{"reference":"page","at":[15,35],"unit":"mm","anchor":"top-left","rotationDeg":-5}},{"id":"b","place":{"reference":"page","referenceAnchor":"bottom-right","anchor":"bottom-right","offset":{"value":[-12,-15],"unit":"mm"},"rotationDeg":3}}]}
```

`layer.cut` 接受与实体裁切相同的 region/mode，支持数字纸。矩形、椭圆 region 可提供 rotationDeg，绕区域中心旋转；角度以物理毫米空间计算。需要两个输出时用 layer.split；多块自定义实体区域仍可 material.split。矩形框、任意路径、半平面等完整参数在固定说明中列出。

`group.ungroup` 的 pieces 使用相同的 id/place/order，每项 id 是原直接子对象编号；只调整列出的部分，其他部分保留原位。解组不裁剪对象，分片不等于解组。拆出的部分可单独移往待放区。

```json
{"op":"group.ungroup","target":"group1","pieces":[{"id":"paper","place":{"surface":"tray","reference":"page","at":[50,50],"unit":"mm"}},{"id":"caption","order":{"edge":"front"}}]}
```

已有对象修改、分片、解组时，省略 place/order 保留位置和层序。明确给出 page 位置时进入页面；只改旋转角度保留原工作空间。`material.split` 直接从 asset 取新料时，未摆放的部分留在 tray。

## 验证

`tests/creation-unified-objects.test.js` 验证默认待放、稀疏修改、标题效果与位置保留、解组独立摆放、实物分片面积守恒、原子回滚、数字纸连续纹理数据、旋转裁切、可见轮廓锚点与 linked 跟随。

`node scripts/verify-unified-canvas.mjs /tmp/shiye-unified-canvas` 生成真实渲染的工具验收图及 Scene。它验证执行能力，不是 DeepSeek 自主创作效果测试。

## 2026-11-24 真实调用验收

使用已授权的八件自有素材，经真实 DeepSeek（deepseek-flash）自主选择参数和工具完成一次功能示范。任务额外要求斜撕纸张、独立摆放、局部修改和解组；这是操作验收，不是与旧版本同提示词的画质对照。用时 309.7 秒、12 轮，完成交付。前两轮各发生一次请求超时后重试；不能把全部耗时归因于工具说明长度。

模型成功使用 paper.add → layer.split → layer.update.texture、group.ungroup 和独立子对象摆放。发生三次失败尝试：逐字标题 7 字却给出 index=7、place 同时提供 at 与 referenceAnchor、纸片超出单页可容纳尺寸。前两项拒绝事务，尺寸错误也未交付无效作品。逐字标题诊断现明确返回实际字素数和合法下标；新增回归验证整批回滚。

仍未通过接口简洁性验收：当前 39 个画布操作不等于 39 个独立 function tool；普通运行另暴露 21 个 function tool。标题存在 title.add、text.lettering 和专用包装入口等相近选择。模型选择 text.lettering 后，为统一改色又逐个修改七个字，未验证 title.add 的自主选用。下一步应合并重复的模型侧入口，保留底层能力并统一对象操作；不能以更名分组冒充数量减少，也不能宣称本次已完成该重构。现阶段未上线。
