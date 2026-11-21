# Codex 实施任务：固定发行内容与动态任务彻底解耦

## 目标与交付边界

请直接修改真实拾页仓库，不只再写方案。基于附件静态资料完成导出器、Command、Scene、布局、预览和打包的接入。
最终 AI 只读任务/看素材、写 commands.json、apply、preview、看图局部修订、pack；不需要自编 Python/JavaScript 修改 Scene，也不需要学习多套坐标参数。

附件已提供固定文档、公共参数、25 个常用命令的候选契约、生成器、help/describe 模块、纯仿射/锚点模块及独立测试。**这些不等于已完成 App/复杂工艺引擎改造。** 不要将当前附件直接冒充已可创作的新版 ZIP。

## A. 先核对真实源码

定位创作 ZIP 导出器、TASK/sourceContext 构建器、素材与总览导出、Scene v2 模型、Group 变换、Command reducer、原生工艺、图层树、Canvas renderer、字体加载、事务、pack 和 App 的 Action/State 系统。

原包 runtime 是打包文件。请修改源代码并重新构建，不在压缩 bundle 里字符串替换。原版 Schema 在 integration/baseline，39 种操作在 coverage-matrix.json；先填写源码位置，再逐项核对等价能力。

不要只根据之前聊天中对代码的概括作判断。以仓库和真实测试结果为准。

## B. 建立静态发布源与生成链

推荐工程结构：static-src、runtime-src、builders、tests、dist/static。可适配现有目录，不要求机械改名。

1. 将固定 START_HERE、GUIDE、公共参数与操作注册表纳入版本控制。
2. 从 common.schema＋operations 自动生成 commands.schema、CATALOG、RECIPES、帮助索引；生成物不可人工维护第二份。
3. 升级通用参数时同步覆盖所有适用操作。高级原生能力也进入同一注册表，以 advanced 标记按需发现，而不是在 tool.* 里永远保留另一套公开参数语言。
4. 正式完整 scene.schema 必须从共享模型导出，合入空间扩展，保留原有字段和能力。附件的 scene-spatial 仅为片段，不能替代原版。
5. package.json/lockfile 和运行时依赖按发布版本固定。生产依赖需要你依据真实 renderer 构建；不要用本资料包根 package.json 覆盖生产配置。
6. 静态发行版有 releaseId/协议版本/内容 hash。任务导出只复制同一发行版，不按素材重新拼接 runtime 源码或修改 Schema 枚举。

## C. 修改随素材变化的部分

实现唯一素材快照导出函数，输出 assets 原图、manifest 和 overview。

- 为每个来源建立包内短别名 m1、m2…，与全局 assetID/sourceRevision 分离；包内稳定、不重排、不复用已删除别名。
- 冻结像素内容、真实尺寸、数量、源快照与来源处理映射。所有 source/crop/mask 指向同一快照。
- manifest 存完整元数据；TASK 仅引用短别名和任务优先级。现有 sourceContext 若仍需完整副本，必须由相同规范化源派生并做 hash 校验。
- 显示总览的名称、尺寸、别名与比例模式。总览不是渲染资源。改变展示排序不能改变既有别名。
- blob hash 只反映图片字节；sourceRevision 还包含影响物理/加工语义的元数据。
- 替换素材、同图不同毫米尺寸、数量 1/多份、胶带卷材、异形透明素材都要测试。

不要把本次 8 件素材、初始 hash 或必用决策写进固定文档/Schema/运行时代码。

## D. 修改随参数变化的部分

实现规范化 Task Builder。附件 task.schema 是新实例契约，不是本次素材专用文件。

字段至少覆盖：用户输入、事实、正文策略、语言、单双页/纸张实际尺寸、风格、用途、跨页许可、加工许可、所选素材必用等级、render/font profile、交付方式。

GUIDE 中“本次视觉方向”“没有补充想法”“本页字号画布换算”等必须移入 TASK 或 inspect 的动态摘要。通用 GUIDE 不拼接 task 文本。

正文策略固定规范、具体取值动态；style/purpose 使用配置而非模板字符串替换。
默认值先规范化，导出为确定的 resolved 配置。别在多个文件用不同默认值重新推导。

初始化 scene.json：由规范化 TASK＋素材快照＋可选已有作品生成，保留完整 source 绑定；不是固定样例直接换标题。初始 work 可为空目录；begin 再生成事务草稿。

参数影响分类：
- 仅导出像素变化：失效渲染，不改物理布局。
- 字体变化：重新测量、布局、渲染、审阅。
- 页面尺寸变化：按 once/linked 规则迁移，校验实体尺寸和越界，不全部自动缩放。
- 文案/风格变化：新任务输入或显式 Command，不偷偷改历史作品。
- 来源尺寸/源修订变化：需要明确重新绑定与校验，不静默污染既有裁片。

## E. 统一 Command 与完整 Scene

外部协议升级到 2，避免旧引擎把 place/size 当未知字段忽略。只保留唯一 apply 入口。

所有相关 Command 统一 id/target/parent/place/size/style/order/region。创建和更新同名字段同义。提供清晰字段互斥与默认语义；不接受参数后静默丢弃。

先实现统一 place 的毫米、比例、相对锚点、offset 和参考空间，再接真实组树。复用 placement-math 的纯函数或工程现有等价数学库；必须跑附件和新增测试。

Group 使用真实 parent-local 变换；组移动不改写所有后代。迁移旧烘焙坐标避免重复变换。检查 group opacity/mask/blend 的合成一致性，不能只测试位置。

group.compose 递归复用相同操作定义，并能整体放入某区域。比例依赖需要稳定 layoutBox；持久 linked 约束存 Scene，检查完整依赖环。

复杂工艺通过 material.crop/split/window/mask/weave/tape 等简洁命令调用同一底层工艺。保留材料账本、余料、开口、源映射、可编辑性。两种语义必须分开：显示 mask 不产生余料；真实 cut 会消费实体。

附件 25 个常用契约不是原生能力白名单。**必须把原包高级 craft、glyphKnockout、repeatStamp、reuseLayout、replaceMaterial、多层 vector、胶带参数等全部迁移到同一注册表。** 缺失一项不可宣布“完整表达”。旧公开工具别名不必永久兼容，但功能必须有新的等价入口。

特殊操作的内部 ID、sourceRevision、几何矩阵、尺寸和占用由 runtime 推导；不要让模型手填可计算信息。

## F. 统一 CLI 与能力发现

正式 shiye.cjs 应至少提供：

| 子命令 | 行为 |
|---|---|
| info | 协议、Scene revision、任务/素材摘要、已验证能力 |
| self-test | 实际后端、字体和资源探测 |
| help / describe | 从同一注册表返回精简说明、完整参数或目标约束 |
| inspect [id] | 树、local/world 位置、bounds、裁片、余料、约束 |
| begin work/commands.json | 读取一致快照，生成新事务外壳，不覆盖未提交草稿除非显式允许 |
| check | 与 apply 同 reducer 的无副作用校验 |
| apply | 事务化应用、实体校验、原子提交、返回 changed/created IDs |
| preview | 当前 Scene 正式渲染 |
| preview --commands | 临时试做，写 proposals，不动 Scene/正式 PNG |
| review --result pass|fail | 记录 agent-declared 审阅，绑定当前预览，不能自动断言真实看图 |
| pack | 验证一致性，导出同一完整 Scene 与 PNG |

help 必须将“契约里有定义”与“当前 runtime 能执行”分开。支持状态由实际 handler 注册＋测试通过的发行 capability＋环境探测组成，不能全部设为 true。

## G. 事务、物理与安全

同 ID 同命令内容重试 no-op；同 ID 异内容拒绝；新事务基准过期拒绝，不能自动重写 hash。
所有状态校验通过才提交。中途失败/进程崩溃不留下半个新 Scene、半个消费账本或假 receipt。补足并发和 journal 恢复测试。

begin 生成草稿不意味着空 operations 可以通过 apply。schema 拒绝未知字段；运行时拒绝未知能力、适用类型错误、负面积、材料重复使用、物理缩放与布局环。

设置组深度、展开后总操作数、路径/笔迹点数、内存和像素预算；禁止任意脚本或网络资源引用。使用已有获授权的字体配置，不从执行机器随意打包字体。

## H. 渲染与打包

优先复用 App 的共享渲染语义；浏览器后端与 Node 后端都需验证，不以存在一个新文件当作后端完成。
固定默认 profile；fallback 只在声明的等价范围内。字体不固定时不能承诺确定换行。

renderKey 绑定 Scene、素材内容、物理源版本、字体、renderer、导出配置。代码中明确 sceneRevision 的内容投影，排除易变审阅/时间戳/诊断，避免自引用 hash；事务日志不成为第二份权威场景。
pack 检查最终预览 freshness、素材必用、实体、布局与 Scene 结构；visual 状态如实声明。
输出维持现有文件名 `output/project.shiyeproject.json`，不要混用 project.json；JSON 单行紧凑但保留全部字段和转义换行。

## I. 必须交付的验收证据

见 tests/acceptance.json。至少三组不同素材、两种页面/正文参数，完整导出并创作。
同一发行版固定文件逐字节不变；TASK/assets/Scene 正确变化；固定文件无任务 UUID/hash/标题/必用名单泄露。
实际演示：局部组合→相对/比例摆放→真实分片→开窗→必要的穿插→整体旋转移动→单个裁片修订→保存重开→继续编辑→preview→pack。

测试结果区分 schema、纯数学、运行时、视觉/像素、App 读写；不要将附件已有的契约测试通过写成你完成了全链路测试。

最终回复须包含真实提交/修改文件、固定发行目录、新 ZIP 示例、完整能力映射、执行命令与结果、仍不支持或未验证的事项。
