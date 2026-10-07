# 拾页开发与发布流程

本文件是仓库的正式分支与发布规则。与旧部署记录冲突时，以本文件和当前 CI / Vercel 配置为准。

## 分支职责

| 分支 | 用途 | 自动部署 |
| --- | --- | --- |
| `main` | 已验收、可对正式用户使用的当前稳定版本 | Vercel `shiye-journal` |
| `test` | 下一版本的集成、真机体验和发布前验收 | Vercel `shiye-journal-test` |
| `feature/*`、`fix/*`、`experiment/*` 等 | 独立功能、修复和实验开发 | 不自动部署 |

`main` 与 `test` 都是长期分支。其他开发分支应短期存在，完成后合入 `test`。

## 正常开发路径

```text
feature/* / fix/* / experiment/*
              ↓
             test
              ↓
      CI + 测试站实际验收
              ↓
       Pull Request
         test → main
              ↓
             main
              ↓
          正式环境
```

1. 新功能和普通修复不得直接以 `main` 作为开发分支。
2. 小修改可直接提交到 `test`；较大或并行任务使用 `feature/*`、`fix/*` 或 `experiment/*`，完成后先合并到 `test`。
3. `test` 每次更新后在 `shiye-journal-test` 验收。至少要求相关 CI 通过；涉及 iPad / Safari / Pencil / 图像识别 / 大文件时还需按功能做真机或专项验收。
4. 只有确认要发布时，才通过 Pull Request 将 `test` 合并到 `main`。
5. `main` 的每次变化都视为一次正式发布候选，必须能追溯到已验收的 `test` 版本。

## 紧急修复

若正式站必须立即修复，可以从 `main` 建立 `hotfix/*`：

```text
main → hotfix/* → main
                  ↓
               test 回灌
```

正式修复合入 `main` 后，必须立即把同一修复合回 `test`，避免长期分叉。禁止只修 `main` 而让 `test` 丢失该修复。

## 自动部署合同

仓库 `vercel.json` 只允许 Git 分支 `main` 和 `test` 触发 Vercel；其他分支默认关闭自动部署。

项目级职责：

- `shiye-journal`：Production Branch = `main`，Preview 自动部署关闭，只接受 `main` 的正式构建。
- `shiye-journal-test`：Production Branch = `test`，Preview 自动部署关闭，只接受 `test` 的测试构建。
- 其他历史 Vercel Project 不作为发布目标，应保持禁用或删除。

如果需要临时查看其他分支，使用明确的手动部署；不得通过修改长期分支规则来获得一次临时预览。

## CI 合同

- `Verify Shiye`：对 `main`、`test` 的 push，以及目标为 `main` 或 `test` 的 PR 运行。
- 浏览器专项回归：对进入 `main` 或 `test` 的相关 PR 运行；也允许手动触发。
- CI 失败不得被解释为“部署成功即可发布”。测试状态和 Vercel 构建状态是两个独立门槛。
- 自动化规则由 `tests/vercel-build-inputs.test.js` 等测试保护，避免误开其他分支自动部署。

## Codex / 自动化代理规则

开始修改前先确认当前分支：

- 普通开发：默认在 `test` 或从 `test` 新建短期分支。
- 不得为了方便直接在 `main` 开发普通功能。
- 未经用户明确要求，不得将未验收的 `test` 自动合入 `main`。
- 不得使用强推覆盖 `main` / `test`。
- 合并前先检查远端新提交、测试结果、私人数据和凭据。
- 发布后核对准确 Git SHA 与对应 Vercel Project；不能只凭“push 成功”判断网页已更新。

## 发布判断

`test` 表示“下一版”，`main` 表示“当前正式版”。

因此任何时候都应满足：

> `main` 可以落后于 `test`，但不应包含尚未回灌到 `test` 的长期独立功能；`test` 可以继续开发，但只有经过验收的状态才允许进入 `main`。
