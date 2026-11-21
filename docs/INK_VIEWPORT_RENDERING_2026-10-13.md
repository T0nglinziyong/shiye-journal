# 拾页：可见优先加载与高保真自由书写（2026-10-13）

## 图片与页面加载

优先显示首屏和视口附近的占位/缓存/派生图。COS 素材预取约 220px，系列封面合成仅在离视口约 260px 内开始，搭配结果栅格化约 240px 内开始。移动端并发读取 4 个、桌面 6 个；网络队列根据用户最新滚动位置重新排序。素材库不提前读取高清原图，创作/详情区仍按显示尺寸、DPR 选图。

## 进入创作不自动同步

现有作品只读打开时仅在内存中补全历史记录，不调用保存函数。进入时记下本次会话的 saveVersion；退出或切后台时，只有本会话确实发生保存操作才补录 Scene 自动快照。普通返回不改变旧版作品的 isDraft 和 updatedAt。点击完成、实际画笔/图层修改、文字修改或主动保存仍正常持久化，历史旧上传队列仍可能独立继续同步。

## 自由书写双层架构

PointerEvent / pointerrawupdate / getCoalescedEvents
    → Scene 单位的原始点和压力数据
    → RAF 增量绘制在真实 DPR 的 HiDPI 临时 Canvas
    → pointerup 创建正确 Undo 并提交原始点
    → 立即挂载同一条平滑中心线的可编辑 SVG
    → 110ms 笔迹空闲合并保存、Scene DOM 协调、后台同步

实时画布和最终 SVG 使用一致的二次曲线算法，笔迹原始点不被破坏；bitmap 根据显示尺寸、设备像素密度和缩放调整，并且有像素内存预算与缩放 hysteresis，避免捏合缩放时每帧重新分配。橡皮仅首次真正触碰既有笔迹时创建 Undo。笔画开始时不再进行昂贵的全 Scene Undo 快照。离开、撤销、切换工具、切后台等动作会强制提交排队中已经完成的笔画。

iPad 浏览器仍受 WebKit/设备调度限制，不保证达到原生 PencilKit 的采样延迟。未来可以选用预测层和基于压力的可变宽度矢量轮廓，但预测点不能写回永久 Scene，避免推测轨迹污染历史。

## Action/State 后续迁移

新增 Matching 控制器，迁移筛选、排除/恢复、主素材、素材篮增删等 Action；编辑器缩放也改为 scoped Action。其余复杂的导入事务、AI 工作流、云端冲突、库存相关操作仍由 legacy Action 层保留，以避免同时重写存储/回滚协议。未来按业务域逐项迁移，并为每次迁移保留实际持久化和撤销测试。

## 验证入口

- npm test（包含 Ink、Action、只读会话单元测试）
- npm run test:ink-browser（真实 Chromium 下检查 DPI、实际像素绘制与缩放状态保留）
- npm run test:editor-browser（既有编辑器）
- npm run test:incremental-browser（既有 DOM 复用）
- iPad Safari / Apple Pencil 需实际做快速连续笔迹、橡皮、缩放和 Undo/Redo 的手工验收。

