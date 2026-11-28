import {measuredCaseData} from './measured-case-data.js';
import {visibleCropRegion} from './template-crop-region.js';

const PAGE={D143:[110,200],D153:[110,157],D158:[110,157],D162:[110,157]};
const PX={D143:[495,900],D153:[630,900],D158:[630,900],D162:[630,900]};
const MATERIAL_BOXES_PX={
 D143:{'dark-stripe':[88,289,470,791],'orange-clip':[79,36,145,147],'girl-head':[270,124,450,240],'yellow-label':[69,437,206,607],'blue-loop':[108,706,344,768],'orange-loop':[49,744,282,817],'telephone-girl':[113,590,272,772]},
 D153:{'gray-paper':[32,49,515,705],'title-tape':[384,75,531,174],'plant-memo':[97,251,329,490],'orange-clip':[171,209,232,267],'banner-girl':[275,334,424,610],'yellow-dot-strip':[538,624,603,775]},
 D158:{'walking-dog':[117,276,288,391],'dog-plants-card':[348,567,588,784],'gingham-tape':[56,580,127,791],'rabbit-charm':[85,175,142,267],'paperclip':[149,104,193,160],'manga-girl':[418,141,578,497]},
 D162:{'bear-monday':[304,26,559,218],'red-arrow-round':[63,63,110,112],'heart-memo':[27,371,217,552],'tea-card':[258,614,506,804],'clip':[296,565,390,661],'gingham-top':[195,91,345,155],'gingham-middle':[53,483,141,615],'gingham-bottom':[406,756,598,823]}
};
const PARENTS={
 D143:{'q1':'light-ruled','top-notes':'light-ruled','memo-en':'memo-top','memo-cn':'memo-top','q2':'dark-stripe','q2-body':'dark-stripe','q3':'dark-stripe','q3-body':'dark-stripe','yellow-label-writing':'yellow-label','orange-loop':'dark-stripe','telephone-girl':'dark-stripe'},
 D153:{'date-numbers':'gray-paper','plant-memo':'gray-paper','banner-girl':'gray-paper','middle-notes':'gray-paper','middle-notes-extra':'gray-paper','hand-lettering':'gray-paper','lower-sign':'gray-paper','lower-sign-outline':'lower-sign','lower-sign-text':'lower-sign','bottom-notes':'bottom-tape'},
 D158:{'top-blue':'top-gray','top-writing':'top-blue','walking-dog':'top-writing','manga-girl':'top-blue','q1':'top-writing','q1-body':'top-writing','bottom-calendar':'bottom-gray','dog-plants-card':'bottom-gray','calendar-day':'bottom-calendar','calendar-month':'bottom-calendar','q3':'bottom-calendar','q3-body':'bottom-calendar','hello':'dog-plants-card'},
 D162:{'bear-monday':'blue-upper','red-arrow-round':'blue-upper','title-one':'blue-upper','q1':'blue-upper','q1-body':'blue-upper','heart-date':'heart-memo','tea-card':'blue-lower','clip':'tea-card','title-two':'ruled-middle','q2':'blue-lower','q2-body':'blue-lower','q3':'blue-lower','q3-body':'blue-lower','gingham-bottom':'tea-card'}
};
const MATERIAL={
 D143:{'dark-stripe':{role:'backing-paper',fallback:'#313849',match:/星芒|星座|豹纹|图案纸|手账纸/},'orange-clip':{role:'edge-accent',fallback:'#F1A92D',match:/磁带|格纹|橙红/},'girl-head':{role:'figure',fallback:'#F6F7F7',match:/人物|猫|女郎|照片/},'yellow-label':{role:'label',fallback:'#EEC333',match:/卡片|便签|圆角|信封/},'blue-loop':{role:'connector',fallback:'#5C9BCB',match:/磁带|格纹|长条/},'orange-loop':{role:'connector',fallback:'#F1A13F',match:/格纹|橙红|长条/},'telephone-girl':{role:'figure',fallback:'#F6F7F7',match:/人物|猫|女郎|蝴蝶/}},
 D153:{'gray-paper':{role:'backing-paper',fallback:'#596D6D',match:/星座记录|星芒|豹纹|手账纸/},'title-tape':{role:'connector',fallback:'#A0D7F7',match:/格纹|磁带|长条/},'plant-memo':{role:'writing-card',fallback:'#F5F8F0',match:/四叶草|便签|圆角|纸/},'orange-clip':{role:'edge-accent',fallback:'#E89544',match:/橙红|磁带|格纹/},'banner-girl':{role:'figure',fallback:'#FAFAF5',match:/人物|猫|女郎|蝴蝶/},'yellow-dot-strip':{role:'edge-accent',fallback:'#E8A914',match:/格纹|磁带|长条/}},
 D158:{'walking-dog':{role:'scene-card',fallback:'#F4EFE4',match:/照片|自行车|猫|面包/},'dog-plants-card':{role:'scene-card',fallback:'#F2E8DB',match:/照片|卡片|便签/},'gingham-tape':{role:'connector',fallback:'#414E55',match:/格纹|磁带|长条/},'rabbit-charm':{role:'edge-accent',fallback:'#EAE6D8',match:/蝴蝶|星星|磁带|小包/},'paperclip':{role:'edge-accent',fallback:'#9CA7BB',match:/磁带|星星|格纹/},'manga-girl':{role:'figure',fallback:'#F2EAE2',match:/人物|女郎|蝴蝶|猫/}},
 D162:{'bear-monday':{role:'figure',fallback:'#E9C1BB',match:/人物|猫|蝴蝶|面包/},'red-arrow-round':{role:'edge-accent',fallback:'#EF4B30',match:/橙红|播放|磁带/},'heart-memo':{role:'date-card',fallback:'#EAD5E9',match:/便签|圆角|信封|四叶草/},'tea-card':{role:'scene-card',fallback:'#F7F1EB',match:/照片|卡片|便签|面包/},'clip':{role:'edge-accent',fallback:'#8A9292',match:/磁带|格纹|小包/}}
};
const ids=a=>a.alias||a.id;
const title=a=>String(a.title||a.originalFilename||'');
const center=op=>op.place?.at;
const dimensions=(op,caseId)=>{
 const [pw,ph]=PAGE[caseId];
 if(op.size?.width&&op.size?.height)return [op.size.width,op.size.height];
 if(op.size?.width)return [op.size.width,Math.max(4,(op.style?.fontSizePt||12)*.48*ph/900)];
 return [12,12];
};
const boxesOf=(caseId,ops)=>{
 const result=Object.fromEntries(ops.filter(o=>o.id&&center(o)).map(o=>{
 const [w,h]=dimensions(o,caseId),[x,y]=center(o),topLeft=o.place.anchor==='top-left';
 return [o.id,[topLeft?x:x-w/2,topLeft?y:y-h/2,topLeft?x+w:x+w/2,topLeft?y+h:y+h/2]];
 }));
 for(const [id,b] of Object.entries(MATERIAL_BOXES_PX[caseId]))result[id]=[b[0]*PAGE[caseId][0]/PX[caseId][0],b[1]*PAGE[caseId][1]/PX[caseId][1],b[2]*PAGE[caseId][0]/PX[caseId][0],b[3]*PAGE[caseId][1]/PX[caseId][1]];
 return result;
};
const moves=(caseId,layout,boxes)=>{
 const out=new Map(),parent=PARENTS[caseId];
 function resolve(id){if(out.has(id))return out.get(id);const base=boxes[id],p=parent[id],anchor=p&&boxes[p]?resolve(p):null,mod=layout[id]||{};
  const scale=mod.scale??1,sx=Array.isArray(scale)?scale[0]:scale,sy=Array.isArray(scale)?scale[1]:scale;
  if(!(sx>0&&sy>0&&sx<=3&&sy<=3))throw new RangeError(`${id} 的缩放无效`);
  const [x0,y0,x1,y1]=base,[pw,ph]=PAGE[caseId],dx=(mod.shiftMm?.[0]||0),dy=(mod.shiftMm?.[1]||0);
  const inherited=anchor?anchor.scale:[1,1],local=[sx*inherited[0],sy*inherited[1]];
  const bx=(x0+x1)/2,by=(y0+y1)/2;
  const originalParent=p&&boxes[p]?[(boxes[p][0]+boxes[p][2])/2,(boxes[p][1]+boxes[p][3])/2]:null;
  const newCenter=anchor?[anchor.center[0]+(bx-originalParent[0])*anchor.scale[0]+dx,anchor.center[1]+(by-originalParent[1])*anchor.scale[1]+dy]:[bx+dx,by+dy];
  const result={center:newCenter,scale:local};out.set(id,result);return result;
 }
 for(const id of Object.keys(boxes))resolve(id);return out;
};
const visibleBox=(caseId,id,boxes,transforms)=>{
 const b=boxes[id],t=transforms.get(id);if(!b||!t)return null;
 const [w,h]=[(b[2]-b[0])*t.scale[0],(b[3]-b[1])*t.scale[1]];
 return {center:t.center,width:w,height:h};
};
const score=(asset,match,role)=>{
 const n=title(asset),kind=asset.kind||'';
 if(role.includes('paper')&&!['paper','note','card','sticker'].includes(kind))return -1;
 if(role==='figure'&&!['sticker','photo','other'].includes(kind))return -1;
 return (match.test(n)?10:0)+(kind==='paper'&&role.includes('paper')?3:0)+(kind==='photo'&&role==='scene-card'?3:0);
};
const objectKind=(role)=>role.includes('paper')||role==='writing-card'||role==='date-card'||role==='scene-card'||role==='label'||role==='connector'?'paper':'graphic';
const fallback=(op,caseId,role,fill,box)=>caseId==='D162'&&op.id==='heart-memo'?{
 op:'graphic.add',id:op.id,geometry:{kind:'path',viewBox:[0,0,100,100],paths:[{d:'M50 91 C33 78 5 61 7 35 C9 16 29 8 50 28 C71 8 91 16 93 35 C95 61 67 78 50 91 Z'}]},
 place:{...op.place,at:box.center},size:{width:box.width,height:box.height,unit:'mm'},
 style:{fill,stroke:'#746F98',strokeWidthMm:.45}
}:objectKind(role)==='paper'?{
 op:'paper.add',id:op.id,place:{...op.place,at:box.center},size:{width:box.width,height:box.height,unit:'mm'},style:{fill},texture:'medium'
 }:{op:'graphic.add',id:op.id,geometry:{kind:'star'},place:{...op.place,at:box.center},size:{width:Math.min(box.width,9),height:Math.min(box.height,9),unit:'mm'},style:{fill}};
const cropRegion=visibleCropRegion;
const isBindingHole=id=>/^(?:page-|paper-|binding-)?hole-\d+$/.test(id||'');
// Body copy has one readable default across the single-page collection. The
// measured headings, dates and oversized numbers keep their own hierarchy.
const BODY_TEXT_REFINEMENTS={
 D143:{
  'top-notes':{at:[35,39.8],width:36,text:'今日小事：\n留一点时间，\n记下好心情。'},
  'q2-body':{},'q3-body':{}
 },
 D153:{
  'plant-text':{},
  'middle-notes':{text:'阳光正好，\n写在蓝色里。'},
  'middle-notes-extra':{text:'小发现。'},
  'right-notes':{text:'好事缓缓发生，\n继续向前。'},
  'right-notes-extra':{text:'风和街角，\n都记在今天。'},
  'lower-notes':{text:'把喜欢的颜色\n和今天的风收好。'},
  'bottom-notes':{text:'每一天都值得记录。'}
 },
 D158:{
  'q1-body':{at:[40,51],width:22,text:'出去走走，\n心也轻了。'},
  'q2-body':{text:'下班喝杯热茶，\n路上的小事也值得记下。\n今天仍有可爱的一面。'},
  'q3-body':{at:[41,118],width:19,text:'目标：\n好好吃饭，\n早点休息。'}
 },
 D162:{
  'q1-body':{at:[45,47.1],width:41},
  'q2-body':{at:[78,95.8],width:27,text:'慢一点，\n也很好。\n记下欢喜。'},
  'q3-body':{at:[26,132],width:19,text:'一点开心\n一点温柔\n慢慢向前'}
 }
};
// The D153 white sheet is a large page under the gray card: its right margin
// and bottom edge are the two exposed parts of the same underlying paper.
// The earlier measurement captured only the bottom exposed strip.
export const measuredOperations=templateId=>(measuredCaseData[templateId]||[]).map(op=>{
 if(templateId==='D153'&&op.id==='white-ruled')return {...op,place:{...op.place,at:[67.5,102.5]},size:{...op.size,width:78,height:92}};
 if(templateId==='D143'&&op.id==='pink-caption-text')return {...op,content:'生活慢慢来'};
 if(templateId==='D162'&&op.id==='q2')return {...op,place:{...op.place,at:[63,90.7]}};
 const body=BODY_TEXT_REFINEMENTS[templateId]?.[op.id];
 return body&&op.op==='text.add'?{...op,content:body.text??op.content,
  place:body.at?{...op.place,at:body.at}:op.place,
  size:body.width?{...op.size,width:body.width}:op.size,
  style:{...op.style,fontSizePt:10.5}}:op;
});

// These are actual occlusion relationships in the measured references, not
// creation order. Keep them explicit because material masking/splitting and
// subsequent paper creation can otherwise change the visual stack.
const FINAL_STACK={
 D153:[['gray-paper','white-ruled'],['title-tape','title-strip'],['orange-clip','title-strip']],
 D162:[
  ['ruled-middle','blue-lower'],
  ['middle-rule-573','ruled-middle'],
  ['middle-rule-601','middle-rule-573'],
  ['middle-rule-629','middle-rule-601'],
  ['middle-rule-657','middle-rule-629'],
  ['gingham-middle','middle-rule-657'],
  ['heart-memo','gingham-middle']
 ]
};

export function resolveMeasuredCaseGraph(templateId,{layout={}}={}){
 const base=measuredOperations(templateId);if(!base.length)throw new RangeError(`未知的量测模板：${templateId}`);
 const boxes=boxesOf(templateId,base),transforms=moves(templateId,layout,boxes);
 const slots=Object.fromEntries(base.filter(o=>o.id&&!isBindingHole(o.id)&&!(templateId==='D153'&&o.id==='right-speckled')).map(o=>{const b=visibleBox(templateId,o.id,boxes,transforms),role=MATERIAL[templateId][o.id]?.role||({text:'editable-text',paper:'generated-paper',graphic:'generated-graphic'}[o.op.split('.')[0]]||'support');
  return [o.id,{parent:PARENTS[templateId][o.id]||'page',role,defaultValue:o.op==='text.add'?{text:o.content}:o.op==='paper.add'?{color:o.style?.fill}:MATERIAL[templateId][o.id]?{color:MATERIAL[templateId][o.id].fallback}:null,visibleSizeMm:b?[b.width,b.height]:null,inputSizeRangeMm:b?{width:[b.width*.65,b.width*1.8],height:[b.height*.65,b.height*1.8]}:null}];
 }));
 slots.page={parent:null,role:'canvas',defaultValue:{color:base[0].paperColor},visibleSizeMm:PAGE[templateId]};
 if(templateId==='D162')for(const id of ['gingham-top','gingham-middle','gingham-bottom']){
  const b=visibleBox(templateId,id,boxes,transforms);
  slots[id]={parent:PARENTS[templateId][id]||'page',role:'connector-piece',defaultValue:{color:'#343D43'},visibleSizeMm:b?[b.width,b.height]:null,inputSizeRangeMm:b?{width:[b.width*.65,b.width*1.8],height:[b.height*.65,b.height*1.8]}:null};
 }
 if(templateId==='D162')slots['gingham-tape']={parent:'page',role:'shared-source',defaultValue:{generated:true,color:'#343D43'},accepts:['tape-material','generated-tape'],pieces:['gingham-top','gingham-middle','gingham-bottom']};
 return {templateId,pageMm:PAGE[templateId],parent:PARENTS[templateId],boxes:Object.fromEntries(Object.keys(boxes).map(id=>[id,visibleBox(templateId,id,boxes,transforms)])),slots};
}

export function compileMeasuredCase({templateId,assets=[],bindings={},texts={},palette={},layout={},slotValues={}}={}){
 const base=measuredOperations(templateId);if(!base.length)throw new RangeError(`尚无可用的量测模板：${templateId}`);
 const boxes=boxesOf(templateId,base),transforms=moves(templateId,layout,boxes),used=new Set(),warnings=[],ops=[];
 const assetFor=(nodeId,role,match)=>{
  const requested=slotValues[nodeId]?.asset??bindings[nodeId];
  if(requested){const a=assets.find(a=>ids(a)===requested);if(!a)throw new RangeError(`${nodeId} 指定的素材不存在：${requested}`);if(used.has(ids(a)))throw new RangeError(`素材重复占用：${requested}`);return a;}
  return assets.filter(a=>!used.has(ids(a))).map(a=>({a,s:score(a,match,role)})).filter(x=>x.s>0).sort((x,y)=>y.s-x.s)[0]?.a;
 };
 const page=base[0];ops.push({...page,paperColor:slotValues.page?.color??palette.page??page.paperColor});
 for(const source of base.slice(1)){
  const v=slotValues[source.id]||{};if(v.visible===false)continue;
  if(isBindingHole(source.id))continue;
  // D153's two blue joins are cut from one physical tape; the open right margin
  // is the page itself, not a third writing paper.
  if(templateId==='D153'&&['right-speckled','bottom-tape'].includes(source.id))continue;
  if(source.op==='material.split'){
   const tape=slotValues['gingham-tape']?.generated?null:assetFor('gingham-tape','connector',/格纹|长条|磁带/);
   if(tape){used.add(ids(tape));ops.push({...source,asset:ids(tape),pieces:source.pieces.map(p=>({...p,place:{...p.place,at:transforms.get(p.id)?.center||p.place.at}}))});}
   else for(const p of source.pieces){const w=p.id==='gingham-middle'?15:30,h=10;ops.push({op:'paper.add',id:p.id,place:{...p.place,at:transforms.get(p.id)?.center||p.place.at},size:{width:w,height:h,unit:'mm'},style:{fill:slotValues['gingham-tape']?.color||'#343D43'},texture:'medium',pattern:'grid'});}
   continue;
  }
  if(source.op==='material.window'){if(ops.some(o=>o.op==='material.split'&&o.pieces.some(p=>p.id===source.target)))ops.push(source);continue;}
  if(source.op==='layer.stack'||source.op==='layer.update'&&source.target){ops.push(source);continue;}
  if(!source.id){ops.push(source);continue;}
  const target=visibleBox(templateId,source.id,boxes,transforms);
  let next=structuredClone(source);
  if(target&&next.place){next.place.at=next.place.anchor==='top-left'?[target.center[0]-target.width/2,target.center[1]-target.height/2]:target.center;if(v.rotationDeg!==undefined)next.place.rotationDeg=v.rotationDeg;}
  if(next.size&&target){if(next.size.width!==undefined)next.size.width=target.width;if(next.size.height!==undefined)next.size.height=target.height;}
  if(next.op==='material.add'){
   const def=MATERIAL[templateId][next.id],a=v.generated?null:assetFor(next.id,def.role,def.match);
   if(templateId==='D153'&&next.id==='title-tape'){
    const lower=visibleBox(templateId,'bottom-tape',boxes,transforms),wide=Number(a?.physicalWidthMM),high=Number(a?.physicalHeightMM);
    if(a&&((wide>=42&&high>=19)||(wide>=7&&high>=32))){
     const narrow=wide<15,pieces=narrow?[[0,0,wide,high/2],[0,high/2,wide,high/2]]:[[0,0,25,9],[0,10,40,9]];
     ops.push({op:'material.split',asset:ids(a),pieces:[
      {id:'title-tape',region:{shape:'rect',space:'source',unit:'mm',box:pieces[0]},place:narrow?{...next.place,at:[target.center[0]-10,target.center[1]-4],rotationDeg:-90}:next.place},
      {id:'bottom-tape',region:{shape:'rect',space:'source',unit:'mm',box:pieces[1]},place:{reference:'page',at:lower.center,unit:'mm',rotationDeg:narrow?-90:0}}
     ],keepRemainder:true});used.add(ids(a));
    }else{
     if(a)warnings.push('同源胶带长度不足，改用两段同色可编辑胶带');
     ops.push(fallback(next,templateId,'connector',v.color??'#A8D9F4',target));
     ops.push({op:'paper.add',id:'bottom-tape',place:{reference:'page',at:lower.center,unit:'mm'},size:{width:lower.width,height:lower.height,unit:'mm'},style:{fill:v.color??'#A8D9F4'},texture:'medium'});
    }
    continue;
   }
   if(a){
    const fit=v.fit||'auto',isPaper=['backing-paper','writing-card','date-card'].includes(def.role),w=Number(a.physicalWidthMM),h=Number(a.physicalHeightMM);
    if(fit==='auto'&&(w>target.width*1.25||h>target.height*1.25)){
     ops.push(fallback(next,templateId,def.role,v.color??def.fallback,target));
     warnings.push(`${next.id} 的 ${ids(a)} 超出适配区间，保留素材并使用可编辑替代对象`);continue;
    }
    if(fit==='crop'&&isPaper&&w>0&&h>0&&(w>target.width||h>target.height)){
     ops.push({op:'material.split',asset:ids(a),pieces:[{id:next.id,region:cropRegion(a,target.width,target.height),place:next.place}],keepRemainder:true});
    }else if(fit==='mask'&&w>0&&h>0){ops.push({...next,asset:ids(a)});ops.push({op:'layer.mask',target:next.id,region:cropRegion(a,target.width,target.height),mode:'intersect'});}
    else {ops.push({...next,asset:ids(a)});if(w>target.width*1.5||h>target.height*1.5)warnings.push(`${next.id} 的实物尺寸大于目标槽位，保持原尺寸，可改用裁切或蒙版`);}
    used.add(ids(a));
   }else {ops.push(fallback(next,templateId,def.role,v.color??def.fallback,target));warnings.push(`${next.id} 未匹配素材，使用可编辑替代对象`);}
   continue;
  }
  if(next.op==='text.add'){next.content=v.text??texts[next.id]??next.content;next.style={...next.style,...(v.style||{}),...(v.color?{color:v.color}:{})};}
  if(next.op==='paper.add'){next.style={...next.style,...(v.color?{fill:v.color}:{}),...(palette[next.id]?{fill:palette[next.id]}:{})};}
  if(next.op==='graphic.add'&&v.color)next.style={...next.style,fill:v.color};
  ops.push(next);
 }
 const available=new Set(ops.flatMap(o=>[o.id,...(o.pieces||[]).map(p=>p.id)].filter(Boolean)));
 for(const [target,reference] of FINAL_STACK[templateId]||[]){
  if(available.has(target)&&available.has(reference))ops.push({op:'layer.stack',target,reference,side:'after'});
 }
 return {templateId,operations:ops,layoutGraph:resolveMeasuredCaseGraph(templateId,{layout}),report:{used:[...used],unused:assets.map(ids).filter(x=>!used.has(x)),warnings,modelCalls:0,referenceImagesUsed:0,pageMm:PAGE[templateId],source:'measured-template'}};
}
