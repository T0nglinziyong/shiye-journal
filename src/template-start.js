import {itemFromAsset} from './domain.js';
import {attachSceneV2} from './scene-v2.js';
import {materialSlots,rankTemplates,scoreTemplate,templateCatalog,templateEnabled} from './creation-library/matcher.js';

const simpleTemplates=templateCatalog.templates.filter(template=>templateEnabled(template)&&template.elements.length<=34);
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

export function applyManualTemplate(draft,assets,basket,templateID){
  attachSceneV2(draft);
  const template=simpleTemplates.find(item=>item.id===templateID);
  if(!template)throw Error('模板已不可用，请重新选择');
  const selected=basket.map(id=>assets.find(asset=>asset.id===id)).filter(Boolean);
  const choice=scoreTemplate(template,selected,paperOf(draft));
  const byID=new Map(assets.map(asset=>[asset.id,asset]));
  draft.items=choice.assignments.flatMap(({alias,box},index)=>{
    const asset=byID.get(alias);if(!asset)return [];
    const x=(box[0]+box[2]/2)*draft.canvas.width,y=(box[1]+box[3]/2)*draft.canvas.height;
    const item=itemFromAsset(asset,draft,x,y,10+index,true);
    item.generationBaseline={...item.generationBaseline,x:item.x,y:item.y};
    return [item];
  });
  draft.startTemplateID=templateID;
  return {placed:draft.items.length,remaining:basket.length-draft.items.length,
    missing:choice.emptySlots.length,template:choice.title};
}
