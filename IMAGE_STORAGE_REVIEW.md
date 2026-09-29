# 图像处理与存储复核（2026-09-29）

## 实际图像测试

仅经用户明确许可把 `设计参考/测试` 的两张照片上传给 BRIA RMBG-2.0 官方 Hugging Face 演示。未上传 CeCe PDF、私人素材库或备份。另测试模型页面的公开 giraffe 示例。原图、返回 PNG 和透明棋盘检查图均在 `/tmp`，不进入仓库、Vercel 或 CI 基线。

RMBG 实际返回透明 PNG，两张照片 alpha 平均值分别为 0.528、0.263；公开长颈鹿示例为 0.085。这不是准确率。透明棋盘检查显示：两张照片都把整张承载纸及纸上的素材作为一个前景，第二张还保留纸外部分物体；长颈鹿能脱离环境。结论：去背景有效，但不能直接代替逐件素材／实例分割。没有把它接成默认识别，也没有把整纸蒙版声称为逐件抠图成功。[模型卡与许可](https://huggingface.co/briaai/RMBG-2.0)限定此模型的非商业使用；正式接入需另核商业许可、服务权限和费用。

本机真实 Chromium 直接执行应用 OpenCV Worker，检测两张照片纸张四点并透视校正：输出 707×1000、469×664，符合 A4 比例。原始校正图与 CLAHE 图平均 RGB 变化 14.10、11.65，仅说明处理确实生效，不能当质量评分。已查看校正结果。增加 Canny 闭合边缘与 Lab 色差候选，修复无可靠四角时返回 null 被当作异常。仍需人工拖点、浅色／复杂背景广泛样本和实体相机验收；CLAHE 不等于完整阴影分离或白平衡。

重跑本机检测（明确指定原图路径，脚本不上传）：

```sh
SHIYE_TEST_URL=http://localhost:5175 node scripts/vision-reference-browser.mjs /path/to/first.jpg /path/to/second.jpg
```

## Supabase 接入建议（未开通、未迁移）

按存储技能先评估安全与恢复，不直接改现有用户数据源。建议 Supabase Auth + Postgres 存元数据／版本方案 + 私有 Storage 存原图及处理版本；不能用公开图片桶保存私人手账。

现有 assets、series、projects、trash、meta 可保留 JSON 合同，增加 owner_id、revision 和更新时间。每表启用 RLS，只允许登录用户访问自身数据；浏览器只用 publishable key，service_role 不得进入前端。权限需分别测试未登录、用户 A、用户 B 的读写与删除。[RLS 文档](https://supabase.com/docs/guides/database/postgres/row-level-security)、[Storage 权限文档](https://supabase.com/docs/guides/storage/security/access-control)。

图像以 owner/id/version 路径保存，读写经鉴权／短期签名。先上传未引用文件，再事务提交元数据，失败留下可回收孤立文件，不先删除当前图。保存采用 revision 乐观并发检查，不能让两台设备最后写入静默覆盖。离线／鉴权失败明确报告，不悄悄把云端写入改成本机写入。

迁移前先验证 `.shiyepwa` 六表＋Blob 完整备份恢复，再用合成数据验上传、跨用户拒绝、重启、冲突、失败回滚、最近删除和完整导出；用户实际迁移需确认账号、地区及数据上传范围。Supabase 数据库备份不包含 Storage 对象的文件内容，必须另备份图像并校验字节与引用。[备份文档](https://supabase.com/docs/guides/platform/backups)。现有存储实现及数据本轮未迁移。
