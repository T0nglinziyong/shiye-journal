export const creativePhases=['composition','detailing','review'];

const common=['creation_phase','creation_plan','creation_help','creation_inspect','creation_preview','creation_review','creation_finish','workspace_view','inspect_materials'];
const editing=['creation_apply','creation_undo','read_skill','creation_guide'];
const phaseTools={
  composition:[...common,...editing,'match_templates','search_references','search_writing_topics','read_template','read_case','creation_recipe','explore_drafts','select_draft','workspace_create','workspace_close'],
  detailing:['creation_phase','creation_help','creation_inspect','creation_preview','creation_review','creation_finish','workspace_view','inspect_materials',...editing,'search_writing_topics','creation_recipe','segment_material','creation_apply_crops','workspace_create','workspace_close'],
  review:[...common]
};

export function toolsForCreativePhase(tools,phase='composition'){
  const allowed=new Set(phaseTools[phase]||phaseTools.composition);
  return tools.filter(tool=>allowed.has(tool.function.name));
}

export function phaseObservation(phase,{capture,spaceStatus,scene,feedback,advisory,previousReview,remainingSeconds}){
  const current=Object.fromEntries(Object.entries(spaceStatus.current||{}).map(([id,value])=>[id,{empty:value.empty,items:value.items,parkedIDs:value.parkedIDs,lastSeenTurn:value.lastSeenTurn}]));
  const changed=(spaceStatus.changed||[]).map(({id,items,parkedIDs,empty})=>({id,items,parkedIDs,empty}));
  const base={phase,spaces:spaceStatus.spaces,current,changed,remainingSeconds};
  if(phase==='composition')return {...base,scene,feedback,advisory,previousReview};
  if(phase==='detailing')return {...base,scene,feedback,advisory:{observations:advisory.observations,typography:advisory.typography,pages:advisory.pages},previousReview};
  return {...base,scene:{sceneRevision:scene.sceneRevision,layers:scene.layers.filter(layer=>layer.surface==='page')},feedback,advisory:{observations:advisory.observations},previousReview};
}
