# 发布时复制什么

开发资料目录不是最终创作 ZIP。最终示意：

```text
START_HERE.md                  # F 已验证静态发行版
TASK.json                      # P + 素材引用，运行时生成
scene.json                     # 初始状态，由 TASK/素材/模板派生
assets/manifest.json           # M
assets/overview.jpg            # M + 总览规格
assets/*.png                   # M
api/common.schema.json         # F
api/commands.schema.json       # F，从唯一注册表构建
api/scene.schema.json          # F，完整原生 Scene，Codex 合并
api/task.schema.json           # F
api/assets.schema.json         # F
api/operations.json            # F，完整能力注册表
api/CATALOG.md                 # F，可选
api/errors.json                # F
api/*.md                       # F，按需高级说明，可不进入默认阅读路径
design/GUIDE.md                 # F
design/RECIPES.md               # F，局部示例不绑定任务
runtime/shiye.cjs               # F，真正已实现的唯一 CLI
runtime/*.cjs                  # F，共享引擎模块/已整合帮助和布局
runtime/capabilities.json       # 发行支持基线；self-test 另返回环境可用性
work/                          # 初始化为空；不塞入可误执行的旧命令
output/                        # 初始化为空
package.json                   # F，生产运行依赖
package-lock.json              # F，生产依赖锁定
release.json                   # F，发行版本/hash/feature gates
```

不要把 baseline/、tests/fixtures/、当前任务哈希、资料包根 package.json 或待实现能力清单冒充正式运行配置复制进去。

导出前：校验 TASK/manifest；验证图片 hash、短别名/路径；由同一输入构建 sourceContext；初始化 Scene；验证 source 绑定；运行打包结构自检；最后写 ZIP。
导出后的不同任务：比较所有 F 文件 hash 必须一致。发布过程对固定文件做签名或内容寻址，不允许导出器临时拼接 task 到 JS。
