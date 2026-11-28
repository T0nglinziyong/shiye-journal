# Scene 保真接入与完整能力

## 不新增一个低能力 Scene

当前项目外层有 source、materialDecisions、page；page 是 Scene v2。必须保留全部现有材料来源、物理约束、图层、加工、矢量、文字、笔迹、遮罩、胶带、真实开窗和穿插语义。

`scene-spatial.schema.json` 只给新空间能力提供字段片段。不能把它复制成完整 scene.schema.json，也不能用它单独验证最终作品。原始完整 Schema 在 integration/baseline 中原样保留。

正式完整 Schema 必须从共享 Scene 类型生成或集中维护。升级矩阵语义后同步更新 App 编辑器、命中测试、选区、拖拽、橡皮擦、撤销、导出、同步与两个预览后端；不能只修改 ZIP 运行时。

## 新语义与迁移

新增明确空间标识，如 page.spatialSemantics="local-tree-v1"。若项目版本治理要求升级 sceneVersion，可采用明确版本迁移；不得悄悄赋予现有同版本字段不同含义。

现有叶节点的 x/y/rotation 与新 matrix 不能成为两套都可写的权威坐标。Codex 应选择单一原生变换表示，并将旧字段作为导入迁移或只读派生值。不得同时应用旧偏移和新父矩阵。

一次性迁移要从旧渲染语义取得每个节点 world transform，再计算新 parent-local。已有组曾经烘焙到后代的平移/旋转不能再次应用。迁移前后渲染、命中与实体尺度分别验证。

开发期不必永久保留旧创作入口，但不能丢掉已有作品数据。需要时提供一次性迁移工具；之后只导出新协议包。

## 必须保存到 Scene 的信息

- 稳定 ID、真实组树、局部变换、布局框、绘制顺序与组级合成属性。
- 完整源身份、sourceRevision、库存单元与裁片几何、源图像映射、余料/废弃状态。
- 非破坏性 mask 与实体 cut 的区别；保留 cutout 的独立身份与消费分区。
- 文字内容、字体策略、排版属性；向量路径与笔画的可编辑参数。
- 穿插的真实开口、共享实体身份和前后关系；不能只留一张栅格结果。
- linked 约束及求解所需的参数。once 不必持久化执行输入，但最终变换必须完整。

能仅靠 Scene＋它声明的资源重新打开、继续编辑、渲染，不依赖上一轮 commands.json 恢复状态。

## 结构与业务校验分离

Schema 做结构；运行时做来源占用、图关系、循环、边界、字体、尺度、任务约束。
ConstraintRecord.spec 必须按 kind 引用公共 Place/LayoutRule 等已类型化结构。sourceSnapshot 必须接回现有完整来源快照类型，不允许永久 object:any。

新高层命令只简化输入：sourceRevision、库存单元、物理换算、几何矩阵等由运行时推导。但旧的 native craft 不能因为高层命令暂不支持就被删掉；为未覆盖的能力添加高级类型化操作，同样通过唯一 apply 和注册表按需查询。

## 每种能力的验收链

Command → Scene 保存 → reload → PNG 渲染 → 编辑器继续编辑 → undo/redo → 再导出。

需要逐项覆盖原包的全部操作，而不是只跑 material.add 与 text.add。coverage-matrix.json 是起始清单，Codex 必须填写源码路径、对应新操作、测试名称和结果。
