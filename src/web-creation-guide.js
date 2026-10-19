import {creativeTypographyGuide} from './creative-typography.js';
import {visualStyleBrief} from './creative-style-brief.js';
export const webWorkbenchInstructions=`拾页 · 可编辑手帐创作工作台
保留 source 原样；仅修改 title 和工作 Scene。
唯一权威：scene.json 的 page 是 App 原生 Scene v2（sceneVersion=2）。最终返回这个完整图层 JSON 和对应 PNG 预览图；工具和 Craft Plan 都是修改它的输入，不是另外两种交付格式。
1. 先读 task/WORKFLOW.txt 与 task/context.json、task/GUIDE.txt（本次主题、要求和内容）、task/CRAFT_GUIDE.txt、task/CAPABILITIES.json、schema/output.json（同 schema/scene.json）。观察 materials/ 所有候选图，区分真实图像内容、元数据与推测。references/ 仅供审美参考，不是可用素材。
2. node runtime/self-test.cjs 检查运行环境；node runtime/inspect.cjs 输出完整图层、来源、当前 sceneHash 和质量提示。工作文件预先包含当前作品，不能以示例替换用户已有画面。
3. 可以直接编辑 page.layers（原生画布单位，非比例），也可写 commands.json 后 node runtime/apply.cjs commands.json。命令必须含 inspect 得到的 baseSceneHash；tools 使用 schema/tools.json 的便捷工具，edits 使用 task/EDITING.txt 的精确操作。两者写回同一工作文件，整批失败不改文件。
4. 初次整页构思也可以写 instructions.json，内容为 {tools:[...]}、{plan:{...}} 或 {page:比例坐标便捷页面}，执行 node runtime/compile.cjs instructions.json。这些是临时输入，编译后工作文件始终是原生 Scene；直接修改最终 Scene 无需回译成工具。高级 observations、pieces、weaves 见 schema/craft-plan.json，全部编译为独立、可编辑图层。
5. node runtime/preview.cjs 重新校验并生成 output/画面预览.html、scene-summary.json 和 validation-report.json。用环境允许的真实浏览器加载 HTML，等 SHIYE_RENDER_READY=true，查看 SHIYE_RENDER_REPORT，并调用 window.SHIYE_EXPORT_PREVIEW()，把返回对象保存到 output/canvas-capture.json；执行 node runtime/save-preview.cjs output/canvas-capture.json，生成 output/preview.png。此方法直接读取渲染完成的 Canvas，保留 sceneHash。若环境政策阻止浏览器操作，报告该限制，不绕过策略，不声称已经看图。
6. 必须实际查看渲染图片，按 task/VISUAL_REVIEW.txt 检查内容、可读性、层次和手帐风格；需要时局部调整并重新渲染。在聊天中实际展示 Canvas PNG（用户允许时）。不能用 output/构图预览.svg 冒充 Canvas。阅读报告不等于看过图。Node 不为你判断好看。
7. node runtime/pack.cjs 校验并生成 output/project.shiyeproject.json、delivery-manifest.json。清单绑定最终 Scene 与 JSON 哈希；任何再次修改都须重新预览和 pack。聊天消息的交付模式拥有最终优先权：文件模式交付 output/project.shiyeproject.json 与 output/preview.png 两个可下载文件；复制文本模式只交付实际 output/preview.png 下载链接和一个完整的紧凑单行 JSON 代码围栏（内容来自 pack 生成的同一 JSON，不能另生成 JSON 文件）。HTML/SVG 或仅声明已渲染不能替代 PNG；勿交付工具日志或 ZIP 来代替图层。成功时不要再添加过程解说、画面自评或其他文字。
没有可用浏览器、无法导出 PNG 时，说明交付未完成；scene.json 可作为未视觉验收的工作稿保留。若仅字体缺失，仍交付实际 PNG 并指出字体未验收。不得捏造预览或用另画的图片代替。`;
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
  '【本次审美方向】',source.styles.map(s=>s+'：'+visualStyleBrief(s)).join('；'),
  '服从用户明确要求和素材本身。审美建议不是模板：自由手帐不必套标题—插图—正文三段布局，不必统一做旧，也不必放满素材。',
  '先提出两种不同的内部构图草案，比较叙事与视觉关系后择优；可以用图文错层、主体/陪衬、留白与密度对比形成阅读路线。不要把所有素材当商品目录等距陈列，除非用户明确需要标本/收藏网格。',
  '从实际素材提取主色与少量强调色；保留纸张、透明边缘、票据、胶带和照片之间的触感差异。旋转和叠压要有固定、遮挡或叙事理由，不给所有元素随机角度。完整使用与复杂加工都可以优秀。',
  '数字印章、曲线文字、镂空和旧布局都按主题需要使用：重复印章应有节奏与停顿，不能铺满页面；曲线文字先保证阅读顺序；替换素材后重新看新轮廓与空白的关系；复用布局时重新选择主次，不照搬旧作品。',
  '图文相互回应：用户事实与原文优先，正文像真正记录，不是设计说明；没有事实不编造私人经历。标题、正文、小注有清楚主次，避免所有层都争抢注意力。数字装饰支持主题，不伪装成额外实物库存。',
  creativeTypographyGuide(source.baseDraft),
  '【内部看图自评，不要在最终回复中输出】逐项核验实际画面和需要修改的对象 ID：主题/内容是否满足；主视觉是否明确；阅读顺序是否自然；文字是否可读；叠压是否有意；留白是否有作用；手帐材质与风格是否一致。自评只用于内部修订，不附加说明性文字或分数。',
  '若发现问题，修改相应 Scene 节点并重新看图；同一局部无法改善时重排，不用无限缩小正文或拉伸实物来掩盖。交付前核对最后 Scene 哈希，禁止用旧预览验收新图层。'
].join('\n\n');}
