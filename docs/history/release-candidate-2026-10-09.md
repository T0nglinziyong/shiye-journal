# 2026-10-09 UI 发布候选检查

## 修改目标

1. 所有选择栏统一为紧凑底部样式；素材导出只导出，绝不修改系列归属。
2. 二级操作内嵌于「更多操作」，不遮住一级面板；展开内容随窗口重新定位。
3. 分页线和封面之间保持 10px（手机）或 12px（平板/桌面）间隔。
4. 导入素材/作品的批量与逐图系列列表都把「＋ 新建系列…」放在第一项。首次默认仍不归入系列；取消新建必须恢复旧选项。
5. 素材、作品最近删除使用一致的底部选择栏；不可撤销删除允许更宽。

## 回归覆盖（代码内测试）

- `tests/library-selection-browser.mjs`：4 种视口，实际 PNG/JPEG 文件导出与格式头检查，明确断言导出不改变系列归属；二级菜单与主菜单共用一张面板。
- `tests/responsive-visual-browser.mjs`：8 种视口，系列/素材/作品/素材最近删除/作品最近删除/搭配页，固定底栏与移动导航不重叠；导入作品纸张封面/素材封面等高，快照面板按内容收缩。
- `tests/import-workflow-regression.test.js`：系列新建置顶、空系列默认值、可编辑作品导入字段、快照与素材导入路径。
- `tests/recently-deleted.test.js`：素材和作品最近删除共用相同底部选择栏，按钮有一致标签结构。
- `tests/interaction-browser.mjs`、`tests/layout-preview-browser.mjs`：手机/平板/桌面交互与卡片布局。

## 本次已核验

- 变更过的前端 JavaScript 与测试文件通过语法解析。
- 对真实 `moreMenu` 实现的隔离交互模拟：透明导出菜单出现 4 种格式，执行「实际尺寸打印 PDF」不会改动系列，点击「加入系列」才更新素材归属。
- 对真实 `renderImportReview` 的隔离渲染：导入素材和作品均「新建系列」首项；快照不出现系列归类；原有名称和背景设置保留。

## 阻止生产验收的外部问题

- PR 的 GitHub Actions 多个工作流均在尚未开始任何步骤时失败，`fetch_workflow_job_steps` 返回空数组。**这不代表单元测试、构建、浏览器测试已通过或不通过**。需要修复 Runner / 组织计费或 GitHub Actions 权限后重新执行。
- Vercel 连接对归属团队访问返回 `403 forbidden`，暂时不能核对测试/正式项目的 Production Branch、部署 SHA、READY 和域名。
- 实体 iPhone/iPad Safari（含底部安全区、旋转、触屏弹层）、实际 Apple Pencil 和多设备同步，尚无可由本次工具自动执行的真机验收。

## 发布门槛

`test` 更新后必须完成上述 CI、测试站最新 SHA / READY 与真实 Safari 的关键交互，再合并 `main`；`main` 推送后再核对正式部署实际 SHA、域名和网络鉴权。不得把仅合并 GitHub 分支视为部署成功。
