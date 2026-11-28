// Match a material basket to measured case structures by visual role. A case
// supplies positions and layer relationships, never its original materials.
export const caseStructures = [
  {id:'D143',name:'蓝色分段问答',slots:['backing','vertical-card','figure','label','number','accent'],weight:{number:2,'vertical-card':1.4}},
  {id:'D146',name:'黑白数字拼贴',slots:['backing','vertical-card','label','number','accent'],weight:{number:2.4,'vertical-card':1.2}},
  {id:'D153',name:'蓝色斜线拼贴',slots:['backing','vertical-card','figure','label','accent'],weight:{'vertical-card':1.6,figure:1.3}},
  {id:'D158',name:'上下错开日记',slots:['backing','horizontal-card','figure','label','number','accent'],weight:{'horizontal-card':1.3,figure:1.1}},
  {id:'D162',name:'上下撕纸问答',slots:['backing','horizontal-card','label','number','accent'],weight:{'horizontal-card':1.3,number:1.2}}
];

const normalize=a=>`${a.originalFilename||a.title||''} ${(a.tags||[]).join(' ')}`.toLowerCase();
export function materialRoleScores(a){
 const t=normalize(a),w=Number(a.physicalWidthMM||a.widthMM),h=Number(a.physicalHeightMM||a.heightMM),r=w/h;
 const has=(...terms)=>terms.some(x=>t.includes(x));
 return {
  backing:a.kind==='paper'&&w>55&&h>90?(has('pattern','纹','星')?1:.55):0,
  'vertical-card':a.kind==='paper'&&h>w*1.15?(has('journey','writing')?1:has('card','卡')?.82:.65):0,
  'horizontal-card':a.kind==='paper'&&r>1.1&&w>55?(has('blue','蓝')?1:has('card','卡','text')?.88:.65):0,
  figure:a.kind==='sticker'&&h>w*1.2?(has('person','girl','人物','animal')?1:.45):0,
  label:a.kind==='sticker'&&w<55?(has('text','typograph','字','rabbit')?.95:.6):0,
  number:has('number','numeral','数字')?1:/^\s*\d{1,3}\s*\./.test(t)?.85:0,
  accent:(w<50&&h<25)?(has('strip','tape','胶带','条')?1:.55):0
 };
}

export function matchCaseStructures(assets,{cases=caseStructures}={}){
 if(!Array.isArray(assets))throw new TypeError('assets must be an array');
 return cases.map(c=>{
  const used=new Set(),bindings={};let earned=0,total=0;
  for(const role of c.slots){
   const weight=c.weight?.[role]||1;total+=weight;
   const candidates=assets.map((asset,index)=>({asset,index,score:materialRoleScores(asset)[role]}))
    .filter(x=>!used.has(x.index)).sort((a,b)=>b.score-a.score);
   if(candidates[0]?.score>0){const best=candidates[0];used.add(best.index);bindings[role]=best.asset.alias||best.asset.id;earned+=best.score*weight;}
   else if(['number','accent','label'].includes(role)){bindings[role]={generated:role};earned+=.7*weight;}
  }
  return {id:c.id,name:c.name,score:Math.round(100*earned/total),bindings,
   unused:assets.filter((_,i)=>!used.has(i)).map(a=>a.alias||a.id)};
 }).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
}

export function resolveSlot(slot,bindings,assets){
 const alias=bindings[slot],asset=assets.find(a=>(a.alias||a.id)===alias);
 return asset?{type:'material',alias,asset}:{type:'generated',kind:slot};
}

// Physical materials cannot be silently stretched. Crop only an unprinted
// backing; a card, numeral or figure remains complete and asks for reflow.
export function planSlotProcessing(asset,{widthMm,heightMm},role){
 const w=Number(asset.physicalWidthMM||asset.widthMM),h=Number(asset.physicalHeightMM||asset.heightMM);
 if(!(w>0&&h>0&&widthMm>0&&heightMm>0))throw new RangeError('invalid physical dimensions');
 const fits=w<=widthMm&&h<=heightMm;
 const unprinted=role==='backing'&&!/card|text|letter|number|数字|字|人物|person|girl|photo/i.test(normalize(asset));
 if(fits)return {method:'complete',visibleWidthMm:w,visibleHeightMm:h};
 if(!unprinted)return {method:'reflow',reason:'preserve printed content and subject outline',visibleWidthMm:w,visibleHeightMm:h};
 const cw=Math.min(w,widthMm),ch=Math.min(h,heightMm);
 return {method:'crop',region:{shape:'rect',space:'source',unit:'mm',box:[(w-cw)/2,(h-ch)/2,cw,ch]},visibleWidthMm:cw,visibleHeightMm:ch};
}
