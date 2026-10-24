import {creativeTypographyGuide} from './creative-typography.js';
import {visualStyleBrief} from './creative-style-brief.js';
export const webWorkbenchInstructions=`拾页 · 可编辑手帐创作工作台
保留 source 原样；scene.json 的 page 是唯一权威的原生 Scene v2，工具和 Craft Plan 只是编辑它的输入。最终同时交付这一场景的完整 JSON 和 PNG。
文件速查：先读 task/BRIEF.txt、task/GUIDE.txt、examples/instructions.json，并看 materials/ 图片。常用能力是素材排版与裁切、可编辑文字、图形和荧光笔；直接写简短 instructions.json。task/context.json 保留完整任务来源。schema/convenient-page.json 是简版页面字段；多片裁剪、余料或穿插才查 schema/craft-plan.json；使用高级工具才查 schema/tools.json；直接编辑完整 Scene 才查 schema/output.json。不要逐个通读 schema/。
1. 先读 task/BRIEF.txt、task/GUIDE.txt 并逐件查看 materials/ 图片；task/context.json 保留完整任务来源，只有需要精确来源字段时才读。已有 scene.json 是当前作品，不用 examples/ 覆盖。schema/ 与 task/SCENE_REFERENCE.txt 按需查阅，不要为熟悉任务全文读取。
2. 先根据素材印刷字、轮廓和可写面确定本页真正要表达的内容，并同时安排主体、文字段落、图形、圆形与荧光笔等笔迹。文字内容不是最后填进剩余空隙的占位符；灵感随写也应把想法展开，避免几句口号加大块未完成的留白。不要吝啬有意义的装饰：主体形成后主动尝试图形、手绘、文字变化和小素材在多个区域的呼应，再看真实预览调整。只对具体的遮挡、拥挤或层级冲突删减，不默认极简；不以工具数量评分。可以在脑中比较不同图文关系，但不必制作粗排候选图；完整场景的真实预览才决定成品质量。
3. 优先在简短的 instructions.json 里一次写齐图层意图、书写内容及每件素材的 materialDecisions，直接运行 node runtime/preview.cjs instructions.json 编译并预览；参考 examples/instructions.json。只需编译时可运行 node runtime/compile.cjs instructions.json。图层 id、素材 piece、完整使用操作和未指定的默认位置属性由编译器补齐，只有需要跨图层引用时才显式编号。图形 kind 不限于示例圆形，矩形、星形、标签、箭头、方格和自由矢量等见 schema/convenient-page.json。编译器负责展开素材真实尺寸、来源字段和原生 Scene，不要手写这些冗长字段。materialDecisions 为 [{"asset":"m1","choice":"intact|crafted|omitted","reason":"与实际画面一致的具体理由"}]，每个 alias 一条；漏写时 pack 会拒绝。已有 scene.json 的局部修订直接改对应节点，或用 commands.json 与 node runtime/apply.cjs。局部修订后运行无参数的 preview，不再用旧 instructions.json 重编整页。按需阅读 task/CRAFT_CATALOG.txt；完整使用也可以是最佳选择，不按加工数量评分。需要多片裁剪时查 schema/craft-plan.json；精确操作查 task/SCENE_REFERENCE.txt。
4. preview 生成 output/preview.png；不需 HTML。缺少 Node Canvas 时执行一次 npm install 后重试。实际查看 output/preview.png 的整幅和存在问题的局部，对照 output/scene-summary.json 的 quality.reading：文字是否足够表达本页、纸面是否像最终状态、留白是否有意、图形与荧光笔是否真正参与叙事、素材与文字是否互相遮挡。只修改发现问题的图层并重新 preview；不为凑轮次重复渲染。构图预览.svg 仅供粗略参考，不得伪造视觉验收。
5. 运行 node runtime/pack.cjs 核对逐件取舍及最终 Scene 与 PNG 摘要，生成单行紧凑的 output/project.shiyeproject.json 和 delivery-manifest.json。文件模式交付 JSON 与 PNG 两个可下载文件；复制文本模式交付 PNG 链接与完整 JSON 代码块。勿用日志、ZIP 或旧预览代替成品。发送前重新打开最终文件，核对标题、正文、素材位置与 PNG 一致；改动后必须重新 preview 和 pack。
无法生成 PNG 时说明交付未完成；scene.json 可作为未视觉验收的工作稿保留。字体随运行环境变化，最终字体仍须在拾页应用内核对。不得捏造预览或用另画的图片代替。`;
export const webEditingGuide=`坐标与能力
page 为 App 原生 Scene。x/y 是画布中的中心坐标；width/height/fontSize/笔宽使用画布单位；毫米换算=毫米*canvas.height/physicalPageHeightMM。ink.points 是画布绝对坐标，p 是压感。vectorMask 是 0–1，组合蒙版参照整页；组合 children 不改成局部坐标。zIndex 在各自兄弟节点中决定叠放。
commands.json:
{"baseSceneHash":"inspect 返回的摘要","tools":[{"name":"move_elements","arguments":{"items":[{"key":"对象语义键或ID","x":0.4,"y":0.5}]}}],"edits":[{"op":"patch","id":"图层ID","values":{"opacity":0.8}}],"materialDecisions":[{"asset":"m1","choice":"crafted","reason":"按实际裁片说明处理理由"}]}
工具参数是 schema/tools.json 里的比例/mm/pt 合同；直接 Scene 的字段是原生单位。不要混用。
初稿 page、后续 Craft Plan 和 commands 都修改同一 scene.json。每次按当前 inspect 的 sceneHash 编辑；加工改变素材取舍时，在本批 commands 或 plan 输入中同步更新 materialDecisions。初稿以后不要再次编译旧 page，避免清除新生成的加工图层。
精确操作：
patch: {id,values} 修改任意已实现静态属性（身份与 children 除外）；可调字体、路径、压感、颜色、透明度、混合、蒙版、形状等。
insert: {node,parent?} 插入完整原生节点；实体素材优先由工具建立来源和真实尺寸。
delete: {id}；group: {ids,id,name?}；ungroup: {id}。
move: {id,parent:null或组ID,before:同级节点ID或null} 移动图层到子树并调整叠放。
transform-group: {id,transform:{dx,dy,rotation}} 按现有组合变换中心刚性变换，素材不缩放。
replace-material: {id,assetID} 把现有真实素材图层换为本次任务素材，保留中心、旋转、层级与整体样式；裁片/孔洞重置，新框按新素材真实毫米尺寸计算，绝不拉伸实物。先看实际预览，再微调周围布局。
repeat-stamp: {id,placements:[{x,y,rotation?,scale?,fill?,zIndex?}]} 以一个数字图形作为印章母版，盖出独立可编辑图形；仅复制数字图形，不复制真实素材。
reuse-layout: {layout:完整 Scene v2,prefix,materialMap:{旧素材ID:本任务素材ID}} 将另一页的可编辑图层树按画布比例带入当前页；数字图形、文字、笔迹保持结构，真实素材只在明确映射后放入，且按新素材实物尺寸生成。没有映射的素材留空，供重新构思；新层追加到当前页，若要替换旧排版须显式删除旧层。
glyph-knockout: {id,geometryMM,originMM:[x,y]} 把 runtime/glyphs.cjs 输出的 geometryMM 作为真实负形切除，originMM 是当前素材裁片左上角起算的毫米偏移。只保存数值路径，不保存字体文件；会拒绝切断成多个不相连纸片的结果。
曲线文字：text 节点设置 curveHeight（画布单位，正值向下弯、负值向上弯），保持单行和完整编辑框；普通文字为 0。曲线字与普通字由同一 Scene 绘制函数供编辑画布和导出使用。
整页替换：{baseSceneHash,page:完整原生Scene}，与 tools/edits 互斥；适合直接改数据后的原子提交。
inspect 提供每个节点完整字段，不止摘要。所有编辑共享锁定、用户接管、固定素材版本、加工权限、尺寸/来源用量校验。无效命令返回结构化错误且不覆盖工作文件。
原生路径示例：vectorPaths=[[[0,0],[1,0],[0.5,1]]]；多色图形 vectorLayers=[{fill:"#8fa88d",paths:[[[0,0],[1,0],[0.5,1]]]}]。vectorMask={outer:[[0,0],[1,0],[1,1],[0,1]],holes:[[[0.2,0.2],[0.4,0.2],[0.4,0.4],[0.2,0.4]]]}；轮廓不可自交。高级裁片 materialMask / craftDisplaySlices 由工艺工具生成，改动后须通过来源几何与物理校验。
高级图形可在 graphic.add 的 geometry.options 指定内部结构，例如 {kind:"weeklyTable",options:{rows:4,columns:7,showOuterBorder:false,showHeader:true}}；后续用 layer.update 的同一 geometry 更新，或在原生 Scene 局部 patch shapeOptions。格纹、点阵、条纹可调 spacing / dotSize / angle；便笺和表格可调 rows / columns / 内外线 / 标记；标签、缎带、气泡、花边等可调 depth / count / tailPosition / radius。paperclip 可调 clipGap / innerLength，postageFrame 和 ticketFrame 是留出文字空间的透明边框，可调齿边或凹口及 showInnerBorder；颜色用 style.stroke 指定。只传需要改变的字段，其余保持默认，具体合法范围看 schema/tools.json 的 ShapeOptions。
字体镂空：node runtime/glyphs.cjs 本地有权使用的字体文件 文字 字号毫米；输出 output/glyph-geometry.json。把 geometryMM 传给 glyph-knockout 或 cut_shape/remove/geometry，实际预览中检查字腔连接。
静态层类型 material/text/shape/ink/group 全部可用；素材支持原始比例裁切、复合负形、撕边/齿边、窗口、余料与穿插；数字图形可任意尺寸、多色矢量路径；文字保持可编辑；每个 ink 含一笔压感路径，抬笔后建下一 ink，组合可任意嵌套至预算上限。暂不支持翻片、口袋和页面动作。
胶带是一类 material 专用图层，不占用普通素材的「一件只能用一次」规则；素材库仍可手动标记已使用或未使用。先看 task/context.json 中 tape 的真实宽度、长度、原图方向、非破坏性修平范围 flatCrop 和已确认重复纹样区间。便捷工具 draw_tape_strips 可在一批中画多段：当前每段用首尾两个点定义直线中心线，避免曲线拼接瑕疵；width_mm 可调；texture_mode=sample 只用有限原图，repeat 仅能用已确认的区间，stretch 可沿直线拉伸原图；端头为 square/angled/torn。也可以直接编辑原生 tapeStrip v2，包括归一化 flatCrop；但 x/y/width/height、baseWidth/baseHeight、bandWidthScene、pathLengthMM、points 与物理页比例必须一致，且素材引用必须是任务固定的原图版本。修平与沿路径拉伸只改变显示取样，不替换原 PNG 或篡改其他实物素材的尺寸。
AI 不可添加 manualVisualResize/manualVisualCopy 来逃避实物约束；基线已有手工变形可以保持。不得更改 source、纸张物理单位或私自换素材图片引用。`;
export function webArtDirection(source){return [
  '【本次视觉方向】',source.styles.map(s=>s+'：'+visualStyleBrief(s)).join('；'),
  creativeTypographyGuide(source.baseDraft,{publicCommands:true}),
  '本次风格只决定倾向，不套固定版式。文字、纸片和小图形共同决定主次；按 design/SKILL.md 创作，再看实际画面并依 design/REVIEW.md 修订。'
].join('\n\n');}
