import {listTemplateDrafts,compileTemplateDraft} from './template-draft.js';
import {describeTemplateObjects,matchMaterialsToTemplates} from './adaptive-template-matcher.js';
import {describeSixSpreadTemplate,matchSixSpreadMaterials} from './six-spread-templates.js';
import {describeThreeLayoutSpread,matchThreeLayoutSpread} from './three-layout-template-matcher.js';

const names={D143:'Q1·Q2·Q3',D146:'数字与问答',D153:'青灰纸页',D158:'灰蓝人物拼贴',D162:'上下撕纸与日期',
 'S01-苹果绿白':'苹果绿与白','S02-青黄面包':'青黄面包','S03-棕蓝爱心':'棕蓝爱心',
 'S04-粉黑百合':'粉黑百合','S05-灰黄甜点':'灰黄甜点','S06-白粉果实':'白粉果实',
 'XHS-满满当当':'满满当当','XHS-排版第四弹':'排版第四弹','XHS-海岛排版':'海岛排版'};
const single=new Set(['D143','D146','D153','D158','D162']);
const six=new Set(['S01-苹果绿白','S02-青黄面包','S03-棕蓝爱心','S04-粉黑百合','S05-灰黄甜点','S06-白粉果实']);
const roleNames={photo:'照片',figure:'不规则主体',accent:'装饰点缀',tape:'胶带',strip:'纸条或胶带',
 'plain-paper':'纯色纸张','pattern-paper':'花纹纸张','writing-card':'可书写卡片','printed-card':'印刷卡片',
 'date-card':'日期卡片','support-card':'底层卡纸','sticker':'贴纸',clip:'夹子'};
const label=role=>roleNames[role]||role.replaceAll('-',' ');
const round=n=>Math.round(n*10)/10;
const objectCondition=(item,templateId)=>{
 const accepts=item.accepts||item.acceptedMaterialRoles||[];
 const size=item.target?.sizeMm||item.targetMm||null;
 const fixed=accepts.length>0;
 const must=[fixed?`替换素材须属于：${accepts.map(label).join('、')}`:'此位置可由模板生成；若替换，应保留同样的视觉作用',
   size?`实物尺寸接近 ${round(size[0])} × ${round(size[1])} mm，摆放时不放大或缩小用户素材`:'保持该位置的版面比例'];
 if(item.cropPolicy==='never')must.push('主体与轮廓完整保留');
 if(item.cropPolicy==='repeatable-only')must.push('仅连续纹样可安全裁切');
 if(/(?:writing|note|body|text)/.test(item.role||''))must.push('文字区域须有足够留白与对比度');
 const prefer=[item.purpose||(item.style?.subject?`内容贴近 ${item.style.subject}`:
  /(?:photo|figure|sticker)/.test(item.role||'')?'与本页叙事主题呼应':'颜色与相邻纸张形成清楚层次')];
 if(item.parent&&item.parent!=='page')prefer.push(`与 ${item.parent} 保持叠放关系`);
 if(item.above?.length||item.below?.length||item.frontOf?.length||item.behind?.length)
  prefer.push('保留原案例中的前后遮挡关系');
 return {must,prefer:prefer.filter(Boolean),accepts,sizeMm:size};
};
const singleElements=id=>{
 const data=describeTemplateObjects(id),[pw,ph]=data.pageMm;
 return {pageMm:data.pageMm,elements:data.objects.filter(o=>o.id!=='page'&&o.target?.sizeMm&&o.target?.centerMm&&
   !(o.role==='generated-graphic'&&Math.min(...o.target.sizeMm)<1)).map(o=>{
    const [w,h]=o.target.sizeMm,[cx,cy]=o.target.centerMm;
    return {id:o.id,role:o.role,page:'single',box:[(cx-w/2)/pw,(cy-h/2)/ph,w/pw,h/ph],
      ...objectCondition(o,id)};
   })};
};
const spreadElements=id=>{
 const data=six.has(id)?describeSixSpreadTemplate(id):describeThreeLayoutSpread(id);
 const elements=data.slots.map(s=>{
  const [x0,y0,x1,y1]=s.box;
  return {id:s.id,role:s.role,page:s.page,box:[(s.page==='right'?.5:0)+x0/200,y0/100,
    (x1-x0)/200,(y1-y0)/100],...objectCondition(s,id)};
 });
 return {pageMm:[data.leafMm[0]*2,data.leafMm[1]],elements};
};
const entries=listTemplateDrafts().map(id=>{
 const isSingle=single.has(id),{pageMm,elements}=isSingle?singleElements(id):spreadElements(id);
 return {id,title:names[id]||id,type:'new',pageMode:isSingle?'single':'spread',pageMm,
  structure:isSingle?'按真实案例量测的单页对象位置、尺寸和层级。':
    six.has(id)?describeSixSpreadTemplate(id).logic:describeThreeLayoutSpread(id).logic,
  elements,aspect:pageMm[0]/pageMm[1],styles:['彩色拼贴'],purposes:['日常记录'],tags:[isSingle?'单页':'双页','可编辑','实物尺寸']};
});
const byId=new Map(entries.map(e=>[e.id,e]));
export function listCurrentTemplates(){return entries;}
export function currentTemplate(id){return byId.get(id)||null;}

export function materialTemplateProfile(asset){
 const kind=asset.kind||'other',fits=asset.layoutFits||[],text=String(asset.templateUseNotes||'');
 const tags=[asset.title,asset.description,...(asset.tags||[]),...(asset.contentTags||[]),...(asset.contentCategories||[]),
  ...(asset.themeTags||[])].filter(Boolean).join(' ');
 const colors={'黑':'#26272A','白':'#F7F6F2','灰':'#8B9295','蓝':'#6A95B5',
  '绿':'#78A47A','黄':'#E5C54C','红':'#BE604F','粉':'#E8A9BC','棕':'#8A6650'};
 const colorText=(asset.colorTags||[]).join(' ');
 const colorName=Object.keys(colors).find(name=>colorText.includes(name));
 const patterned=asset.kindDetail==='paper.patterned'||asset.kindDetail==='paper.grid'||
  asset.kindDetail==='paper.lined'||asset.kindDetail==='paper.dot'||
  (asset.materialTags||[]).some(tag=>/纹样|花纹|图案/.test(tag));
 const roles=Array.isArray(asset.visualRoles)&&asset.visualRoles.length?asset.visualRoles:
  kind==='paper'?['plain-paper',...(patterned?['pattern-paper']:[])]:
  kind==='note'?['writing-card','plain-paper']:
  kind==='card'?['printed-card',...(fits.includes('frame.text')||fits.includes('local.text')?['writing-card']:[])]:
  kind==='photo'?['photo']:kind==='tape'?['tape','strip']:
  kind==='sticker'?[
    ...(asset.kindDetail==='sticker.subject'||!asset.kindDetail&&asset.role==='focal'?['figure']:[]),
    'accent','sticker']:
  kind==='text'?['printed-card','accent']:['accent'];
 const preservation=asset.preservation||(/不可裁切|不宜裁切|不要裁切|不裁切|保持完整/.test(text)?'whole':
   /可重复|连续纹样|可裁切/.test(text)||fits.includes('repeat.tile')?'repeatable':
   /可拆分|可分段/.test(text)||fits.includes('combine.split')?'splittable':'whole');
 const writableAreaRatio=Number.isFinite(asset.writableAreaRatio)?asset.writableAreaRatio:
  /不可书写|无留白/.test(text)?0:/大面积留白|可书写/.test(text)?.8:
  /局部留白/.test(text)?.45:kind==='paper'?(patterned?.15:.8):kind==='note'?.75:
  fits.includes('frame.text')||fits.includes('local.text')?.65:0;
 const mainColor=asset.mainColor||asset.colorTags?.find(tag=>/^#[0-9a-f]{6}$/i.test(tag))||
  (colorName?colors[colorName]:null);
 const subjectTags=asset.subjectTags||[
  /food|食物|咖啡|面包|甜点|蛋糕|饮品/.test(tags)&&'food-drink',
  /places|建筑|街道|城市/.test(tags)&&'architecture',
  /plants|花朵|植物|花卉/.test(tags)&&'flowers',
  /nature|户外|风景|自行车/.test(tags)&&'outdoors',
  /objects|文具|纸品|胶片/.test(tags)&&'stationery'].filter(Boolean);
 return {...asset,alias:asset.alias||asset.id,visualRoles:roles,preservation,
  writableAreaRatio,canWriteOn:asset.canWriteOn??writableAreaRatio>=.6,
  shape:asset.shape||(/矩形|方形/.test(text)?'rect':
   kind==='sticker'&&asset.kindDetail==='sticker.subject'?'die-cut':'rect'),mainColor,subjectTags};
}

export function rankCurrentTemplates({materials=[],pageMode,paper,limit=6}={}){
 const profiles=materials.map(materialTemplateProfile).filter(a=>a.alias&&a.physicalWidthMM>0&&a.physicalHeightMM>0);
 const candidates=entries.filter(t=>!pageMode||t.pageMode===pageMode);
 return candidates.map(template=>{
  let plan;
  if(single.has(template.id))plan=matchMaterialsToTemplates(profiles,{templateIds:[template.id]})[0];
  else if(six.has(template.id))plan=matchSixSpreadMaterials(template.id,profiles);
  else plan=matchThreeLayoutSpread(template.id,profiles);
  const used=plan.used||[],assignments=plan.assignments.filter(a=>a.asset).map(a=>({alias:a.asset,slotId:a.slot}));
  const criticalMissing=(plan.missingCritical||plan.missingPhotos||[]).length;
  const fit=single.has(template.id)?plan.score:six.has(template.id)?plan.score:
    assignments.length/Math.max(1,plan.assignments.length);
  const score=round(100*(fit*.55+Math.min(used.length,5)/5*.45)-criticalMissing*15);
  return {id:template.id,title:template.title,template,plan,score,assignments,
    emptySlots:plan.assignments.filter(a=>!a.asset).map(a=>a.slot),unused:profiles.map(a=>a.alias).filter(id=>!used.includes(id))};
 }).sort((a,b)=>b.score-a.score||b.assignments.length-a.assignments.length||a.id.localeCompare(b.id)).slice(0,limit);
}

export function compileCurrentTemplate({templateId,assets=[],bindings={},texts={},palette={},slotValues={}}={}){
 if(!byId.has(templateId))throw new RangeError(`不是已上线的新模板：${templateId}`);
 return compileTemplateDraft({templateId,assets:assets.map(materialTemplateProfile),bindings,texts,palette,slotValues});
}

export function currentTemplateMaterialScores(candidates=[]){
 return new Map(candidates.map(asset=>{
  const profile=materialTemplateProfile(asset),w=Number(profile.physicalWidthMM),h=Number(profile.physicalHeightMM);
  let best=null;
  if(w>0&&h>0)for(const template of entries)for(const slot of template.elements){
   if(!slot.accepts?.some(role=>profile.visualRoles.includes(role))||!slot.sizeMm)continue;
   const [sw,sh]=slot.sizeMm,wr=w/sw,hr=h/sh;
   if(wr<.38||hr<.38||wr>1.8||hr>1.8)continue;
   const utility=12*Math.exp(-.8*(Math.abs(Math.log(wr))+Math.abs(Math.log(hr))));
   if(!best||utility>best.utility)best={templateId:template.id,title:template.title,
     slotId:slot.id,utility,reason:slot.prefer?.[0]||''};
  }
  return [asset.alias||asset.id,best||{utility:0}];
 }));
}
