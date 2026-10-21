# 创作包接入状态（2026-10-21，PR #196）

## 当前可执行链路

网页导出的任务包默认且只接受 commands 协议 2。`scene.json` 是唯一作品状态；25 个简洁 Command 和 39 个 `native.*` 原生操作在同一事务中执行，完整工艺继续使用共享 Scene 编辑与材料账本，不建立另一套场景或渲染器。不再接受协议 1 事务、v1:/v2: 帮助别名或 advanced.v1.* 命令名。

`help`、`describe <op>`、`describe place/size/style/region/order/layoutBox` 从实际可执行注册表生成；返回自包含 Schema。创建样式按节点类型收紧，错误指向实际操作字段，不静默丢弃参数。`material.decision` 理由长度与最终交付规则一致。

组有真实局部变换、稳定 layoutBox 和递归 children。毫米/比例/九点锚点/相对节点/父组摆放共用一个解算器。linked 绑定时固化旋转空间偏移，反复求解不累积角度；人工平移回写同一旋转空间。笔迹只施加一次旋转并保留可编辑点。

矩形、椭圆、多边形、SVG 路径、实体分片与余料、开窗与窗芯、多孔穿插、胶带、撕边和显示蒙版均有当前协议测试。`layout.arrange` 支持同级对象横向、纵向和网格的一次性排列，检查旋转占位、锁定与容器溢出，不缩放真实素材。

## 包内容与环境

- 导出前将素材引用规范化为任务内 m1、m2 等短别名，再冻结快照与指纹；持久素材 ID 不变。
- TASK/素材随任务变化；入口和审美指南固定；RECIPES 从注册表生成 operations 示例，不含任务 ID 或过期 revision。新事务由 begin 建立。
- src/generated 是由 predev/pretest/build 生成的缓存，不再维护已提交的旧副本；两次清空缓存后的独立构建必须 SHA-256 一致。
- 预览默认优先 Node Canvas，缺少时检测本机 Chromium；可用 SHIYE_RENDERER 固定后端。浏览器使用私有 CDP 管道和内嵌素材、同一 Scene Canvas 代码，不上传素材、不自动下载程序。
- check 和试做预览不提交 Scene；apply 原子保存 Scene 和收据；pack 对当前 Scene、素材、实际后端和重新渲染 PNG 进行核对。

## 验收入口

`npm test`、`npm run test:ui` 和 Craft/Interface browser regression 是实际检查。新增 rotation、arrange、unified-audit 测试；导出 ZIP 分别用 Node Canvas 和 Chromium 完成 check/apply/preview/review/pack/重新导入。没有浏览器时本地测试明确跳过，不能算作浏览器通过。

Craft browser CI 额外运行干净构建复现检查和 `scripts/generate-v3-unified-example.mjs`，其 artifact 中的 creation-package 是该提交的实际生成物。仓库中的历史示例不当作当前运行时发布物；请从当前源码重建或读取对应 CI artifact。测试是否通过以 PR 的实际 CI 结果为准，本文不预写测试总数。

## 仍明确不宣称的能力

- visible 精确可见轮廓锚点、自定义 region: 布局区域、持续自动排列尚未发布；公共 Schema 明确拒绝，不默默按 layout 替代。可用明确 layoutBox 和单对象 linked 关系表达已支持的布局。
- 纸张尺寸/单双页是任务来源硬约束，不能由作品命令覆盖。
- 字体依赖执行环境；Node Canvas 与 Chromium 不保证逐像素相同，pack 只在相同实际后端重渲染验证。
- 合成回归不等于真实 iPad Safari/Pencil、全部原生工艺参数和真实用户素材的逐项人工审美验收。
