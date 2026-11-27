import {resolveMeasuredCaseGraph,measuredOperations} from './measured-case-templates.js';
import {resolveD146Graph,D146_PAGE_MM,D146_REFERENCE_PX} from './d146-template-graph.js';
import {compileTemplateDraft} from './template-draft.js';

const TEMPLATES=['D143','D146','D153','D158','D162'];
const MATERIAL_SLOTS={
 D143:['dark-stripe','orange-clip','girl-head','yellow-label','blue-loop','orange-loop','telephone-girl'],
 D146:['dark-top','dark-bottom','yellow-top','main-paper','gray-dot-paper','bottom-writing','yellow-number-bar','stamp-material','top-clip'],
 D153:['gray-paper','title-tape','plant-memo','orange-clip','banner-girl','yellow-dot-strip'],
 D158:['walking-dog','dog-plants-card','gingham-tape','rabbit-charm','paperclip','manga-girl'],
 D162:['bear-monday','red-arrow-round','heart-memo','tea-card','clip']
};
const ROLE_POLICY={
 'backing-paper':{accepts:['pattern-paper','plain-paper'],crop:'repeatable-only',overhangMm:7,weight:1.4},
 'writing-card':{accepts:['writing-card','plain-paper','printed-card'],crop:'repeatable-only',overhangMm:7,weight:1.2},
 'date-card':{accepts:['writing-card','plain-paper','printed-card'],crop:'repeatable-only',overhangMm:6,weight:1.1},
 'scene-card':{accepts:['photo','printed-card','writing-card'],crop:'never',overhangMm:6,weight:1.2},
 figure:{accepts:['figure'],crop:'never',overhangMm:10,weight:1.4},
 connector:{accepts:['tape','strip'],crop:'split-only',overhangMm:8,weight:1},
 'edge-accent':{accepts:['accent','tape','strip'],crop:'split-only',overhangMm:6,weight:.75},
 label:{accepts:['printed-card','writing-card','accent'],crop:'never',overhangMm:5,weight:.8},
 'contrast-paper':{accepts:['plain-paper','pattern-paper'],crop:'repeatable-only',overhangMm:7,weight:.8},
 'writing-field':{accepts:['plain-paper','writing-card'],crop:'repeatable-only',overhangMm:6,weight:1},
 'side-pattern-paper':{accepts:['pattern-paper','plain-paper'],crop:'repeatable-only',overhangMm:6,weight:.8},
 'lower-writing-field':{accepts:['plain-paper','writing-card'],crop:'repeatable-only',overhangMm:6,weight:.8},
 'numeral-backing':{accepts:['plain-paper','pattern-paper'],crop:'repeatable-only',overhangMm:4,weight:.5},
 'accent-card-content':{accepts:['printed-card','accent','writing-card'],crop:'never',overhangMm:3,weight:.6},
 'edge-connector':{accepts:['tape','strip','accent'],crop:'never',overhangMm:3,weight:.5}
};
const LAYER_RELATIONS={
 D143:[['dark-stripe','page'],['telephone-girl','dark-stripe']],
 D146:[['main-paper','dark-top'],['gray-dot-paper','main-paper'],['top-clip','yellow-top']],
 D153:[['gray-paper','white-ruled'],['plant-memo','gray-paper'],['banner-girl','plant-memo'],['title-tape','title-strip'],['orange-clip','title-strip']],
 D158:[['manga-girl','top-blue'],['dog-plants-card','bottom-gray']],
 D162:[['blue-upper','ruled-top'],['blue-lower','ruled-bottom'],['ruled-middle','blue-lower'],['heart-memo','gingham-middle']]
};
const DARK_BACKINGS=new Set(['D143/dark-stripe','D146/dark-top','D146/dark-bottom','D153/gray-paper']);
const SLOT_ACCEPTS={'D162/clip':['clip']};
const DIE_CUT_SLOTS=new Set(['D143/girl-head','D143/telephone-girl','D153/banner-girl','D158/manga-girl','D162/bear-monday']);
const SLOT_PURPOSE={
 D143:{'dark-stripe':'中下部文字与素材的深色承载面','orange-clip':'上部压住纸边的小连接件','girl-head':'上方局部人物或异形装饰','yellow-label':'侧边短句或数字标签','blue-loop':'下部横向连接带','orange-loop':'底部第二条色彩连接带','telephone-girl':'下部不规则视觉主体'},
 D146:{'dark-top':'顶部深色底纸','dark-bottom':'底部深色底纸','yellow-top':'上方亮色纸角','main-paper':'纵贯版面的书写主体','gray-dot-paper':'左下局部纹样与主纸形成穿插','bottom-writing':'下方问答的书写纸','yellow-number-bar':'大数字后方的封闭色块','stamp-material':'右下印花卡或内容贴纸','top-clip':'上方压住纸角的夹子'},
 D153:{'gray-paper':'纵向大卡纸，承载日期与分段','title-tape':'上下呼应的同源胶带','plant-memo':'左侧局部书写卡','orange-clip':'卡片边缘小连接件','banner-girl':'跨越卡片与空隙的不规则主体','yellow-dot-strip':'右侧竖向平衡点缀'},
 D158:{'walking-dog':'上部横向叙事画面','dog-plants-card':'下部照片或印花卡','gingham-tape':'下方侧边连接带','rabbit-charm':'上方小异形点缀','paperclip':'顶端夹子或窄连接件','manga-girl':'右侧跨区域的不规则主体'},
 D162:{'bear-monday':'顶部压住纸边的不规则主体','red-arrow-round':'左上方向提示点缀','heart-memo':'上下两组纸张之间的日期连接件','tea-card':'下方视觉卡片','clip':'连接下方卡片和纸张的夹子'}
};

const id=a=>a.alias||a.id;
const mm=a=>[Number(a.physicalWidthMM),Number(a.physicalHeightMM)];
const round=n=>Math.round(n*100)/100;
const hue=color=>{
 if(!/^#[0-9a-f]{6}$/i.test(color||''))return null;
 const [r,g,b]=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255),max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
 if(d<.08)return null;
 const h=max===r?(g-b)/d+(g<b?6:0):max===g?(b-r)/d+2:(r-g)/d+4;
 return h*60;
};
const lightness=color=>{
 if(!/^#[0-9a-f]{6}$/i.test(color||''))return .5;
 const rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);
 return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
};
const harmony=(a,b)=>{
 const h1=hue(a.mainColor),h2=hue(b.mainColor);if(h1===null||h2===null)return 0;
 const delta=Math.abs(h1-h2),distance=Math.min(delta,360-delta);
 return distance<=35||distance>=145?.018:distance>=65&&distance<=115?-.012:0;
};
const b146=(box)=>({center:[(box[0]+box[2])/2*D146_PAGE_MM[0]/D146_REFERENCE_PX[0],(box[1]+box[3])/2*D146_PAGE_MM[1]/D146_REFERENCE_PX[1]],width:(box[2]-box[0])*D146_PAGE_MM[0]/D146_REFERENCE_PX[0],height:(box[3]-box[1])*D146_PAGE_MM[1]/D146_REFERENCE_PX[1]});

export function describeTemplateObjects(templateId){
 if(!TEMPLATES.includes(templateId))throw new RangeError(`未知模板：${templateId}`);
 const graph=templateId==='D146'?resolveD146Graph():resolveMeasuredCaseGraph(templateId);
 const materialIDs=new Set(MATERIAL_SLOTS[templateId]);
 const relations=LAYER_RELATIONS[templateId];
 const objects=Object.entries(graph.slots).map(([nodeId,node])=>{
  const box=templateId==='D146'?b146(graph.boxes[nodeId]):graph.boxes[nodeId];
  const policy=materialIDs.has(nodeId)?ROLE_POLICY[node.role]||{accepts:[],crop:'never',overhangMm:0,weight:1}:null;
  return {id:nodeId,parent:node.parent,role:node.role,purpose:SLOT_PURPOSE[templateId]?.[nodeId]||null,target:{centerMm:box?.center?.map(round),sizeMm:box?[round(box.width),round(box.height)]:null},
   accepts:SLOT_ACCEPTS[`${templateId}/${nodeId}`]||policy?.accepts||[],cropPolicy:policy?.crop||'not-applicable',overhangMm:policy?.overhangMm||0,
   weight:policy?.weight||0,defaultValue:node.defaultValue??null,
   frontOf:relations.filter(([front])=>front===nodeId).map(([,back])=>back),
   behind:relations.filter(([,back])=>back===nodeId).map(([front])=>front)};
 });
 return {id:templateId,pageMm:graph.pageMm,objects,materialSlots:MATERIAL_SLOTS[templateId],layerRelations:relations};
}

export function validateMaterialProfile(profile){
 const [w,h]=mm(profile);
 if(!id(profile)||!(w>0&&h>0))throw new TypeError('素材需要 ID 和真实毫米尺寸');
 if(!Array.isArray(profile.visualRoles)||!profile.visualRoles.length)throw new TypeError(`${id(profile)} 缺少视觉角色`);
 if(!['whole','repeatable','splittable'].includes(profile.preservation))throw new TypeError(`${id(profile)} 缺少完整性策略`);
 if(profile.visualBoundsRatio&&(!Array.isArray(profile.visualBoundsRatio)||profile.visualBoundsRatio.length!==4||profile.visualBoundsRatio.some(x=>!Number.isFinite(x)||x<0||x>1)||profile.visualBoundsRatio[2]<=profile.visualBoundsRatio[0]||profile.visualBoundsRatio[3]<=profile.visualBoundsRatio[1]))throw new TypeError(`${id(profile)} 可见边界无效`);
 return profile;
}

function placement(asset,slot,pageMm,{templateId}={}){
 const [w,h]=mm(asset),[sw,sh]=slot.target.sizeMm,[baseX,ty]=slot.target.centerMm,allow=asset.preservation==='whole'?0:slot.overhangMm;
 // Whole materials remain inside the sheet; a reference silhouette is not a
 // license to cut off the replacement subject's contour.
 const tx=baseX;
 if(w>pageMm[0]+allow*2||h>pageMm[1]+allow*2)return null;
 const minX=w/2-allow,maxX=pageMm[0]-w/2+allow,minY=h/2-allow,maxY=pageMm[1]-h/2+allow;
 const bounds=asset.visualBoundsRatio||[0,0,1,1];
 const visualOffsetX=((bounds[0]+bounds[2])/2-.5)*w,visualOffsetY=((bounds[1]+bounds[3])/2-.5)*h;
 const x=Math.max(minX,Math.min(maxX,tx-visualOffsetX)),y=Math.max(minY,Math.min(maxY,ty-visualOffsetY));
 const shift=Math.hypot(x+visualOffsetX-baseX,y+visualOffsetY-ty);
 if(shift>12)return null;
 const wr=w*(bounds[2]-bounds[0])/sw,hr=h*(bounds[3]-bounds[1])/sh;
 // A die-cut subject may extend beyond its preferred box; the whole physical
 // piece still has to remain within the page and must never be scaled.
 const upper=asset.preservation==='whole'&&asset.visualRoles.includes('figure')?1.85:slot.role==='writing-card'||slot.role==='date-card'?1.4:slot.role==='connector'||slot.role==='edge-accent'?2.15:1.75;
 if((wr>upper||hr>upper)&&!(asset.preservation==='repeatable'&&slot.cropPolicy==='repeatable-only'))return null;
 if(wr<.38||hr<.38)return null;
 const cropped=asset.preservation==='repeatable'&&slot.cropPolicy==='repeatable-only'&&(w>sw||h>sh);
 const sizeScore=Math.exp(-.55*(Math.abs(Math.log(wr))+Math.abs(Math.log(hr))));
 return {centerMm:[round(x),round(y)],shiftMm:[round(x-baseX),round(y-ty)],physicalSizeMm:[w,h],method:cropped?'crop':'complete',sizeScore,shift};
}

function textZones(templateId){
 const operations=templateId==='D146'?[]:measuredOperations(templateId);
 return operations.filter(op=>op.op==='text.add'&&op.place?.at&&op.size?.width&&(/body|notes|plant-text|top-notes/.test(op.id))).map(op=>{
  const font=(op.style?.fontSizePt||12)*.3528,lineHeight=op.style?.lineHeight||1.1,
   lines=String(op.content||'').split('\n'),capacity=Math.max(1,op.size.width/(font*.72)),
   rows=lines.reduce((n,line)=>n+Math.max(1,Math.ceil([...line].length/capacity)),0),height=Math.min(45,rows*font*lineHeight);
  const [x,y]=op.place.at;
  return {id:op.id,box:[x,y,x+op.size.width,y+height]};
 });
}
function textCollisionPenalty(asset,slot,placementInfo,zones){
 if(!asset.visualRoles.some(role=>['figure','photo'].includes(role)))return {penalty:0,maxRatio:0};
 const [w,h]=mm(asset),[x,y]=placementInfo.centerMm,box=[x-w/2,y-h/2,x+w/2,y+h/2];
 let penalty=0,maxRatio=0;
 for(const zone of zones){
  const [a,b,c,d]=zone.box,overlap=Math.max(0,Math.min(c,box[2])-Math.max(a,box[0]))*Math.max(0,Math.min(d,box[3])-Math.max(b,box[1]));
  const textArea=Math.max(1,(c-a)*(d-b));
  const ratio=overlap/textArea;maxRatio=Math.max(maxRatio,ratio);
  if(ratio>.15)penalty+=Math.min(.22,.28*ratio);
 }
 return {penalty:Math.min(.4,penalty),maxRatio};
}

function scoreCandidate(asset,slot,pageMm,{templateId,zones}){
 if(templateId==='D146'&&!['stamp-material','top-clip'].includes(slot.id)&&asset.kind!=='paper')return null;
 if(DIE_CUT_SLOTS.has(`${templateId}/${slot.id}`)&&asset.shape!=='die-cut')return null;
 if(DARK_BACKINGS.has(`${templateId}/${slot.id}`)&&lightness(asset.mainColor)>.34)return null;
 if(slot.role==='date-card'&&(asset.writableAreaRatio??0)<.45)return null;
 if(['writing-card','date-card','writing-field','lower-writing-field'].includes(slot.role)&&asset.visualRoles.includes('writing-card')&&(asset.writableAreaRatio??0)<.3)return null;
 if(templateId==='D143'&&slot.id==='yellow-label'&&(asset.writableAreaRatio??0)<.25)return null;
 let fitAsset=asset;
 if(slot.id==='title-tape'){
  const [w,h]=mm(asset);
  if(asset.preservation!=='splittable'||!((w>=42&&h>=19)||(w>=7&&h>=32)))return null;
  fitAsset=w<15?{...asset,physicalWidthMM:h/2,physicalHeightMM:w}:{...asset,physicalWidthMM:25,physicalHeightMM:9};
 }
 const roleIndex=slot.accepts.findIndex(role=>asset.visualRoles.includes(role));
 if(roleIndex<0)return null;
 const p=placement(fitAsset,slot,pageMm,{templateId});if(!p)return null;
 if(p.method==='crop'&&asset.preservation!=='repeatable')return null;
 const semantic=[1,.78,.62][roleIndex]??.5;
 const identity=asset.visualRoles.includes('figure')&&slot.role==='figure'?1:0;
 const collision=textCollisionPenalty(asset,slot,p,zones);
 if(collision.maxRatio>.48)return null;
 const score=.53*semantic+.32*p.sizeScore+.08*Math.max(0,1-p.shift/12)+.07*identity-(p.method==='crop'?.08:0)-collision.penalty;
 if(score<.38)return null;
 return {...p,sourcePhysicalSizeMm:mm(asset),score:round(score),asset:id(asset),reason:`${slot.role} ← ${asset.visualRoles.join('/')}; ${slot.id==='title-tape'?'原长条切成两段':p.method==='complete'?'完整保留':'只裁重复纹样'}`};
}

export function matchMaterialsToTemplates(profiles,{templateIds=TEMPLATES,beamWidth=64}={}){
 if(!Array.isArray(profiles))throw new TypeError('素材画像必须是数组');
 profiles.forEach(validateMaterialProfile);
 const duplicate=new Set();for(const p of profiles){if(duplicate.has(id(p)))throw new RangeError(`素材 ID 重复：${id(p)}`);duplicate.add(id(p));}
 return templateIds.map(templateId=>{
 const template=describeTemplateObjects(templateId),slots=template.materialSlots.map(name=>template.objects.find(o=>o.id===name));
  const zones=textZones(templateId);
  let beam=[{score:0,used:[],assignments:[]}];
  for(const slot of slots){
   const candidates=profiles.map(p=>scoreCandidate(p,slot,template.pageMm,{templateId,zones})).filter(Boolean).sort((a,b)=>b.score-a.score).slice(0,12);
   const fallback={asset:null,method:'generated',score:.37,reason:'使用模板可编辑默认对象',centerMm:slot.target.centerMm,shiftMm:[0,0]};
   beam=beam.flatMap(state=>[fallback,...candidates.filter(c=>!state.used.includes(c.asset))].map(c=>({
    score:state.score+(c.score+(c.asset?state.used.reduce((sum,used)=>sum+harmony(profiles.find(p=>id(p)===used),profiles.find(p=>id(p)===c.asset)),0):0))*slot.weight,
    used:c.asset?[...state.used,c.asset]:state.used,
    assignments:[...state.assignments,{slot:slot.id,...c}]
   }))).sort((a,b)=>b.score-a.score||b.used.length-a.used.length).slice(0,beamWidth);
  }
  const best=beam[0],denom=slots.reduce((n,s)=>n+s.weight,0);
  return {templateId,score:round(best.score/denom),used:best.used,assignments:best.assignments,
   unused:profiles.map(id).filter(x=>!best.used.includes(x)),template};
 }).sort((a,b)=>b.score-a.score||b.used.length-a.used.length||a.templateId.localeCompare(b.templateId));
}

export function compileMatchedTemplate(plan,assets){
 const byId=new Map(assets.map(a=>[id(a),a])),bindings={},slotValues={},layout={};
 for(const choice of plan.assignments){
  if(!choice.asset){slotValues[choice.slot]={generated:true};continue;}
  if(!byId.has(choice.asset))throw new RangeError(`缺少已匹配素材：${choice.asset}`);
  bindings[choice.slot]=choice.asset;
  slotValues[choice.slot]={asset:choice.asset,fit:choice.method==='crop'?'crop':'none'};
  if(choice.shiftMm.some(x=>Math.abs(x)>.01))layout[choice.slot]={shiftMm:choice.shiftMm};
 }
 // A measured template can have one shared tape source; keep its generated
 // default unless a dedicated splittable asset was actually selected.
 if(plan.templateId==='D162')slotValues['gingham-tape']={generated:true};
 const selected=assets.filter(a=>plan.used.includes(id(a)));
 const draft=compileTemplateDraft({templateId:plan.templateId,assets:selected,bindings,slotValues,layout});
 return {...draft,matching:{score:plan.score,assignments:plan.assignments,unused:plan.unused}};
}
