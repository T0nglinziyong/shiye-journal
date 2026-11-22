export const creativePhases=['direction','layout','craft','review'];

const shared=['creation_phase','creation_help','creation_inspect','workspace_view','inspect_materials','read_skill','creation_guide'];
const editing=['creation_apply','creation_undo','creation_recipe','workspace_create','workspace_close','segment_material','creation_apply_crops'];
const phaseTools={
  direction:[...shared.filter(name=>!['creation_help','creation_guide'].includes(name)),'creation_plan','search_references','search_writing_topics','read_case'],
  layout:[...shared,...editing,'search_references','search_writing_topics','read_case','read_template','explore_drafts','select_draft','creation_finish'],
  craft:[...shared,...editing,'search_references','search_writing_topics','read_case','read_template','explore_drafts','select_draft','creation_finish'],
  review:[...shared,...editing,'search_references','search_writing_topics','read_case','read_template','explore_drafts','select_draft','creation_finish']
};

export function toolsForCreativePhase(tools,phase='direction'){
  const allowed=new Set(phaseTools[phase]||phaseTools.direction);
  return tools.filter(tool=>allowed.has(tool.function.name));
}

export function phaseGuide(phase,{styles=[],textMode='automatic',pageMode}={}){
  const rich=styles.some(style=>/丰富|层叠|拼贴|杂志/.test(style));
  if(phase==='direction')return '先依据素材和用户要求用 creation_plan 记录主题、配色、视觉锚点及可写位置。先从原素材找可承托图案或文字的纸面：纹样纸可以衬托人物，印有标题的卡片若有清楚留白也可以写字；按实际可读区域判断，别只看“卡纸”名称。若有多段正文，预先考虑可写区域和段落顺序；区域可以位于同一底纸的不同位置、不同底纸、素材内部或纸面。主角可以是一个、多个或没有单一主角。计划是可修改的工作假设，不是四阶段关卡。';
  return '像真实试摆一样循环：放素材与底纸、安排标题正文、加点缀、看自动预览，再按画面修改；这些动作可以交错。已有书写卡、纹样纸或大纸片可直接打底；先找它们的可写区与露边，再决定是否还需要新增纯色纸。若书写卡有足够的清楚留白，优先试写一小段；可用 record-on-material（target、box、text、colors）让文字跟随素材。深色纸面用浅色字，并避开原有印字与花纹。底纸与图案至少一处相压，短字或小贴纸可以跨边；不要把每件素材排成互不接触的展示品。一次试摆尽量合批数个互相关联的操作，再看一张预览；不要每移动一枚小贴纸就单独消耗一轮。不要等到排版结束才考虑正文。若有多段正文，按内容与阅读顺序安排可写区域；它们可以位于同一底纸的不同位置、不同纸片、便签、素材内部或页面空白。纸层数量、大小和颜色由画面决定；避免把整篇文字硬塞进一个框，放新的纸层后检查它是否盖住已有文字。缩小看整张作品时，先看每页上/下、左/右的内容落点；若是双页再比较左右总色量；若计划用 Z 或 S 路线，指出实际的连续停留点，不能仅凭一句结尾文字声称路线完整。长正文与相邻主素材要有共同边线、共同中心或明确连接，别把正文孤立在页脚。留白可有意，但下方大片空洞须看是否有收尾。装饰应在手机整页预览中可见，并与已有颜色、形状或主题呼应。'+(pageMode==='spread'?'任何对象不得跨过中缝；':'')+'标题、正文及大前景与外缘留可见纸边。可以叠放和局部遮挡，不必按格子填满。案例、技巧按需查阅，creation_phase 只是可选记录，不是交付前置条件。'+(rich?'丰富风格要有目的地充实，避免一页挤满、一页空洞；上方图案与下方纸层不要像互不关联的两组展示品，至少用跨边压贴、共用纸面或明确的连接方向把主要簇串起来。':'按任务风格决定疏密。')+(textMode==='none'?'本次不写文字。':'正文和标题可以早于或穿插素材摆放，确认清楚可读。');
}

export function phaseObservation(phase,{capture,spaceStatus,scene,feedback,advisory,previousReview,remainingSeconds}){
  const current=Object.fromEntries(Object.entries(spaceStatus.current||{}).map(([id,value])=>[id,{empty:value.empty,items:value.items,parkedIDs:value.parkedIDs,lastSeenTurn:value.lastSeenTurn}]));
  const changed=(spaceStatus.changed||[]).map(({id,items,parkedIDs,empty})=>({id,items,parkedIDs,empty}));
  const base={phase,spaces:spaceStatus.spaces,current,changed,remainingSeconds};
  if(phase!=='direction')return {...base,scene,feedback,advisory,previousReview};
  return {...base,scene:{sceneRevision:scene.sceneRevision,layers:scene.layers.filter(layer=>layer.surface==='page')},feedback,advisory:{observations:advisory.observations},previousReview};
}
