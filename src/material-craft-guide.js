// Executable capabilities only. Whole use remains valid; this is not an
// aesthetic quota and never overrides a task's explicit material permissions.
export const materialCraftGuide = `【素材工艺 v2：先决定如何用材料，再决定摆在哪里】
先查看每件真实素材和有效加工权限。对适合加工的图案纸、票据或胶带，比较完整、取局部、边缘加工、开窗/正负形与有目的的组合；完整贴纸或主体需要保护时可以 whole。不要为了凑工艺数量加工，不要求每页都有撕边或开窗。
统一遵守 source.processing 或本次素材加工方式。“保留完整”禁止所有实体加工，包括胶带截段。“少量裁剪”累计保留至少60%原材料面积；“自由拆解”也必须守住尺寸和来源。“不预设”允许自由拆解，仍受来源和尺寸约束。
已实现的边缘宏：在 edit_materials 或 upsert_materials/page.items 的 operations 中使用 {op:"edge",style:"torn",edges:["bottom"],depth_mm:1,period_mm:6,seed:42}。style 可为 torn（几何撕边）、ticket_notch（局部票根缺口）、postage（连续齿边）、fringe（有连接背条的流苏）、partial_tear（局部撕口）。edges 为 top/right/bottom/left 的不重复数组。局部缺口可用 position:0.5 表示沿该边的中点。深度不超过裁片短边20%，保留角部，过密轮廓会报错；不要伪称已模拟纸纤维。
先用 crop/trim/tape 取得真实区域，再做 edge 或已有 mask/diagonal/window。一个片段的 edge 宏先于开窗，不能叠加第二道外轮廓来改写已裁掉的材料；需要修改时用 replace 重放完整工序。
开窗仍是真实透明孔。现在用实际源轮廓和洞核验同一 unit 的材料占用：可在同一复合 page/upsert_materials 中创建窗框，以及与该窗口准确匹配的窗芯裁片；两件的外接矩形重叠并不等于用料重复。请保持各片 source crop/轮廓不相交；隐藏或放到页面外不能释放已取用的来源区域。
新的组合 relation 可用 {kind:"peek",target:"main-photo",edge:"right",exposed_mm:8,along_mm:0,rotation_offset:0}；目标旋转时按目标局部方向求解。underlay 使用 target、offset_mm:[0,0]、rotation_offset；bridge 使用 target、target2、anchor_from/anchor_to（目标局部0–1锚点）及 contact_mm。搭桥仅移动/旋转现有真实片段，长度不足会失败，不会拉长纹理。关系 target 填已创建的 piece/key，不填素材 alias；关系不能成环。
可以一次用 upsert_materials 或直接 page 提交完整工序和关系，无需为每条工艺额外请求一轮。compose_page 仍只提供基础放置/crop；之后可批量 edit_materials。物理边缘、数字手绘、最终正文分别建层。
已接入复合工艺计划 apply_craft_plan：可引用用户确认区域，也可在同一计划提出看图选区 observations；后者只在本次任务使用，不伪称用户确认。任意合法正负形用 cut_shape，分离裁片在 plan.pieces 中分别描述。父片拆分默认保留余料，过小碎屑明确记录。两孔平面穿插使用 plan.weaves，只投影显示片段，不额外消耗材料。文字镂空可以将本地字体生成的数值路径作为 cut_shape，保留字腔连接，不用白字遮盖冒充挖孔。目前没有三维折叠仿真，不能把平面穿插称为任意可制作折叠。
从一张尚未放入画布的原素材剪出多个对象时，plan.pieces 可分别指定看图轮廓、毫米几何路径或矩形范围，并在 sourcePartitions 声明该素材。默认把未剪区域生成备选余料；它们与人物仍共用同一个来源，不能相互重叠。若素材已在画布上，使用 consume + parentId 从现有父片拆分，不重新取用原图。
复核实际画面时检查加工是否服务主题、是否保住主体/文字、是否只是换一种机械套路。全是 whole 可以是合理选择；工艺说明、决策理由与错误信息不能写入最终正文。`;
