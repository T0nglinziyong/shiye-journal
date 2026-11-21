# 当前执行规范

实际发布规范由 src/creation-command-spec.js + static/api/common.schema.json 生成，使用 runtime/shiye.cjs describe 查询；--full 才展开 Schema。此目录其余 static/operations.json、static/commands.schema.json、独立 command-help.cjs 及旧测试记录均为初始设计归档，不参加当前发布构建，不可作为当前命令能力来源。固定发行指南位于 release-v3。

---

# 拾页创作包：固定内容、统一协议与 Codex 接入资料

**交付性质：可复用的静态资料与开发模块，不是已经完成接入的新创作运行时。**

基于本次提供的 `拾页-GPT创作任务(2)(1).zip` 核对。没有修改 GitHub 仓库，没有声称已实现或验证复杂工艺渲染。

## 从哪里开始

用户看 `FILE_OWNERSHIP.md`；Codex 先读 `CODEX_HANDOFF.md`，再看 `static/api/PROTOCOL.md`、`SPATIAL.md` 和 `SCENE_INTEGRATION.md`。

- `static/`：不随素材和任务参数变化的候选发布内容。文档、公共参数、25 个常用命令定义、帮助模块、纯坐标计算内核。
- `tools/`：开发期的生成工具。从一份命令定义生成完整候选 Schema、索引、配方和测试事务，避免三套规范各改各的。
- `tests/`：可执行协议/纯几何测试，以及仍需 Codex 实现的端到端验收清单。
- `integration/baseline/`：从原 ZIP 原样保留的 Schema 和依赖配置，只用于防退化核对，不能冒充新实现。
- `integration/coverage-matrix.json`：原包全部 39 种命令的迁移清单，任何一项没有等价能力都不能宣布完成。

## 已完成与未完成的边界

已完成：固定入口说明、固定审美指导、公共参数约定、常用操作契约、任务与素材清单数据格式、按需 help/describe 模块、生成器、仿射/锚点计算模块及其测试。

待 Codex：接到真实仓库导出器，升级 Scene 局部变换和完整 Schema，保留高级工艺、材料账本与原生字段，接入统一 Command 执行器和 App 操作链，完善预览后端/字体配置、事务、pack、完整端到端测试。

**`static/api/commands.schema.json` 是候选协议，不能现在就覆盖旧包文件。**
旧包 `protocolVersion` 为 1；本资料采用 2，避免旧引擎误执行新参数。包格式版本、命令协议版本、Scene 版本、空间语义版本分别管理。

**没有交付一个缩减版 `scene.schema.json` 去覆盖原版。**
完整 Scene 必须以仓库实际模型为准；本资料仅提供 `scene-spatial.schema.json` 扩展片段和合并契约。高级原生能力仍需按覆盖清单加入同一注册表。`ConstraintRecord.spec` 与素材 `sourceSnapshot` 在片段中尚未收紧，正式版必须接回完整类型验证，不能用它们单独验收。

## 可立即执行的开发验证

```bash
node tools/build-contract.cjs
node tools/build-contract.cjs --check
node static/runtime/command-help.cjs help
node static/runtime/command-help.cjs describe material.window
node static/runtime/command-help.cjs describe place
node tests/math.test.cjs
python3 tests/validate_contract.py
```

Schema 测试需要开发环境已有 Python `jsonschema`。这不是给 AI 创作者增加的步骤；实际创作只调用统一 `shiye.cjs`。
Node 模块无第三方依赖；本次执行环境为 Node 22.16.0。这里的根 `package.json` 属于开发资料包，不是生产创作包的依赖清单。

## 发布条件

未完成 `tests/acceptance.json` 中运行时验收、完整能力迁移和新旧编辑器读写测试前，不得将此资料包直接标为“已支持全部新命令”的创作 ZIP。
正式导出器只复制经过发布的静态内容；不能复制本资料包的 README、baseline、开发测试，或本次测试用的虚拟素材 ID/哈希到用户任务。

本交付不含用户素材副本、任何字体文件、伪造预览或伪造视觉验收。
