# 拾页 AI 创作

本说明适用于已验证的统一 Command 协议 v2 创作包。先运行 `info` 确认协议和能力；不匹配就停止套用新参数。

## 开始

读取 `TASK.json`、`design/GUIDE.md`，查看 `assets/overview.jpg`；按需要看原图。
任务事实与限制来自 TASK，素材身份与物理信息来自 `assets/manifest.json`。
`scene.json` 是唯一作品状态，不是需要你重新手写的模板。

```bash
node runtime/shiye.cjs self-test
node runtime/shiye.cjs info
```

先考虑局部图文组合、书写面、叙事和材料取舍；再考虑整页关系。复杂工艺有用才使用，但不能因入口陌生就略过。

## 不会填写某个操作时

```bash
node runtime/shiye.cjs help
node runtime/shiye.cjs describe material.window
node runtime/shiye.cjs describe place
node runtime/shiye.cjs inspect
```

公共 `place / size / style / order` 在各适用操作中含义相同。
默认不读完整 Schema。不猜未知参数，不把示例 ID 当真实素材。
能力未实现时应报告，不以近似绘图冒充已完成的加工。

## 只通过 Command 创作

```bash
node runtime/shiye.cjs begin work/commands.json
```

运行时填写事务 ID 和基准 revision；你只填写 operations。
直接编辑 JSON 文本即可，不要编写 Python/JavaScript 去生成或修改 Scene。
允许用现有工具保存 JSON 文件，这不等于要求另写一套创作程序。

```bash
node runtime/shiye.cjs apply work/commands.json
node runtime/shiye.cjs preview
```

apply 自带格式、引用、实体、布局校验；通常不必额外 check。
复杂工艺可用 `check`，或用 `preview --commands work/commands.json` 在临时副本试做。
试做写入 `output/proposals/`，不覆盖正式预览，不改变 Scene。

## 看图后局部调整

实际打开正式 PNG，缩看整体、放大看文字与加工。
需要修改时重新 begin，新事务只包含需要改变的操作。
可用 `group.compose` 先组合，用 `layer.place` 整体定位或相对定位。
不直接改 `scene.json`，不使用旧版 instructions/craft-plan 文件入口。

## 交付

补齐真实素材使用与理由；重新预览并实际检查最终图。
使用 `review` 记录代理声明的审阅结果，不能声称这是自动视觉质量证明。

```bash
node runtime/shiye.cjs review --result pass
node runtime/shiye.cjs pack
```

交付 `output/preview.png` 与 `output/project.shiyeproject.json`。
JSON 使用单行紧凑格式；PNG 必须绑定同一 Scene、素材、字体和渲染配置。
用户另有交付要求时以任务指定为准。
失败时报告真实错误，不以旧预览或另行生成的图片充当最终结果。
