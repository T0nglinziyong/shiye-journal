# 创作包接入状态（2026-10-21）

## 已进入可执行 v3 包

- 附件的固定创作指导经过与现有命令核对后发布为 `design/CRAFT_GUIDE.md`；固定入口与 `api/fixed-release.json` 带同一 release ID。任务特有的内容继续在 `TASK.json` 和动态 `design/GUIDE.md`，避免把用户文字和素材 ID 写入固定说明。
- 原有 39 种协议 1 命令继续由 `src/v3-commands.js` 注册。`help` 和 `describe` 只列当前运行时能识别的 39 种命令，不把附件协议 2 候选命令冒充已实现能力。
- `begin`、无副作用的 `check`、`preview --commands`、审阅记录 `review` 已接入。正式 `preview`、`pack` 继续从当前 Scene 渲染并比对 PNG。事务收据与 Scene 存在同一个原子替换的 JSON 中。
- `text.add.fontSizePt` 与文字 `layer.update.set.fontSizePt` 使用 pt→mm→Scene 单位换算；更新也可用 `xMm/yMm/widthMm`。材料占用仍通过原 Scene v2 实体校验。
- 真实 Canvas 后端写入预览记录和交付清单。无法核实为原生 node-canvas 的兼容适配器明确标为 `unverified-canvas-adapter`。
- 动态 RECIPES 只展示局部编辑，不再替必用素材生成 `omitted` 决定。

## 验证

- `npm test`：1223/1223 通过。
- `npm run test:ui`：通过；未做完整浏览器像素比对。
- 附件候选契约：`node creation-contract/tools/build-contract.cjs --check`、纯几何 21 项、Python Schema 84 项通过。其结果只证明静态契约一致，不证明协议 2 已执行。
- 可执行 v3 测试：单素材创建/预览/打包，三素材分片/余料/双开窗/穿插，八件必用素材的多事务文字修订/分组/预览/打包。
- 示例：`examples/v3/拾页-GPT创作包-v3-示例.zip`。其中 `simple` 与 `complex` 输出来自真正运行的 v3 Scene 和 node-canvas。

## 未完成与未验证

- 附件协议 2 的统一 `place/size/style/order`、25 个候选命令、所有高级能力的统一注册表尚未接入运行时；当前 ZIP 明确使用 `protocolVersion:1`。
- Scene v2 的 Group 仍以页面坐标保存子节点；父级局部变换、linked 约束、`group.compose` 与 App 编辑器全链路尚未实现。不能将候选 `scene-spatial.schema.json` 覆盖现有完整 Scene Schema。
- 39 种旧操作均在协议 1 注册，但并非 39 项都已各自完成 Scene→PNG→重开编辑验收。逐项见 [映射表](creation-command-migration.md)。
- 字体依赖执行机器；尚未完成 node-canvas、Skia、浏览器的字体测量和像素一致性比对。8 件回归使用合成素材，尚未用真实用户任务 8 张原图重放。
- Scene 写入是单文件原子替换，锁能阻止并发写入，但进程在持锁时崩溃后的自动锁恢复与完整 journal 验收尚未完成。
