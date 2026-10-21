# 创作包接入状态（2026-10-21）

## 已进入可执行 v3 包

- 附件的固定创作指导经过与现有命令核对后发布为 `design/CRAFT_GUIDE.md`；固定入口与 `api/fixed-release.json` 带同一 release ID。任务特有的内容继续在 `TASK.json` 和动态 `design/GUIDE.md`，避免把用户文字和素材 ID 写入固定说明。
- 原有 39 种协议 1 命令继续由 `src/v3-commands.js` 注册。`help` 和 `describe` 列出当前可执行的 24 个简洁命令与 39 个高级命令；暂缓项不作为可执行操作列出。
- `begin`、无副作用的 `check`、`preview --commands`、审阅记录 `review` 已接入。正式 `preview`、`pack` 继续从当前 Scene 渲染并比对 PNG。事务收据与 Scene 存在同一个原子替换的 JSON 中。
- `text.add.fontSizePt` 与文字 `layer.update.set.fontSizePt` 使用 pt→mm→Scene 单位换算；更新也可用 `xMm/yMm/widthMm`。材料占用仍通过原 Scene v2 实体校验。
- 真实 Canvas 后端写入预览记录和交付清单。无法核实为原生 node-canvas 的兼容适配器明确标为 `unverified-canvas-adapter`。
- 动态 RECIPES 只展示局部编辑，不再替必用素材生成 `omitted` 决定。

## 统一命令链路

- 网站导出的创作包现在默认协议 2；`api/commands.schema.json` 是实际运行时 Schema，`work/commands.json` 默认协议 2。`help` 列出 24 个简洁命令及 39 个 `advanced.v1.*` 高级命令。
- 真实 Scene `scene.json` 是唯一写入目标。`check`、`apply`、`preview` 和 `pack` 共用它；事务收据保存在 Scene 内，原子替换与有主机、进程信息的崩溃遗留锁恢复已接入。
- 组内真实局部坐标、持久 `linked` 约束、相对尺寸与顺序、阴影、非矩形来源裁片、窗芯和多孔穿插已加入简洁命令。实体裁切继续经过来源面积与占用账本验证。
- `examples/v3-unified/拾页-统一命令创作包-示例.zip` 是默认协议的可运行示例，配套真实 `preview.png`、作品 JSON 与交付清单。示例验证工程链路，不代表人工确认的高质量设计。
- `layout.arrange`、`visible` 边界定位按本轮要求暂缓。纸张单双页与物理尺寸由任务来源固定，不能用 `page.update` 改写；用户不需要自定义纸张宽高。

## 验证

- 统一命令测试覆盖简洁创建/更新、相对尺寸与排序、阴影、局部组和 linked 约束、实体分片/余料、SVG 路径区域、窗芯、胶带、撕边、多孔穿插及同一文件中的高级原生命令。发布 Schema 拒绝本轮暂缓的 `layout.arrange`、`visible` 和纸张尺寸修改。
- 默认 ZIP 经真实 `check → apply → preview → pack` 生成示例 PNG、作品 JSON 和交付清单；崩溃遗留锁恢复及同事务幂等写入有回归用例。
- `npm test` 通过 1253 项；`npm run test:ui` 通过；`npm run test:browser` 的编辑器、Fabric 画布、导入 28 屏与作品删除检查通过。

## 未验证事项

- 39 个高级原生操作全部保留执行入口和 Schema，但尚未逐项进行 Scene→PNG→重开编辑人工验收。逐项路径见 [能力映射](creation-command-migration.md)。
- 跨渲染器的复杂组蒙版/混合像素一致性、Fabric 内逐个子图层交互、真实用户旧任务八张原图重放尚未完成专项验收。当前回归使用合成素材。
- 字体依赖执行机器；node-canvas、Skia、浏览器之间的字体测量与像素完全一致性未获保证。预览/打包在同一运行环境内重新渲染核对。
- Scene 使用单文件原子替换与事务收据，没有额外写前 journal；崩溃遗留锁可在确认原进程已退出且锁超过一分钟后恢复。
