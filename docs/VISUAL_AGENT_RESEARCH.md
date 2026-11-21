# 视觉编辑 Agent：可借鉴的实现

2026-11-21 核查范围是可编辑画布、图像编辑、多轮工具调用与 Skill 管理。以下是项目公开文档或代码能确认的行为；“用于拾页”是本项目的设计判断。

| 项目 | 已确认的做法 | 用于拾页 |
| --- | --- | --- |
| [Pi：compaction](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/compaction.md) | 在上下文接近阈值时，把旧回合和先前摘要合并；保留近期完整回合与原始会话。摘要分目标、约束、进度、关键决策、下一步。 | Scene 仍是位置和对象的真相来源；创作摘要保存构图意图、被否定方案及理由，旧消息继续留在检查点。 |
| [tldraw Agent Starter Kit](https://github.com/tldraw/tldraw/blob/main/apps/docs/content/starter-kits/agent.mdx) | 同时提供截图和简化的对象数据；输入由可组合的 PromptPartUtil 构成，操作由 AgentActionUtil 定义；不同 mode 提供不同的观察和操作集合。 | 保持画面与 Scene 同轮对应。下一步按布局、局部编辑、审阅收窄工具清单，避免每轮都解释所有工具。 |
| [OpenPencil](https://github.com/open-pencil/open-pencil/blob/master/CHANGELOG.md) | AI 聊天列出 Skill 名称与描述，匹配请求时加载正文；`@` 可指定图层、页面或 Skill；编辑器与 MCP 复用核心编辑能力。 | 继续使用规则预载与按需读取；增加明确的目标对象和技能引用，模型不必反复猜选中对象或教程。 |
| [pedit](https://github.com/metiutek/editorimage-ai) | AI 与界面编辑同一份文档；`batch` 原子应用多项修改并可同轮返回预览；建议 `preview` 后再 `review_image`。 | 保持原子 `creation_apply` 与自动预览；优先让视觉复核成为每批修改后的固定环节。 |
| [Doop](https://github.com/kgoedecke/doop) | 轻量初始说明加可重新读取的 `get_guide`；工具返回提醒截图复核；可按需读设计规范。 | Skill 与工具指南在压缩后仍可重新读取。错误收据应给具体修正提示，避免重复读取整套合同。 |
| [Self-Refine](https://papers.nips.cc/paper/2023/hash/91edff07232fb1b55a505a9e9f6c0ff3-Abstract-Conference.html) | 生成、反馈、修订反复执行，反馈针对刚生成的结果。 | 每次截图审查都绑定 Scene 版本；有明确问题才继续修改，修后必须看新图。 |
| [Tree of Thoughts](https://proceedings.neurips.cc/paper_files/paper/2023/file/271db9922b8d1f4dd7aaef84ed5ac703-Paper-Conference.pdf) | 保持多个不同候选状态，对它们评估、选择或回退。 | 草稿是独立 Scene 分支，不在同一主稿上叠加试错。 |
| [Tandem](https://github.com/microsoft/Tandem/blob/main/docs/user-manual.md) | 可选探索 2–3 个视觉方向；切换查看候选不会自动接受设计。 | 并行草稿只返回截图与候选 ID，主 Agent 看图并明确选择后才修改主 Scene。 |

## 拾页当前状态与取舍

拾页已有服务器持久检查点、单一可编辑 Scene、原子工具批次、自动渲染、分区截图、素材总图、规则预载与分层 Skill。过去每轮只给模型最近两次工具往返和当前 Scene，早期构图取舍可能消失。现在对已结束回合滚动生成创作摘要，继续保留最近完整回合；摘要调用只读、无编辑工具，失败时旧历史不丢弃。摘要与当前 Scene 分开提供，避免把过时坐标当作现状。

已加入每次修改后的版本化截图审查，并将并行草稿限制为有条件的分支探索。子 Agent 只拿到编辑工具，候选互不污染；主 Agent 需要对照真实截图作出选择。后续仍须比较真实任务的轮数、输入 token、探索耗时、错误工具调用和最终画面质量。不能从这些项目的文档推断它们在拾页素材上的实际审美效果。

具体可把工具合同分成三个可切换集合：构图时提供素材观察、模板匹配、计划和初次批量摆放；局部编辑时提供批量修改、组合、分割、暂存区与撤回；审阅时提供当前画面、校验与交付。阶段可回退，不能因为进入审阅就禁止修改。`creation_help` 和 `read_skill` 始终可按主题读取，核心构图与纸片规则继续启动预载。Skill 目录只放名称、用途和触发条件；具体教程及示意图在命中后读取，并在压缩后可重新读取。

上下文分为四份：当前 Scene 说明对象和准确位置，变化空间截图说明视觉效果，创作摘要说明意图与取舍，最近完整回合保留可直接继续的工具调用。全局素材编号图稳定保留；仅在模型需要局部细节时再取单件图片。这样一次摘要失败也不会把旧决策从检查点删除。

## 能力缺口：别人有，拾页尚未完整具备

以下“已有/部分/缺少”以当前仓库代码为准，不把论文或项目示例当成实际画质保证。优先级是对拾页的设计判断。

| 能力 | 成熟做法的具体启发 | 拾页现状 | 下一步 |
| --- | --- | --- | --- |
| 分阶段能力与视野 | [tldraw Agent](https://github.com/tldraw/tldraw/blob/main/apps/docs/content/starter-kits/agent.mdx) 的 mode 同时决定可见上下文和可用动作；同一编辑器可有构图、工作、审查模式。 | 部分：草稿子 Agent 仅有原子编辑工具；主 Agent 每轮仍收到全部工具定义。 | 优先：引入可回退的 `compose/refine/review` 工具视图，并测量误调用和输入 token；审查模式仍允许同轮修复。 |
| 可解释的视觉审查与评测 | [tldraw Agent](https://github.com/tldraw/tldraw/blob/main/apps/docs/content/starter-kits/agent.mdx) 同时给截图、结构形状和 lint；[Self-Refine](https://papers.nips.cc/paper/2023/hash/91edff07232fb1b55a505a9e9f6c0ff3-Abstract-Conference.html) 明确反馈要作用于刚生成的结果。 | 部分：已经强制每次编辑后看真实图，并绑定 Scene 版本；几何审计与模型评价仍未形成可复现画质基准。 | 优先：建立固定盲评集，覆盖留白/繁复、尺寸、来源与文字；比较初稿、审查后图、人工评分，记录具体问题是否真的消失。 |
| 搜索到执行的参考知识 | [Azure AI Search](https://learn.microsoft.com/en-us/azure/search/retrieval-augmented-generation-overview) 的检索模式强调小范围、可追溯来源与结构化筛选；[混合检索](https://learn.microsoft.com/en-us/azure/search/hybrid-search-overview) 适合后续语义与精确词并用。 | 部分：本地模板与技巧现在可按文字、风格、主题、纸张比例及素材适配搜索，再按 ID 读取完整配方；尚无向量、真实案例评测或用户作品索引。 | 先验证当前目录的召回与误匹配，之后加入来源去重、视觉描述和账号隔离的作品索引；只有实测词法召回不足才加入向量。 |
| 外部扩展协议 | [MCP 架构](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/docs/2026-07-28/learn/architecture.mdx) 区分 Tools、Resources、Prompts；[工具规范](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/server/tools.mdx) 要求清晰合同、稳定列表和结构化结果。 | 缺少 MCP 适配层，内部已有独立的 Scene 工具和 Skill 读取接口。 | 中期：先把只读模板/技巧目录暴露为受控 Resources，再把已有原子工具映射为同一合同；不要让任意第三方 MCP 直接拿到私有素材或写 Scene。 |
| 人工中途接管与恢复 | [LangGraph interrupt](https://docs.langchain.com/oss/javascript/langgraph/thinking-in-langgraph) 可暂停并从检查点恢复；[OpenAI Agents SDK](https://openai.github.io/openai-agents-python/human_in_the_loop/) 让工具审批及其状态随任务恢复。 | 部分：可停止任务，已完成结果可编辑；运行中不能把某个候选草稿交给用户选、修改约束后原点继续。 | 中期：只在方向分歧或用户明确请求时暂停给出 2–3 张候选及其来源/时耗；用户选择后从选中 Scene 继续，不能重跑已成功事务。 |
| 结构化追踪与回放 | [OpenAI Agents SDK tracing](https://openai.github.io/openai-agents-python/tracing/) 把模型、工具、交接、校验拆成可关联的 span。 | 部分：已有检查点、工具结果、轮次耗时和图片计数，但跨截图、审查、工具纠错、最终评分的任务级时间线不完整。 | 优先：用任务 ID + Scene 版本串联只读事件；记录模型/检索/渲染耗时和失败原因，诊断默认脱敏，不上传私有图像到监控。 |
| 分支探索与选择 | [Tandem](https://github.com/microsoft/Tandem/blob/main/docs/user-manual.md) 的视觉候选要查看后显式接受；[Tree of Thoughts](https://proceedings.neurips.cc/paper_files/paper/2023/file/271db9922b8d1f4dd7aaef84ed5ac703-Paper-Conference.pdf) 用多个状态比较与回退。 | 部分：后台能并行生成独立可编辑候选，并由主 Agent 看图选择；没有跨分支统一量化比较，也没有人选入口。 | 建立统一的候选对照：同一任务约束、真实截图、素材覆盖、可读性、版面密度、耗时；测试何时并行比单路迭代更值。 |

先落实“搜索到执行”、版本化审查和安全分支；下一轮优先做追踪与盲评，因为没有成品质量证据就无法判断 mode、MCP 或更多子 Agent 是否真的有益。MCP 是互操作边界，不是排版算法。实时第三方工具的权限、来源可信度和账号隔离必须在接入前逐项定义。
