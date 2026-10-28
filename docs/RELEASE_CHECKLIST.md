# 拾页正式发布前的基础验收清单

此文件配合仓库现有 DEVELOPMENT_WORKFLOW.md 和 ARCHITECTURE.md 使用。目标是让基础功能经得起升级、断网、权限变化和大素材库负载；不把少量 Chromium 合成测试声称为 iPad 真机验收。

## 环境与部署
- main / test 分属固定 Vercel Project，各自必须在 Vercel 控制台将 Production Branch 设置为相应 Git 分支。
- 在 CI 构建完成后，运行精确的 Commit SHA ↔ READY 核对。不能把旧 Commit 的 READY 当成本次成功。
- 如果出现 Vercel API 402 api-deployments-free-per-day，停止重复触发；这是日配额而非代码编译错误，应等待配额恢复或由用户调整 Vercel 计划。大量实验分支导致的取消部署也要统计。
- 通过 Vercel 环境变量 SHIYE_APP_ORIGINS 配置真实可访问的主域和测试域。Supabase Edge Function 需单独部署，不能认为 Git push 会自动发布它。
- main/test 分支保护必须在 GitHub 仓库管理界面设置：禁止强制推送、require PR、Verify Shiye 通过后才能合并。

## 存储与版本
- 当前普通浏览器存储含六张表；不得为清理缓存擅自更换 DB 名称或强制升级版本。
- 发布新的 Schema 时先制作完整可恢复备份，再做增量、幂等、不可逆操作受控的版本化迁移；验证旧数据读取与异常事务回滚。
- PR #38 的 ZIP v2、离线应急备份、跨标签页待同步合并仍需实际 iPad Safari 和隔离数据库演练；未通过不得开放给现有全部用户。
- 正式自动备份必须具有独立的 Supabase 与 COS 存储备份以及字节校验；只编写只读备份脚本不等于已部署自动备份。

## 不卡前台
- Image/AI Worker 只有在实际使用时启动。识别卡死要终止旧 Worker，不阻塞后续任务。
- 图片卡片使用缩略图按视口读取，进入编辑器才加载原图；检验至少 1000 件素材、100 份作品。
- 云端刷新只合并被动视图，不能重建正在编辑的 DOM、笔迹或输入焦点；断网不应悄悄切换到另一份资料。
- Service Worker 新版本由用户确认并本机持久化后激活，禁止自动强制重载编辑器。

## 账号与安全
- COS 签名只能按用户路径、对象方法签发；管理员跨账号只读；API 响应不公开长期密钥。
- RLS 与账号权限审计须针对普通账户、管理员、匿名用户及不同账户开展隔离验证。
- 不默认开启完整 AI 对话/私人图片诊断；提交问题时默认只使用脱敏信息。
- 外部服务 OAuth/Token 和私有原图禁止写入 Git 和 GitHub Actions artifact。
- Supabase Auth 当前检查仍提示泄露密码保护未启用，是否能打开受套餐限制；需由用户在后台确认并配置。

## 人工验收前必须说明的未完成事项
- 真实 iPad Safari / Apple Pencil 操作与性能。
- 真实照片分割数量/边界与 AI 创作的审美表现（当前阶段暂不优化）。
- 大容量 ZIP 恢复、数据迁移与隔离数据库恢复演练。
- Vercel 控制台 Production Branch 与日部署配额、正式独立备份服务环境。
