# 创作 API 分类与实现验收

本次任务从 test e800697110e33526b900ba2268afad0a2edff940 开始。当前文件先记录设计边界，具体能力以最终代码与测试为准。

## 分类原则

按操作对作品的后果分类，而不是按用途分类。点缀不是 API 类型。不能只为减少名字把所有行为塞进 update 或 process；专业算法可共享，而对外结果合同必须明确。

- 创建：material.add / text.add / graphic.add。共用 place/size/style/order 中适用的字段。
- 修改：layer.update 是单对象属性修改入口；移除 text.update、layer.place、layer.reorder 的同义入口。父子结构变更仍是 layer.reparent。
- 显示：只有 layer.mask，明确 replace/intersect/subtract/clear；不消费或释放实体材料。source 坐标只适用于实体，其他节点使用 local。
- 实体：material.cut 使用 region + keep/remove，裁条和斜裁由区域表达；开窗保留具名洞身份和窗芯，split 产生多个独立裁片，weave 表达真实前后穿插，不能合成一个巨型参数并集。
- 数字复制：layer.duplicate 支持文字、图形、笔迹和纯数字组合，复制后独立编辑；发现实体材料就拒绝，实体换料复用继续由 layout.reuse 承担。
- 艺术标题：text.lettering 创建逐字树；整体文字改变属于受约束的重新生成/重排，不是任意 group 内容覆盖。普通 child 属性仍由 layer.update 修改。
- 布局：size.behavior 的 linked 表达持续参考，保存于唯一 Scene；先解尺寸再解位置。同一图中的尺寸、位置和父级依赖一起检查循环。

## 不可混淆的差异

1. 普通修改与重新分配节点身份不同；复制、拆分和字数变化需要显式结果合同。
2. 图形 gradient/outline 与文字使用同一种 public style，但不适用的笔迹参数必须拒绝，不能默默忽略。
3. 数字尺寸联动不授权改变真实材料；锁定/人工接管也不能通过间接依赖绕过。
4. 移除旧公共操作要同步生成器、示例、Skill、单测与浏览器脚本，不加运行时别名或转换器。
5. Schema、帮助和执行必须一致。默认 describe 不递归展开全部类型；关键组合的字段数量与示例体积有回归检查。

## 验收重点

创建/更新参数等价，普通/嵌套/旋转组合，尺寸与位置交叉循环，静态覆盖和解除约束，锁定跟随者原子回滚，真实来源/裁片守恒，数字深拷贝的 ID 与内部引用重映射，字数增减/逐字风格/保存重开，Canvas/Fabric/离线预览一致性。

在功能分支保存检查点，最终 CI 全通过才合入 test；CloudBase 测试发布必须核对线上确切 SHA。main 不动。测试中的合成示例不冒充用户作品或模型审美验收。
