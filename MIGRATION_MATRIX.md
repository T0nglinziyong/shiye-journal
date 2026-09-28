# Swift → PWA 对照（2.0.10 基线）

| Swift 文件/模块 | PWA 文件/模块 | 结论 |
|---|---|---|
| `JournalAsset`, `JournalProject`, `LayoutDraft`, `MaterialSeries`, `PersistenceModels` | `src/domain.js`, `src/store.js`, `scripts/convert_swift_backup.py` | 主字段及本地保存已落地；复杂裁切记录仅保留，未执行。 |
| `RootView`, `AssetLibraryView`, `SeriesLibraryView`, `ProjectLibraryView` | `src/app.js`, `src/parity-ui.js`, `src/parity.css` | 三项顶栏、系列默认首页、素材标签、作品三标签及入口卡片已迁入；仍需逐屏 iPad 实机对照，系列多选和作品预览菜单尚未等价。 |
| `MatchingView`, `LocalRecommendationService` | `src/domain.js` 的 `recommend()`，搭配页 | 本地基础信号；不等同 Swift 完整评分和历史学习。 |
| `ImportWorkspaceView`, `DocumentScanService`, `VisionCutoutService`, `MaterialImportPipeline` | `src/image.js`, `src/perspective.js`, `src/paper-ui.js`、导入页 | 四角手动透视校正、白纸候选与高清裁切可用；精细实例遮罩、光照处理与自动测量尚未等价。 |
| `CanvasEditorView`, `PencilCanvasView`, `CanvasPrimitive`, `CanvasExportService` | 编辑器、`rasterize()` | 编辑器改为独立顶栏、第二排工具栏与画布工作区；笔迹、荧光笔、线条移除式橡皮、导出与样例矢量路径可用；套索、像素橡皮、打印毫米校准及复杂材质渲染待补。 |
| `CreativeCanvasAgent`, `CreativeAgentTools`, `CreativePlanContract` | `src/creative.js`, `src/creative-runner.js` | DeepSeek 多轮请求与视觉输入、局部工具合同、矩形裁切和原子回滚；真实接口稳定性、同源请求网关、剩余工具和审美复核待补。 |
| `BackupService`, 本地存储 | `src/store.js`, `scripts/convert_swift_backup.py` | PWA 完整备份/恢复和 Swift 二进制备份的初步转换。 |
| Swift 内置 CeCe 四页可编辑样例 | `scripts/prepare_cece.py`, `src/cece-seed.js`, `public/cece/` | 四份作品、42 件贴图素材及文字、矢量图层随站点首次加载；段落按 Swift 的 `cece-paragraphs-v1.json` 重建，旧样例只升级未改动的原文；字体与原笔迹仍需实机对照。 |

最高优先级原则仍是：AI 初稿不变更实物尺寸/库存；进入编辑器后用户数字自由编辑，素材库原记录不被改写。这个原则已进入 PWA 领域模型与测试，但未覆盖完整 Swift 材料加工操作，不能把尚未覆盖的路径视为验收通过。
