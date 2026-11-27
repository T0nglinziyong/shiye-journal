import {attachSceneV2} from './scene-v2.js';
import {currentTemplate,rankCurrentTemplates,compileCurrentTemplate} from '../creative-agent/library/current-templates.js';

const paperOf=draft=>({width:draft.canvas.width/draft.canvas.height*draft.physicalPageHeightMM,
  height:draft.physicalPageHeightMM});

export function manualTemplateChoices(draft,assets,basket){
  const selected=basket.map(id=>assets.find(asset=>asset.id===id)).filter(Boolean);
  const ranked=rankCurrentTemplates({materials:selected,paper:paperOf(draft),pageMode:draft.pageMode,limit:6});
  return ranked.map(match=>({...match,selected,paper:paperOf(draft),missing:match.emptySlots,
    description:match.template.structure,
    reason:`匹配 ${Math.max(0,Math.round(match.score))} 分 · 已放 ${match.assignments.length} 件 · 默认对象 ${match.emptySlots.length} 处`}));
}

export async function applyManualTemplate(draft,assets,basket,templateID){
  const template=currentTemplate(templateID);
  if(!template)throw Error('旧模板已下线匹配，请选择新模板');
  if(template.pageMode!==draft.pageMode)throw Error('模板与当前单页／双页模式不一致');
  const selected=basket.map(id=>assets.find(asset=>asset.id===id)).filter(Boolean);
  // The measured template defines the finished sheet. Materials retain their
  // physical millimetre size; only the editable page adopts this format.
  draft.physicalPageHeightMM=template.pageMm[1];
  draft.canvas.width=draft.canvas.height*template.aspect;
  draft.pageRatio=`custom:${Math.round(template.pageMm[0]/(draft.pageMode==='spread'?2:1))}x${Math.round(template.pageMm[1])}`;
  draft.layers=[];attachSceneV2(draft);
  const match=rankCurrentTemplates({materials:selected,pageMode:draft.pageMode,limit:14})
    .find(row=>row.id===templateID);
  const [{createCreationDocument},{applyCreationTransaction,creationSceneRevision}]=await Promise.all([
    import('./creation-document.js'),import('./creation-transaction.js')]);
  const document=await createCreationDocument({draft,assets:selected,
    aliases:Object.fromEntries(selected.map(asset=>[asset.id,asset.id]))});
  const compiled=compileCurrentTemplate({templateId:templateID,assets:selected,
    bindings:Object.fromEntries(match.assignments.map(({slotId,alias})=>[slotId,alias])),
    slotValues:Object.fromEntries(match.assignments.map(({slotId})=>[slotId,{fit:'none'}]))});
  const result=applyCreationTransaction(document,{protocolVersion:2,
    transactionId:`manual-${draft.id}`,baseSceneRevision:creationSceneRevision(document),
    operations:compiled.operations},selected);
  if(!result.changed)throw Error('模板未能生成可编辑画面');
  draft.layers=result.document.page.layers;attachSceneV2(draft);
  draft.startTemplateID=templateID;
  return {placed:match.assignments.length,remaining:selected.length-match.assignments.length,
    missing:match.emptySlots.length,template:template.title};
}
