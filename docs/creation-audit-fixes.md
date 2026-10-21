# 历史记录：PR #196

以下记录针对当时版本；当前入口与参数以 creation-integration-status.md 和实际 describe 为准。PR #196 中的 native.* 入口已在后续统一内核改造中删除。

# 统一创作包审查修复

基线：test dd485339f233c3d81eeaa2e3bdf78f3d8d942752。本文描述实现与验收范围，不以源代码存在代替 CI 或真机验收。

## 当前实现

- 对外只有 commands 协议 2；删除 CLI 的协议 1、v1/v2 帮助别名和 advanced.v1.* 路由。完整原生能力用 native.*，与简洁命令进入同一个事务和 Scene。内部复用 Scene 原语执行器，不另建一套几何或渲染实现。
- 旋转空间统一为 parent/page/reference。绑定 linked 时将缺省角度固定成该空间的数值；重算不累计参考角度；人工平移回写相同空间的偏移和角度。
- 笔迹显式记录已经施加的 layoutRotation；定位采用稳定局部包围框，避免重复旋转。
- vector.add 保留线宽、阴影；SVG 路径输出使用线宽。创建和更新按节点类型验证 style；错误给出对应操作路径。文字创建尊重显式最低高度。
- 最终运行时注册表生成 Schema、help、describe 与 RECIPES。公共参数可独立查询，返回的 Schema 自包含；候选中未执行的参数不对外宣称可用。
- RECIPES 固定为 operations 示例，不含任务 ID、真实素材 UUID 或过期 revision；新事务通过 begin 生成。
- layout.arrange 支持同级对象横向、纵向、网格一次性排列；计算旋转后的占位并拒绝溢出，不缩放实体素材。
- group.compose 支持局部创建后修订，禁止误修改外部对象；分片的 parent/linked 放置使用同一空间接口。
- 预览优先使用 Node Canvas，缺失时可使用本机 Chromium。浏览器通过私有 CDP 管道加载内嵌素材与相同的 Scene Canvas 实现，不启动公网调试端口、不上传素材。SHIYE_RENDERER 可固定后端；pack 重新渲染并核对后端与 PNG 哈希。

## 测试

新增旋转回归、排列回归、当前帮助与 Schema 一致性、真实 ink/vector/text 操作，以及 Node/Chromium 两种后端的导出 ZIP→check→apply→preview→review→pack→重新导入测试。
既有 ZIP 回归迁移到当前协议，继续检查失败回滚、过期修订、幂等收据、崩溃锁恢复、伪造 PNG 拒绝、实体分片余料、开窗穿插、八件必用素材和文字物理单位。

完整结果以本修复 PR 的实际 CI 为准。没有 Chromium 的本地测试会明确跳过浏览器用例，不将跳过算作通过；GitHub runner 的浏览器用例单独检查。

## 明确边界

visible 精确轮廓锚点、自定义 region: 布局区域、linked 自动排列尚未发布；使用 layout 边界、明确 layoutBox 和单对象 linked 约束。纸张模式/尺寸由任务固定。
字体仍取决于机器；不宣称 Node Canvas 与 Chromium 逐像素一致。真实 iPad Safari/Pencil 与全部原生工艺逐项人工视觉验收不由合成单元测试替代。
