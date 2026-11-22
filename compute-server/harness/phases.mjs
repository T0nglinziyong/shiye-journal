export const creativePhases=['direction','layout','craft','review'];

const shared=['creation_phase','creation_plan','creation_help','creation_inspect','creation_preview','creation_review','workspace_view','inspect_materials','read_skill','creation_guide'];
const editing=['creation_apply','creation_undo','creation_recipe','workspace_create','workspace_close','segment_material','creation_apply_crops'];
const phaseTools={
  direction:[...shared.filter(name=>!['creation_help','creation_guide','creation_preview','creation_review'].includes(name)),'search_references','search_writing_topics','read_case'],
  layout:[...shared,...editing,'search_references','search_writing_topics','read_case','read_template','explore_drafts','select_draft'],
  craft:[...shared,...editing,'search_references','search_writing_topics','read_case'],
  review:[...shared,...editing,'search_references','search_writing_topics','read_case','creation_finish']
};

export function toolsForCreativePhase(tools,phase='direction'){
  const allowed=new Set(phaseTools[phase]||phaseTools.direction);
  return tools.filter(tool=>allowed.has(tool.function.name));
}

export function phaseGuide(phase,{styles=[],textMode='automatic'}={}){
  const rich=styles.some(style=>/丰富|层叠|拼贴|杂志/.test(style));
  const common='阶段结束用 creation_phase 提交对当前结果的具体观察、尚存问题与调整。阻断当前阶段的问题先修；可在下一阶段解决的细节写入 adjustments 并带入待办。每次编辑后的预览可直接用于下一次调整，不必每次单独调用 creation_review。技巧和案例可按需查阅，配方是推荐而非数量指标。';
  const guides={
    direction:'阶段 1/4 定方向：根据素材和用户要求选书写主题、风格、配色与素材关系。可以有一个、多个或没有单独的主角；说明哪些素材构成视觉锚点，哪些只用于打底或点缀。用 creation_plan 记录决定；完整计划会通过结构检查并自动进入布局阶段。未解决的未来构图风险写入计划的应对方式，不要停在方向阶段反复查询编辑工具。可查 journal-color、journal-writing、journal-composition 和案例。',
    layout:'阶段 2/4 打底与构图：参考合适的案例和构图技巧，确定大纸、素材簇、文字区、叠压关系与阅读路线。可选居中、偏置、跨页、散点或多焦点；不设四周留白配额。正文位置从布局时就预留，也可在可读的素材上。可查 journal-composition、paper-layering、photo-story 与风格专题。',
    craft:'阶段 3/4 装饰与书写：在构图上加入标题层级、正文、边注、荧光笔、手绘图形和局部点缀；按画面需要选择技巧，不必凑工具数量。简单路线使用 graphic.add 的 geometry:{kind:"sketch",motif:"trail",seed:数字,waypoints:[[0到1,0到1],...]}，避免猜测 path.points 格式；旋转写在 place.rotationDeg。文字覆盖素材时核对原有印字与纹样，只在足够清楚的区域落字。可查 journal-lettering、journal-text-layout、journal-writing、journal-accents、journal-graphics、journal-color。',
    review:'阶段 4/4 迭代审查：看真实画面，按计划检查主题、层次、素材关系、配色、可读性和视觉密度；问题可以直接修改并重看。最终用 creation_finish.review 交付，仍可回到前一阶段。'
  };
  return guides[phase]+' '+(rich?'本次丰富风格应有充实的页面与有意的叠放、装饰；大面积空白只有形成明确阅读节奏时才保留。':'留白和装饰以任务风格与真实画面为准。')+(textMode==='none'?'本次不写文字。':'')+' '+(phase==='direction'?'':'阶段检查的 issues 只填仍需处理的问题；非阻断细节在 adjustments 写明下一阶段的动作。'+common);
}

export function phaseObservation(phase,{capture,spaceStatus,scene,feedback,advisory,previousReview,remainingSeconds}){
  const current=Object.fromEntries(Object.entries(spaceStatus.current||{}).map(([id,value])=>[id,{empty:value.empty,items:value.items,parkedIDs:value.parkedIDs,lastSeenTurn:value.lastSeenTurn}]));
  const changed=(spaceStatus.changed||[]).map(({id,items,parkedIDs,empty})=>({id,items,parkedIDs,empty}));
  const base={phase,spaces:spaceStatus.spaces,current,changed,remainingSeconds};
  if(phase==='layout')return {...base,scene,feedback,advisory,previousReview};
  if(phase==='craft')return {...base,scene,feedback,advisory:{observations:advisory.observations,typography:advisory.typography,pages:advisory.pages},previousReview};
  return {...base,scene:{sceneRevision:scene.sceneRevision,layers:scene.layers.filter(layer=>layer.surface==='page')},feedback,advisory:{observations:advisory.observations},previousReview};
}
