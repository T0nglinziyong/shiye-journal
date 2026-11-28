# 创作资源的唯一来源

仓库是编辑源，经过验证并发布到 `shiyejournal.vip` 的准确 Git SHA 是发布源。字体注册只维护 `src/assets/fonts/manifest.json`；Skill 只维护 `creative-agent/skills/`；工具与渲染只维护现有 `src/` 和 `creative-agent/runtime/`。手机不上传这些资源。

构建自动生成 `creation-resources.json`，按文件内容计算资源版本。清单覆盖字体原件及许可、Skill 正文和图示指纹、Scene 工具、渲染及 Harness。App 将资源版本放入任务设置；服务器验证本机资源指纹与任务版本相同才执行，并将版本保存进检查点和任务进度。缺字与损坏文件不通过改名或静默换字体掩盖。新任务需要当前发布资源，已运行任务在更新前完成。

第三方教程 PNG 保存于服务器私有图包；仓库只保存已审核的来源和 SHA256。设置 `SHIYE_CREATION_ILLUSTRATIONS_DIR` 后，加载器验证每张图的字节；更新 Skill 引用图示时须先准备对应图包。图片不随 App 静态发布。

## 自动同步

`scripts/sync-compute-release.mjs` 读取线上 `/version.json`，获取已经发布的准确 SHA，只接受本仓库 `test` 历史里的提交。它创建不可变 checkout、安装锁定依赖、构建资源并与线上清单逐项内容摘要核对，预检字体与图包。通过后发送排空信号，停止接收新 MQTT 消息，等待已有计算结束，再原子切换 `current` 链接并重启服务。MQTT 持久会话及原任务领取协议恢复后续任务；不扫描空闲数据库。

计算服务配置 `SHIYE_RUNTIME_STATUS`，每两秒仅写本机运行状态。同步器使用同一路径和 `SHIYE_RELEASE_ROOT`，由用户服务 timer 每两分钟检查线上发布版本。没有新版本不会安装依赖、重启或查询 CloudBase 数据库。同步失败保留旧版本；若已进入排空则重启原服务以恢复接收。

App 与服务器发布之间存在短暂切换窗口，旧 App 的创作请求会明确提示更新并保留原稿。不能保证一台断网手机立即更新；重新联网加载新版本后即可与服务器对齐。后台运行中的作品不热换字体或工具，检查点恢复也核对原版本。

## 发布

先运行 `npm test && npm run test:ui`。经 PR 合并 `test` 并核对站点 SHA 和资源版本。计算服务的 `WorkingDirectory` 与 `ExecStart` 均指向 `SHIYE_RELEASE_ROOT/current`，字体与 Skill 不另行人工复制。首次安装同步器需要先将现行计算服务切到包含状态协议的版本，之后再启用 timer。

作者上游发布新字体不等于自动批准替换。下载、授权核对、视觉测试和清单更新通过后才成为拾页的新发布资源，避免不同机器自行下载到不同版本。
