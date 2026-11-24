# 统一画布对象操作

画布操作的完整合同由 `creative-agent/runtime/canvas-interface.mjs` 从底层对象合同生成，作为创作模型的固定输入；公共参数定义只发送一份，所有受主机支持的工具从首轮可用。`knowledge(action=help)` 用于诊断重查，不是执行操作的前提。技巧库仍可用于选择复杂的创作配方。

## 创建与修改

`create` 的 material、paper、text、graphic、tape 类型 可以放在同一 `creation_apply.operations` 中。公共字段为 `id/place/size/style/order`，各对象只接受适用字段；真实素材不能通过 size 缩放。新建未指定 place 时进入 tray；组合内部新建对象默认在父组局部中心。组合已有对象不改变原位。

所有常规修改使用 `update`，对象编号写 target，只写变化字段。嵌套对象按字段合并，数组整体替换；允许 null 的效果用 null 清除。组合文字整体的内容、宽度、字体、字效、字后底形可直接修改，无需查找子文字。改标题正文时，如果此前指定 runs，需同时提供新的 runs 或 runs:null，避免保留拼不成新句子的词组。

```json
{"op":"create","kind":"text","id":"heading","content":"今天出门","size":{"width":70,"unit":"mm"},"style":{"fontSizePt":26,"color":"#354C60"},"effect":"outline"}
{"op":"update","target":"heading","effect":"offset-outline","style":{"fontSizePt":30}}
{"op":"create","kind":"paper","id":"paper","size":{"width":65,"height":90,"unit":"mm"},"style":{"fill":"#CADCE5"},"texture":"rough","edge":{"style":"torn","edges":["bottom"],"seed":42}}
{"op":"update","target":"paper","edge":{"roughness":0.6},"pattern":"ruled"}
```

组合文字保存为可编辑子图层。整体重排遵循原有人工修改、锁定和外部 linked 引用保护；不能覆盖用户接管的子对象。数字纸保存原始纹理框，裁片的可见轮廓作为摆放锚点，纹理不会因裁切而重新生成。

## 分片、裁切和解组

`split` 支持实体素材与生成纸张；split.through 指定局部经过点，unit 是 mm 或 ratio，rotationDeg 为顺时针方向角，0 水平、90 竖直。直线自动延伸到两侧边界；edge.style 为 clean 或 torn。两片共享同一切口，无重复材料。pieces[0] 在有向线叉积为正的一侧（水平方向向右时为下方），pieces[1] 为另一侧。

```json
{"op":"split","target":"paper","split":{"through":[0.5,0.45],"unit":"ratio","rotationDeg":30,"edge":{"style":"torn","seed":42}},"pieces":[{"id":"a","place":{"reference":"page","at":[15,35],"unit":"mm","anchor":"top-left","rotationDeg":-5}},{"id":"b","place":{"reference":"page","referenceAnchor":"bottom-right","anchor":"bottom-right","offset":{"value":[-12,-15],"unit":"mm"},"rotationDeg":3}}]}
```

`cut` 接受与实体裁切相同的 region/mode，支持数字纸。矩形、椭圆 region 可提供 rotationDeg，绕区域中心旋转；角度以物理毫米空间计算。需要两个输出时用 split；多块自定义实体区域使用 split 的 pieces[].region 分支。矩形框、任意路径、半平面等完整参数在固定说明中列出。

`ungroup` 的 pieces 使用相同的 id/place/order，每项 id 是原直接子对象编号；只调整列出的部分，其他部分保留原位。解组不裁剪对象，分片不等于解组。拆出的部分可单独移往待放区。

```json
{"op":"ungroup","target":"group1","pieces":[{"id":"paper","place":{"surface":"tray","reference":"page","at":[50,50],"unit":"mm"}},{"id":"caption","order":{"edge":"front"}}]}
```

已有对象修改、分片、解组时，省略 place/order 保留位置和层序。明确给出 page 位置时进入页面；只改旋转角度保留原工作空间。`split` 直接从 asset 取新料时，未摆放的部分留在 tray。

## 验证

`tests/creation-unified-objects.test.js` 验证默认待放、稀疏修改、标题效果与位置保留、解组独立摆放、实物分片面积守恒、原子回滚、数字纸连续纹理数据、旋转裁切、可见轮廓锚点与 linked 跟随。

`node scripts/verify-unified-canvas.mjs /tmp/shiye-unified-canvas` 生成真实渲染的工具验收图及 Scene。它验证执行能力，不是 DeepSeek 自主创作效果测试。

## 模型侧入口

普通运行只提供 10 个函数工具：creation_apply、creation_inspect、inspect_materials、knowledge、workspace、creation_recipe、creation_plan、creation_undo、creation_finish、creation_preview。有 SAM 能力的主机额外提供两个分割提议工具；本次真实测试没有开启 SAM。

creation_apply 只接受 create/update/copy/delete/group/ungroup/cut/split 八种操作。原有 39 种 Scene/CLI 命令属于内部执行原语，不再直接暴露给模型；模型使用旧操作名会被拒绝。知识读取、搜索、案例、模板和诊断归入 knowledge.action，工作空间创建、查看、关闭归入 workspace.action。阶段由模型声明意图和运行时观察，不要求调用阶段切换工具。

操作合同在首轮完整提供，公共定义只列一次。查阅知识不是调用工具的前置要求。不同工具调用隔离失败，同一 creation_apply 批次仍保持原子性。明确列出的高级工艺可使用 cut.method 或 creation_recipe；旧的批量布局命令不再直接提供，常规相对摆放和层序使用 update.place/order/parent。

## 通用文字技巧

不再设置单独的标题类型或标题工具。create(kind=text) 的 effect、layout、backdrop、runs 适用于日期、数字、短句、分段文字和标题；字体、颜色、描边等普通样式仍在 style。组合字效用于最多 120 字、宽度 11–300 mm 的片段，长正文保持普通文字对象。已有普通文字可以通过 update 追加组合字效，保留对象编号、位置、层序和原样式；如果存在受保护的外部 linked 引用，会明确拒绝，避免破坏连接关系。

## 2026-11-25 真实调用验收

使用已授权的八件自有素材，真实 DeepSeek（deepseek-flash，low）自主选择工具与参数，完成 8 轮、199.9 秒的双页功能测试。任务额外要求纸张斜向切分、独立摆放、文字局部修改和解组，因此这是功能验收，不是同提示词画质 A/B 测试。9 次工具调用全部成功，无参数失败；最终 Scene 校验通过，交付可编辑作品。

总输入 484,920 token，其中缓存复用 366,336，未命中输入 118,584；输出 31,928（含两次独立画面审查）。该用量包含逐轮累计，不能视为单轮上下文大小。首次请求提供 10 个工具，工具定义约 9,658 字符（原约 26,960）；系统说明约 68,086 字符（原约 93,976）。这次没有切换思考等级，不能据此得出 high 与 low 的画质优劣。

人工检查确认纸片分别摆放、文字可读、圆星点缀出现；右页英文素材仍偏抢眼，撕边也偏锯齿，不能把功能通过等同于所有构图问题已解决。测试结果保存在私有验收目录，不提交素材或作品。本分支尚未部署。
