import {attachSceneV2} from './scene-v2.js';
import {currentTemplate,listCurrentTemplates,rankCurrentTemplates,compileCurrentTemplate,materialTemplateProfile} from '../creative-agent/library/current-templates.js';

const paperOf=draft=>({width:draft.canvas.width/draft.canvas.height*draft.physicalPageHeightMM,
  height:draft.physicalPageHeightMM});
// Command assets are short aliases, not storage IDs. Cloud material IDs may
// contain slashes or other characters that are illegal in operation schemas.
const commandAlias=/^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const selectedAssets=(assets,basket)=>{
 const selected=basket.map(id=>assets.find(asset=>asset.id===id)).filter(Boolean);
 const reserved=new Set(selected.map(asset=>asset.id).filter(id=>commandAlias.test(id)));
 return selected.map((asset,index)=>{
  if(commandAlias.test(asset.id))return {...asset,alias:asset.id};
  let alias=`material-${index+1}`;
  while(reserved.has(alias))alias+='-source';
  reserved.add(alias);
  return {...asset,alias};
 });
};
const aliasOf=asset=>asset.alias||asset.id;
const requiredAliases=(selected,ids)=>ids.map(id=>selected.find(asset=>asset.id===id)?.alias).filter(Boolean);

function leafChoice(match,side,paper){
 const offset=side==='right'?.5:0;
 const elements=match.template.elements.filter(element=>element.page===side).map(element=>({
  ...element,page:'single',box:[(element.box[0]-offset)*2,element.box[1],element.box[2]*2,element.box[3]]}));
 return {...match,id:`leaf:${match.id}:${side}`,sourceId:match.id,side,mode:'leaf',
  title:`${match.title} · ${side==='left'?'左页':'右页'}`,
  template:{...match.template,pageMode:'single',pageMm:[paper.width,paper.height],
   aspect:paper.width/paper.height,elements},
  description:`取双页模板的${side==='left'?'左页':'右页'}结构`};
}

function pairChoice(left,right,paper){
 const elements=[...left.template.elements.map(element=>({...element,id:`left:${element.id}`,page:'left',
  box:[element.box[0]/2,element.box[1],element.box[2]/2,element.box[3]]})),
  ...right.template.elements.map(element=>({...element,id:`right:${element.id}`,page:'right',
   box:[.5+element.box[0]/2,element.box[1],element.box[2]/2,element.box[3]]}))];
 const used=[...new Set([...left.plan.used,...right.plan.used])];
 const assignments=[...left.assignments.map(a=>({...a,slotId:`left:${a.slotId}`})),
  ...right.assignments.map(a=>({...a,slotId:`right:${a.slotId}`}))];
 const emptySlots=[...left.emptySlots.map(id=>`left:${id}`),...right.emptySlots.map(id=>`right:${id}`)];
 return {id:`pair:${left.id}|${right.id}`,mode:'pair',left,right,
  title:`${left.title} ＋ ${right.title}`,score:(left.score+right.score)/2,
  plan:{used},assignments,emptySlots,
  template:{id:`pair:${left.id}|${right.id}`,type:'new',pageMode:'spread',
   pageMm:[paper.width,paper.height],aspect:paper.width/paper.height,elements,
   structure:'两张单页分别铺到左右页'},description:'左右页各使用一张单页模板'};
}

function rankManualChoices(draft,selected,mustUse){
 const paper=paperOf(draft),mode=draft.pageMode;
 const same=rankCurrentTemplates({materials:selected,paper,pageMode:mode,limit:20,mustUse});
 let cross=[];
 if(mode==='single'){
  for(const {id:template} of listCurrentTemplates().filter(item=>item.pageMode==='spread')){
   for(const side of ['left','right']){
    const [match]=rankCurrentTemplates({materials:selected,pageMode:'spread',templateIds:[template],
      pages:[side],paper:{width:paper.width*2,height:paper.height},limit:1,mustUse});
    if(match)cross.push(leafChoice(match,side,paper));
   }
  }
 }else{
  const singles=listCurrentTemplates().filter(item=>item.pageMode==='single').map(item=>item.id);
  const leafPaper={width:paper.width/2,height:paper.height};
  for(const leftId of singles){
   const [left]=rankCurrentTemplates({materials:selected,pageMode:'single',templateIds:[leftId],
    paper:leafPaper,limit:1,mustUse});
   if(!left)continue;
   const available=selected.filter(asset=>!left.plan.used.includes(aliasOf(asset)));
   for(const rightId of singles){
    const [right]=rankCurrentTemplates({materials:available,pageMode:'single',templateIds:[rightId],
     paper:leafPaper,limit:1,mustUse:mustUse.filter(id=>available.some(asset=>aliasOf(asset)===id))});
    if(right)cross.push(pairChoice(left,right,paper));
   }
  }
 }
 const byScore=(a,b)=>(b.rankingScore??b.score)-(a.rankingScore??a.score)||
  b.plan.used.length-a.plan.used.length||a.id.localeCompare(b.id);
 same.sort(byScore);cross.sort(byScore);
 // Prefer the requested page mode modestly, but expose cross-mode choices.
 return [...same.slice(0,4).map(m=>({...m,rankingScore:m.score+4})),
  ...cross.slice(0,4).map(m=>({...m,rankingScore:m.score-(m.mode==='pair'?12:0)}))]
  .sort(byScore).slice(0,8);
}

export function manualTemplateChoices(draft,assets,basket,{requiredAssetIDs=[]}={}){
 const selected=selectedAssets(assets,basket),paper=paperOf(draft);
 const ranked=rankManualChoices(draft,selected,requiredAliases(selected,requiredAssetIDs));
 return ranked.map(match=>({...match,selected,paper,missing:match.emptySlots,
  description:match.description||match.template.structure,
  reason:`${match.mode==='leaf'?'双页取单页 · ':match.mode==='pair'?'双单页组合 · ':''}匹配 ${Math.max(0,Math.round(match.score))} 分 · 已用 ${match.plan.used.length} 件素材 · 默认对象 ${match.emptySlots.length} 处`}));
}

function withoutTray(operations){return operations.filter(op=>!(op.op==='material.add'&&op.place?.surface==='tray'));}
function parkUnused(selected,used){
 const usedSet=new Set(used);
 return selected.map(materialTemplateProfile).filter(asset=>asset.alias&&asset.usage!=='calibration-only'&&!usedSet.has(asset.alias))
  .map((asset,index)=>({op:'material.add',id:`template-candidate-${index+1}`,asset:asset.alias,
   place:{reference:'page',at:[.5,.5],unit:'ratio',surface:'tray'}}));
}
function compiledFor(match,selected,mustUse,pageMm){
 return compileCurrentTemplate({templateId:match.id,assets:selected,plan:match.plan,mustUse,pageMm,
  bindings:Object.fromEntries(match.assignments.map(({slotId,alias})=>[slotId,alias])),
  slotValues:Object.fromEntries(match.assignments.map(({slotId})=>[slotId,{fit:'none'}]))}).operations;
}
function leafOperations(choice,selected,mustUse,paper){
 const ops=withoutTray(compiledFor({...choice,id:choice.sourceId},selected,mustUse,[paper.width*2,paper.height]));
 const pageRef=`page.${choice.side}`;
 const kept=new Set(ops.filter(op=>op.id&&op.place?.reference===pageRef).map(op=>op.id));
 return [...ops.filter(op=>op.op==='page.update'&&op.page===pageRef||
   op.place?.reference===pageRef||op.target&&kept.has(op.target)&&(!op.reference||kept.has(op.reference)))
  .map(op=>{
   const next=structuredClone(op);
   if(next.op==='page.update')delete next.page;
   if(next.place?.reference===pageRef)next.place.reference='page';
   return next;
  }),...parkUnused(selected,choice.plan.used)];
}
function pairOperations(choice,selected,mustUse,paper){
 const batches=[[],[]];
 for(const [index,[side,match]] of [['left',choice.left],['right',choice.right]].entries()){
  const ops=withoutTray(compiledFor(match,selected,
   mustUse.filter(id=>match.plan.used.includes(id)),[paper.width/2,paper.height]));
  const ids=new Set(ops.map(op=>op.id).filter(Boolean));
  for(const op of ops){
   const next=structuredClone(op);
   if(next.op==='page.update')next.page=`page.${side}`;
   if(next.place?.reference==='page')next.place.reference=`page.${side}`;
   if(next.id)next.id=`${side}-${next.id}`;
   for(const key of ['target','reference','parent','above','below'])
    if(typeof next[key]==='string'&&ids.has(next[key]))next[key]=`${side}-${next[key]}`;
   if(next.order)for(const key of ['before','after'])
    if(typeof next.order[key]==='string'&&ids.has(next.order[key]))next.order[key]=`${side}-${next.order[key]}`;
   batches[index].push(next);
  }
 }
 batches[1].push(...parkUnused(selected,choice.plan.used));
 return batches;
}

export async function applyManualTemplate(draft,assets,basket,templateID,{requiredAssetIDs=[],choice}={}){
 const template=currentTemplate(templateID);
 if(!template&&!templateID?.startsWith('leaf:')&&!templateID?.startsWith('pair:'))
  throw Error('旧模板已下线匹配，请选择新模板');
 const selected=selectedAssets(assets,basket),paper=paperOf(draft);
 const mustUse=requiredAliases(selected,requiredAssetIDs);
 let match=choice?.id===templateID?choice:null;
 if(!match&&template?.pageMode===draft.pageMode)
  [match]=rankCurrentTemplates({materials:selected,paper,pageMode:draft.pageMode,
   templateIds:[templateID],limit:1,mustUse});
 if(!match)match=manualTemplateChoices(draft,assets,basket,{requiredAssetIDs})
  .find(row=>row.id===templateID);
 if(!match)throw Error('模板与当前单页／双页模式不一致');
 draft.layers=[];attachSceneV2(draft);
 const [{createCreationDocument},{applyCreationTransaction,creationSceneRevision}]=await Promise.all([
  import('./creation-document.js'),import('./creation-transaction.js')]);
 const document=await createCreationDocument({draft,assets:selected,
  aliases:Object.fromEntries(selected.map(asset=>[aliasOf(asset),asset.id]))});
 const operations=match.mode==='leaf'?leafOperations(match,selected,mustUse,paper):
  match.mode==='pair'?pairOperations(match,selected,mustUse,paper):
  compiledFor(match,selected,mustUse,[paper.width,paper.height]);
 // The two independent leaves are committed to the temporary document in
 // separate batches; no partial page reaches the saved project on failure.
 let result={document,changed:false};
 for(const [index,batch] of (match.mode==='pair'?operations:[operations]).entries()){
  const applied=applyCreationTransaction(result.document,{protocolVersion:2,
   transactionId:`manual-${draft.id}-${index}`,baseSceneRevision:creationSceneRevision(result.document),
   operations:batch},selected);
  result={...applied,changed:result.changed||applied.changed};
 }
 if(!result.changed)throw Error('模板未能生成可编辑画面');
 const finishedPage=result.document.page;
 draft.layers=finishedPage.layers;
 draft.paperColor=finishedPage.paperColor;
 if(finishedPage.paperColors)draft.paperColors=structuredClone(finishedPage.paperColors);
 else delete draft.paperColors;
 attachSceneV2(draft);
 draft.startTemplateID=templateID;
 return {placed:match.plan.used.length,remaining:selected.length-match.plan.used.length,
  missing:match.emptySlots.length,template:match.title};
}
