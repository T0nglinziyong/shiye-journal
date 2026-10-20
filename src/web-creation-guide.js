import {creativeTypographyGuide} from './creative-typography.js';
import {visualStyleBrief} from './creative-style-brief.js';
export const webWorkbenchInstructions=`拾页 · 可编辑手帐创作工作台
保留 source 原样；scene.json 的 page 是唯一权威的原生 Scene v2，工具和 Craft Plan 只是编辑它的输入。最终同时交付这一场景的完整 JSON 和 PNG。
1. 先读 task/context.json、task/GUIDE.txt（本次主题、要求和内容），逐件观察 materials/ 的图案、轮廓与文字。references/ 只供审美参考，不是可用素材。已有 scene.json 是当前作品，不用 examples/ 覆盖。
2. 读 task/CRAFT_CATALOG.txt 的能力概览，知道真实裁片、边缘、开窗、余料、穿插及组合关系可用；按需要查具体合同，不必全部使用。依据 GUIDE 中的素材职责比较两种不同的图文关系后选择一种。逐件决定完整使用、真实加工或舍弃；在 scene.json 的 materialDecisions 写 alias、choice 和具体 reason（这件材料承担什么作用、为何保留或裁切，不能只写“更好看”）。choice 为 intact / crafted / omitted；不能仅凭素材标题推断图案，也不按加工数量评分。交付时会将决定与实际图层核对。加工适用条件与做法见 task/CRAFT_CATALOG.txt，需精确编辑时再读 task/SCENE_REFERENCE.txt。
3. 默认直接编辑 scene.json 的 page.layers。也可写 instructions.json 并运行 node runtime/compile.cjs instructions.json；输入可为 {tools:[...]}、{plan:{...}} 或 {page:比例坐标便捷页面}。局部操作可运行 node runtime/inspect.cjs 取 baseSceneHash，再写 commands.json 并运行 node runtime/apply.cjs commands.json。合同分别见 schema/output.json、schema/tools.json、schema/craft-plan.json；所有路径都写回同一 Scene。
4. 运行 node runtime/preview.cjs 校验并直接生成 output/preview.png，不需 HTML。若缺少 Node Canvas，执行一次 npm install 后重试；需要排查环境时可运行 node runtime/self-test.cjs。构图预览.svg 仅供粗略参考。
5. 必须实际查看 output/preview.png，并阅读 output/scene-summary.json 中 quality.reading 的实际正文摘要；核对表达是否展开、素材是否显示、主体与阅读路线、文字可读性、裁切边缘及层次；发现问题就改对应 Scene 节点并重新 preview。生成文件不等于看过图片；不得伪造视觉验收。
6. 运行 node runtime/pack.cjs 核对逐件取舍、最终 Scene 与 PNG 摘要，生成单行紧凑的 output/project.shiyeproject.json 和 delivery-manifest.json。改动后必须重新 preview 和 pack。文件模式交付 output/project.shiyeproject.json 与 output/preview.png 两个可下载文件；复制文本模式交付 output/preview.png 下载链接和一个完整的 JSON 代码块（内容来自 pack 生成的同一文件，JSON 正文单行、不缩进，不省略字段；字符串内换行使用 JSON 转义）。勿用工具日志或 ZIP 代替图层。发送前重新打开这两个最终文件，逐项核对标题、正文句子与素材位置；只展示这一份 output/preview.png，不沿用上一轮图片、重画的预览或聊天中缓存的旧附件。delivery-manifest.json 中 reading 是本次真实正文摘要，核对失败须重新 preview/pack，不能把不同版本作为同一成品交付。
无法生成 PNG 时说明交付未完成；scene.json 可作为未视觉验收的工作稿保留。字体随运行环境变化，最终字体仍须在拾页应用内核对。不得捏造预览或用另画的图片代替。`;
export const webEditingGuide=`坐标与能力
page 为 App 原生 Scene。x/y 是画布中的中心坐标；width/height/fontSize/笔宽使用画布单位；毫米换算=毫米*canvas.height/physicalPageHeightMM。ink.points 是画布绝对坐标，p 是压感。vectorMask 是 0–1，组合蒙版参照整页；组合 children 不改成局部坐标。zIndex 在各自兄弟节点中决定叠放。
commands.json:
{"baseSceneHash":"inspect 返回的摘要","tools":[{"name":"move_elements","arguments":{"items":[{"key":"对象语义键或ID","x":0.4,"y":0.5}]}}],"edits":[{"op":"patch","id":"图层ID","values":{"opacity":0.8}}]}
工具参数是 schema/tools.json 里的比例/mm/pt 合同；直接 Scene 的字段是原生单位。不要混用。
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
字体镂空：node runtime/glyphs.cjs 本地有权使用的字体文件 文字 字号毫米；输出 output/glyph-geometry.json。把 geometryMM 传给 glyph-knockout 或 cut_shape/remove/geometry，实际预览中检查字腔连接。
静态层类型 material/text/shape/ink/group 全部可用；素材支持原始比例裁切、复合负形、撕边/齿边、窗口、余料与穿插；数字图形可任意尺寸、多色矢量路径；文字保持可编辑；每个 ink 含一笔压感路径，抬笔后建下一 ink，组合可任意嵌套至预算上限。暂不支持翻片、口袋和页面动作。
胶带是一类 material 专用图层，不占用普通素材的「一件只能用一次」规则；素材库仍可手动标记已使用或未使用。先看 task/context.json 中 tape 的真实宽度、长度、原图方向、非破坏性修平范围 flatCrop 和已确认重复纹样区间。便捷工具 draw_tape_strips 可在一批中画多段：当前每段用首尾两个点定义直线中心线，避免曲线拼接瑕疵；width_mm 可调；texture_mode=sample 只用有限原图，repeat 仅能用已确认的区间，stretch 可沿直线拉伸原图；端头为 square/angled/torn。也可以直接编辑原生 tapeStrip v2，包括归一化 flatCrop；但 x/y/width/height、baseWidth/baseHeight、bandWidthScene、pathLengthMM、points 与物理页比例必须一致，且素材引用必须是任务固定的原图版本。修平与沿路径拉伸只改变显示取样，不替换原 PNG 或篡改其他实物素材的尺寸。
AI 不可添加 manualVisualResize/manualVisualCopy 来逃避实物约束；基线已有手工变形可以保持。不得更改 source、纸张物理单位或私自换素材图片引用。`;
export function webArtDirection(source){return [
  '【本次视觉方向】',source.styles.map(s=>s+'：'+visualStyleBrief(s)).join('；'),
  '具体图文构思沿用本包共用的“构图与内容”指导，不另套模板。复用布局时重新选择主次；印章、曲线文字或镂空按需要使用，不按复杂度评分。',
  creativeTypographyGuide(source.baseDraft),
  '【内部看图自评，不要在最终回复中输出】检查实际画面，先缩看整页焦点与动线，再放大核对文字、素材边缘、层次和第二处值得看的细节。检查是否只是逐项说明图片、通用鸡汤或空泛标题；按本次文字策略修订。纯粹拼贴不新增文字。若发现问题，修改对应 Scene 节点并重新 preview；最终 Scene 与 PNG 摘要必须一致，不用旧预览验收新图层。'
].join('\n\n');}
