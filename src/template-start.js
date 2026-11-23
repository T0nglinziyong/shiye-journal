import {attachSceneV2} from './scene-v2.js';
import {materialSlots,rankTemplates,scoreTemplate,templateCatalog,templateManualEnabled} from '../creative-agent/library/matcher.js';

const simpleTemplates=templateCatalog.templates.filter(templateManualEnabled);
const paperOf=draft=>({width:draft.canvas.width/draft.canvas.height*draft.physicalPageHeightMM,
  height:draft.physicalPageHeightMM});

export function manualTemplateChoices(draft,assets,basket,{styles=[],purposes=[]}={}){
  const selected=basket.map(id=>assets.find(asset=>asset.id===id)).filter(Boolean);
  const paper=paperOf(draft);
  const ranked=rankTemplates({materials:selected,paper,styles,content:purposes,
    templates:simpleTemplates,limit:12}).filter(match=>match.assignments.length).slice(0,6);
  return ranked.map(match=>{
    const template=simpleTemplates.find(item=>item.id===match.id);
    const missing=materialSlots(template).filter(slot=>match.emptySlots.includes(slot.id));
    return {...match,template,selected,paper,missing,
      description:template.reconstruction?.sourceObservation||template.title,
      reason:`匹配 ${Math.round(match.score)} 分 · 已放 ${match.assignments.length} 件 · 空位 ${missing.length} 处`};
  });
}

export async function applyManualTemplate(draft,assets,basket,templateID){
  attachSceneV2(draft);
  const template=simpleTemplates.find(item=>item.id===templateID);
  if(!template)throw Error('模板已不可用，请重新选择');
  draft.layers=[];
  attachSceneV2(draft);
  const selected=basket.map(id=>assets.find(asset=>asset.id===id)).filter(Boolean);
  const paper=paperOf(draft),choice=scoreTemplate(template,selected,paper);
  const [{compileTemplate},{createCreationDocument},{applyCreationTransaction,creationSceneRevision}]=await Promise.all([
    import('../creative-agent/library/compiler.js'),import('./creation-document.js'),import('./creation-transaction.js')]);
  const document=await createCreationDocument({draft,assets:selected,
    aliases:Object.fromEntries(selected.map(asset=>[asset.id,asset.id]))});
  const compiled=compileTemplate({templateId:templateID,id:`manual-${draft.id}`,paper,
    materials:selected,bindings:choice.assignments.map(({alias,slotId})=>({alias,slotId}))});
  const result=applyCreationTransaction(document,{protocolVersion:2,
    transactionId:`manual-${draft.id}`,baseSceneRevision:creationSceneRevision(document),
    operations:compiled.operations},selected);
  if(!result.changed)throw Error('模板未能生成可编辑画面');
  draft.layers=result.document.page.layers;
  attachSceneV2(draft);
  draft.startTemplateID=templateID;
  return {placed:choice.assignments.length,remaining:basket.length-choice.assignments.length,
    missing:choice.emptySlots.length,template:choice.title};
}
