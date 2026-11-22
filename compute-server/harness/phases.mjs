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

export function phaseGuide(phase,{styles=[],textMode='automatic'}={}){
  const rich=styles.some(style=>/丰富|层叠|拼贴|杂志/.test(style));
  if(phase==='direction')return '先依据素材和用户要求用 creation_plan 记录主题、配色、视觉锚点及可写位置。主角可以是一个、多个或没有单一主角。计划是可修改的工作假设，不是四阶段关卡。';
  return '像真实试摆一样循环：放素材与底纸、安排标题正文、加点缀、看自动预览，再按画面修改；这些动作可以交错。不要等到排版结束才考虑正文。每次缩小看完整双页，比较两页有色面积和视觉重心，允许不对称但要呼应；任何对象不得跨过中缝，标题、正文及大前景与外缘留可见纸边。可以叠放和局部遮挡，不必按格子填满。案例、技巧按需查阅，creation_phase 只是可选记录，不是交付前置条件。'+(rich?'丰富风格要有目的地充实，避免一页挤满、一页空洞。':'按任务风格决定疏密。')+(textMode==='none'?'本次不写文字。':'正文和标题可以早于或穿插素材摆放，确认清楚可读。');
}

export function phaseObservation(phase,{capture,spaceStatus,scene,feedback,advisory,previousReview,remainingSeconds}){
  const current=Object.fromEntries(Object.entries(spaceStatus.current||{}).map(([id,value])=>[id,{empty:value.empty,items:value.items,parkedIDs:value.parkedIDs,lastSeenTurn:value.lastSeenTurn}]));
  const changed=(spaceStatus.changed||[]).map(({id,items,parkedIDs,empty})=>({id,items,parkedIDs,empty}));
  const base={phase,spaces:spaceStatus.spaces,current,changed,remainingSeconds};
  if(phase!=='direction')return {...base,scene,feedback,advisory,previousReview};
  return {...base,scene:{sceneRevision:scene.sceneRevision,layers:scene.layers.filter(layer=>layer.surface==='page')},feedback,advisory:{observations:advisory.observations},previousReview};
}
