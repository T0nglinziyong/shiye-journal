# 素材分类与云端识别 v2

`classificationVersion: 2` 是素材分类合同。四个类别维度采用稳定 ID：

- `kind` 是素材类型一级 ID；`kindDetail` 是同一类型的二级 ID，无法判断时为 `null`。素材类型始终有且只有一个一级 ID。
- `role` 是主要画面作用；`secondaryRoles` 是可选的次要作用 ID 数组。
- `contentCategories` 是可选的内容类别 ID 数组。
- `layoutFits` 是可选的版面适配 ID 数组。

字典与版本在 `src/material-taxonomy.js`。七个开放标签组分别是 `contentTags`、`themeTags`、`styleTags`、`colorTags`、`materialTags`、`moodTags` 和 `tags`（其他标签）。组名固定，标签内容不从字典挑选；不可把画面里看见的布纹写成“布片”类型或把视觉纹理当成已确认的物理材质。

`categoryEvidence`、`tagEvidence`、`tagGroupEvidence`、`titleEvidence` 记录人工、AI 或旧数据转换的来源。用户改过或勾选确认的类别、标签组和标题不会被云端 AI 覆盖。模型返回每项置信度；小于 0.7 的候选不写入。物理尺寸、来源、Mask、图片 Hash、`systemAttributes` 和向量索引保留在分类与标签之外。

导入先可靠暂存并同步图片。CloudBase `POST /api/classify-asset` 只接受素材 ID；云函数用当前登录用户 Token 读取其素材记录、透明图及候选原图，向服务端配置的视觉模型请求结构化分类，用 `shiye_commit_v3_guarded` 原子写入并返回更新后的素材。并发修改会重新读取最新记录；用户人工字段优先。作品自动整理也走云函数 `/api/classify-project`。客户端模型设置只用于创作。

云函数需在受保护环境变量中配置 `SHIYE_CLASSIFICATION_API_KEY`，可选 `SHIYE_CLASSIFICATION_MODEL`（默认 `deepseek-flash`）与 `SHIYE_CLASSIFICATION_MODEL_VERSION`。密钥不得进入前端、Git 或诊断。`/api/platform-health` 的 `classification.configured` 用于检查是否配置。云函数读取的是 CloudBase 私有云存储（底层由 COS 承载），不会把文件改成公开读权限。

旧素材只由设置中的“转换旧数据格式”入口迁移。先扫描、导出受影响记录的备份，再按账号修订原子提交；不能对应的必填类型和画面作用映射为“其他”，可选的内容类别和版面适配留空，全部旧自定义标签保留。旧字段 `texture`、`semanticColorNames`、`placementHints`、`semanticTags` 只在转换器中读取，不在现行素材结构双写。旧的人工修改没有逐字段来源记录，转换后默认保护原分类；用户主动选择重新分类时才允许 AI 更新未明确人工确认的旧类别。

部署顺序：先备份并在测试账号验证转换，再部署云函数与配置密钥，最后发布前端并在实体手机上核对导入、编辑、重新分类、离线恢复、跨账号隔离和推荐。未完成转换的线上账号不得直接切换到只写 v2 的前端。
