# 统一 Command 协议与发现机制

## 1. 单一入口与版本

所有创建、加工、布局和修订通过 `shiye.cjs apply`。高级配方只是编译到同一引擎的复合操作，不引入第二份作品状态。禁止恢复 instructions→Scene 与 craft-plan→Scene 两条模型必须自行选择的输入路径。

本次候选 `protocolVersion:2`；旧包为 1。`package version`、`protocolVersion`、外层项目 version、page.sceneVersion、空间语义与渲染 profile 彼此独立。

## 2. 公共字段

| 字段 | 统一语义 |
|---|---|
| id | 新节点稳定 ID，项目内唯一；重复创建默认错误 |
| target | 现有节点 ID，不使用数组下标 |
| asset | manifest 内短别名；不是节点 ID，也不是路径 |
| parent | 所属 Group；创建默认页面根，compose 内默认当前组 |
| place | 完整定位描述，见 SPATIAL；所有适用操作同义 |
| size | 明确尺寸与参考；不能隐式缩放实体材料 |
| style | 同名样式同义；能力/节点类型不支持就报错 |
| order | 同级 before/after/edge 三选一 |
| region | 工艺区域，有独立但共享的坐标/单位定义 |

统一不等于每个命令接受每个字段。`layer.delete` 不接受 size，实体 material.add 不提供任意 size。
`style` 共用字段定义；运行时按节点类型限制适用范围。Schema 通过不代表样式在当前对象上合法。

未给出的属性保留，不能被默认值重置。`style` 深层部分更新；数组整体替换；`place` 是完整定位表达，整体解释，不与旧 at/referenceAnchor 分支盲目合并；未给 rotation 时保持现有旋转。新建对象旋转默认为 0。

新 place 的 once 解算会替换目标自身旧定位关系；只改 style 不解除 linked。解除持续关系也可显式 layout.detach。null 不是通用删除符。

## 3. 唯一规范来源

`common.schema.json` 定义共享参数；`operations.json` 定义各操作、参数引用、示例和约束。
构建器从两者生成 commands.schema.json、CATALOG、RECIPES 和测试事务。不要人工反向修改派生文件。
JSON Schema 的结构复用采用 `$defs/$ref`；正式执行器应使用匹配 Draft 2020-12 的验证器。Ajv 2020 的导入方式见 SOURCES，不可将声明的 draft 和实际验证能力混用。

完整 Scene 的原生特殊字段及高级工艺应继续接入注册表，不得因为这份初版的 25 个常用操作没有覆盖某能力，就把原能力删除。覆盖清单在 integration/coverage-matrix.json。

## 4. 按需发现

`help`：名称和一句话用途；只列当前可用能力，可另选 show-unavailable。
`describe <op>`：必填、常用选项、公共参数引用、最小示例、语义、前置条件、输出 ID、典型错误。
`describe place|size|style|region`：公共参数一次学习。
`describe <op> --full`：完整定义及引用的必要子类型。
`describe <op> --target <id>`：由 runtime 追加该对象允许的参数/范围，不生成一套新的 Schema。
`inspect [id]`：节点树、local/world 变换、边界、真实尺寸、裁片/余料、约束与可执行操作。

本资料的 command-help 模块能运行，但只读静态契约，availability=null。正式 CLI 必须加入真实 capability 检测，不能因为文档里有名字就声称实现。

## 5. 事务与顺序

begin 在当前 Scene 读取一致快照，生成 transactionId 与 baseSceneRevision，写出 operations 为空的草稿。填完后方可 apply。

apply 在临时副本上执行：格式校验→引用和权限→布局/几何→实体规则→完整 Scene 校验→原子提交。出错不得提交半成品、消费半份材料或更新成功记录。

同事务 ID＋同内容 hash 的重试返回原 receipt/no-op；幂等查询应早于过期 baseRevision 判定。同 ID 不同内容为错误。新事务基准过期必须明确冲突，不得自动把 base 改为 latest 后重放。

实现并发锁/compare-and-swap；Scene、材料账本和事务 receipt 作为同一逻辑提交。单个文件 rename 并不足以证明多文件原子性；采用 journal/恢复机制并测试中断。

普通 operations 按声明顺序，目标必须在使用前存在。不要为了支持前向引用而任意重排裁切、删除和修改。
group.compose 可对同一新建组内的创建/布局依赖建图预分配 ID并求解；对于有副作用的顺序保留依赖边。遇到不明确的前向引用或循环就拒绝并报告，不承诺任意命令顺序等价。

## 6. 校验分层

Schema：字段、类型、枚举、互斥分支。
语义：目标存在、适用类型、路径合法、区域宽高、上下文、布局依赖、复杂组效果。
实体：素材单元、库存、裁片交叠、源映射、实际尺度。
视觉：真实图片的人/多模态检查；不能由上述三种校验自动代替。

对路径长度、节点总数、展开后操作总数、组深度、像素预算和文件大小设置限额。compose 的嵌套不能绕过 maxItems=200 的总预算。禁止 eval、任意脚本、远端 URL、自定义函数、目录穿越。路径只允许已验证 manifest 中资源。

## 7. 预览、审阅和打包

apply/check/试做使用同一 reducer，check 无副作用。preview --commands 的临时结果写 proposals，带 base/proposed Scene hash，不覆盖正式 PNG。
正式 preview 绑定 Scene 内容 hash＋素材字节 hash＋源物理修订＋渲染 profile＋字体 hash＋输出配置。
review 必须标注为 agent-declared、人审或未审；代理仍须实际打开图。hash 只能证明绑定关系，不能证明有人看过图。
pack 若发现审阅/预览对应旧状态则失败或要求重新审阅；不伪造通过状态。

导出完整 Scene，操作历史不是导出作品的替代品。JSON.stringify 紧凑写入，字符串换行保持转义。禁止为了缩小 JSON 丢弃 mask、来源、constraints、组树或可编辑路径。
