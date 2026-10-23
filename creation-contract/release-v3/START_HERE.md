# 拾页：从真实素材到可编辑手帐

scene.json 是唯一作品。只写 work/commands.json，经 `node runtime/shiye.cjs apply work/commands.json` 修改；真实 Node Canvas 或浏览器 Canvas 生成 PNG，实际打开 output/preview.png 后再交付 output/project.shiyeproject.json 与 PNG。不写另一套绘图程序，不手改 Scene，不以示意图冒充预览。

## 先读这些
TASK.json 看约束与素材清单，design/GUIDE.md 看本次内容要求，design/SKILL.md 看创作方法；打开 assets/overview.jpg 与必要原图。不要先通读 Schema。材料职责由画面决定，真实尺寸/来源/文字策略不能改。

## 做到哪里再看图
1. 用几句话决定主题与局部图文组。文字、图形、材料都可当主体；先为能正常阅读的正文留空间。
2. 主块与主要正文成形就 preview 一次：先调整重心、间距和书写面，再展开细节。不要吝啬装饰：小材料、胶带、艺术字、图形和笔迹可在多区域呼应，不用碎点掩盖结构问题。
3. preview 后先缩看双页，再看单页和正常大小正文，按 design/REVIEW.md 写出“哪个区域、什么问题、怎样改变”。先修重心/空洞/文字，再细调点缀。必要时查 PLAYBOOK.md，不把读指导代替看图。
4. 后续用 `begin work/next.json` 建事务，局部 apply → preview。没有新问题不凑轮数；还有明显问题不能因 pack 通过就交付。
5. 补齐真实 material.decision，`review pass` 或 `review fail` 如实记录，最后 pack。改过 Scene 必须重新预览。

查询：info / fonts / self-test；describe <op> 查询短帮助，完整定义才查 api/commands.schema.json 或 --full。图形按需读 GRAPHICS.md，艺术字读 LETTERING.md。所有普通修改用 layer.update；不调用旧同义入口。design-check 只有框级提示，不是审美评分。
