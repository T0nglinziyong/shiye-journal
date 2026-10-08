# .shiyepwa ZIP 完整备份 v2（暂存发布候选）

> 现有 PR #38 中实现。代码与现有正式网站相互隔离，未经 CI、Safari/iPad 实机与数据恢复演练不得合并正式版。

## 容器结构

扩展名继续使用 `.shiyepwa`，新输出 MIME `application/zip`，文件头为 `PK\x03\x04`；不是旧版 Base64 JSON。

```text
<name>.shiyepwa
├── manifest.json
├── data/
│   ├── assets.jsonl
│   ├── series.jsonl
│   ├── projects.jsonl
│   ├── meta.jsonl
│   ├── trash.jsonl
│   └── blobs.jsonl
└── blobs/
    ├── 00000001.bin
    └── ...
```

`manifest.json` 保存每个文件的原始字节数和 SHA-256；`blobs.jsonl` 记录 MIME、Blob ID 与独立文件的映射。原始图片**不再 Base64 编码到一个大 JSON 对象中**，也不做改变像素的重新压缩。普通图片/ZIP 元数据文件存为 ZIP 无压缩条目，以减少额外 CPU 使用。

## 运行方式与前台性能

- 仅用户主动点击“导出完整备份/从备份恢复”时动态加载 ZIP 组件。
- ZIP 序列化、图片 SHA-256 和解压在独立 Web Worker 完成，不阻塞画布操作和手势渲染。
- 每张原图按 Blob stream 读取；写入端确认一个 ZIP 块后 Worker 才读取下一块，避免无限积累上传/导出缓冲。
- 在提供 `showSaveFilePicker` 的桌面浏览器，直接将 ZIP 块写到用户选择的文件，避免拼成完整 Blob。
- 在不支持 File System Access 的浏览器（典型 iPad Safari）使用内存 Blob 和下载/分享，**当前明确限制为 192 MiB**；超限时拒绝导出，不产生被误当成完整备份的文件。待专门实现并验证 OPFS / Safari 分块导出。
- ZIP 恢复先在 Worker 流式读入各 ZIP 条目、验证大小和哈希，再一次性提交完整六表；为了 Safari 安全，**当前解压总大小限制为 256 MiB**。它还不是可恢复无限容量的方案。
- 工作中的编辑和后台同步不因“正在 ZIP 处理”被全局锁住；但用户主动执行最终恢复，会在校验后进入必要的独占提交阶段，避免数据竞争。

## 防丢失安全约束

- 新 ZIP 只在全部源图片成功读取、云端 revision 前后相同后才结束。若用户选择直接文件写入，任何失败均中止该文件写入。
- ZIP 校验拒绝路径穿越、重复条目、哈希不一致、图片丢失、非法 ID 和错误引用；未通过前不改任何正式资料。
- 恢复沿用原本的六表本地事务 / Supabase 修订提交，不为备份另开静默数据源。
- **旧 JSON 格式 v1 的 .shiyepwa 仍可导入**，新导出统一 ZIP v2；旧导入执行原有结构与完整性检查。
- 本功能不包括 Supabase 账号、COS 后台全部未引用对象的管理员级灾难恢复；独立云端管理员备份参见 `docs/cloud-backup-runbook.md`。尚未同步的本机修改另用 `.shiyerecovery` 应急包。
- 用户备份文件可能包含照片、私人日记文字；下载/分享时应保护好文件，且不可传入公共 GitHub 仓库或公开 CI artifact。

## 验收门槛

1. `Verify Shiye` 通过：包括旧 JSON 恢复测试。
2. 独立 Chromium 真浏览器测试：ZIP Worker、六表、独立图片字节不变、故意破坏后拒绝恢复。
3. 真正 iPad Safari：正常和大图导出、取消、网络断开、低内存、文件分享到“文件”App。
4. 断网 + 同时编辑的 ZIP 导出，确保没有任何默默改写/丢弃本地待传数据。
5. 在独立测试库验证 ZIP 真实恢复：图片与作品引用一致，强制中止恢复没有部分写入。
6. 确认不改变主编辑器冷启动时间和导入/创作操作流畅性。

未通过 3–5 时不要将“ZIP 已可生成”误称为“长期可靠的大容量备份已完成”。
