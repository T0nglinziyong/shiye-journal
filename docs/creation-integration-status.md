> 当前绘画入口已统一为 graphic.add，点缀是构图作用；旧绘画命令不再接受。具体字段与边界见 unified-graphics.md 和实际 describe。

# 创作包接入状态（统一属性内核）

## 唯一执行路径

创作包只接受协议 2 的 37 个当前操作。没有 `native.*`、`advanced.v1.*`、协议 1 事务或 xMm/font_size/set 的外部别名。`src/v3-commands.js` 已删除，执行器不再制造协议 1 封套。

`creation-command-spec.js` 是操作签名的唯一来源；公共坐标定义复用 common.schema。注册表生成验证 Schema、默认简明帮助、显式 --full 帮助与固定配方。候选 static/operations.json 是历史设计资料，不在构建或执行链中。

## 底层与更新语义

`creation-scene-core.js` 复用受保护的 Scene 编辑、真实素材几何与账本，不发明第二份场景。`creation-node-update.js` 统一属性和单位换算，`scene-text-layout.js` 统一文字重排。

创建、text.update、layer.update、text.fit 共用文字测量规则。Scene 的 textLayout 保存 minimumHeight 和可选 lineHeightRatio；只改字体、内容、宽度不会遗忘高度意图。文字是完整内容，尺寸不够时增长；text.fit 不够时原子拒绝，不裁字。所有命令在更新尺寸之后计算锚点，随后求解 linked。

测量共享 Canvas 的 textLines 换行规则；编辑几何使用确定性估算字宽，最终 Canvas 按实际字体渲染。不能把几何一致性说成所有字体的逐像素一致性。人工 Fabric 的属性写回、文字保存、套索/组合/笔迹及检查器提交已逐步接入共享 Scene 内核；交互预览与输入法保持独立。原生字体/光标测量和纸张规格切换等尚未全面迁移，详见 [共享编辑内核](shared-editor-kernel.md)。

## 高级能力

曲线文字、格式与段落间距使用 style；矢量与笔迹局部几何使用 layer.update.geometry。material.glyphKnockout 接受 text/style/place 或 region；字形解析器只读本机指定字体，明确拒绝缺字和不支持的字体，不上传或保存字体字节。material.tape 使用同一 place，另有局部毫米 path、texture、caps。独立胶带段分配不同来源段身份。

裁切、分片、余料、窗芯、穿插继续调用既有几何算法。trim、diagonal、contour、edge、restore、replace、relate、layer.mask、layer.repeat、layout.reuse/align 通过同一事务表达。纸张图案、物理行距和中缝使用 page.update。新增原生数据插入仅限类型化节点，不允许 AI 提交任意来源或权限字段。

## 验收与边界

新增 creation-canonical-edit.test.js，比较创建与两种文字更新的完整几何，验证保存重开、最小高度、linked 跟随、曲线适配、实际字体镂空、折线胶带与多个来源段、所有边缘、替换/翻转、关系、盖印/复用和帮助大小。既有 ZIP 测试迁移到当前操作，保留物理账本、回滚幂等、篡改预览拒绝和 Node/Chromium 端到端验收。

发布结果以实际 CI 为准。visible 精确轮廓锚点、region: 布局容器、持续自动排列仍未发布；字体跨机器一致、真机 Safari/Pencil 不由合成测试证明。重新导出任务包，不尝试自动转换旧命令。

## 人工与 AI 的权限边界

共享内核由可信宿主传入 AI 或用户策略。人工素材视觉缩放、视觉复制、检查器裁片修改需要本次目标与来源状态绑定的内存确认；命令数据不能声明人工身份或继承确认。相关路径共享类型/锁/联动与事务校验，现有真实素材几何和账本规则继续有效。
