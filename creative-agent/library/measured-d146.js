import {resolveD146Graph} from './d146-template-graph.js';

// Measured from the finished D146 page (630 × 900) and normalized to 110 × 157 mm.
// These coordinates are the template's composition, independent of source art.
const PX=[630,900],MM=[110,157];
const xy=(x,y)=>[x*MM[0]/PX[0],y*MM[1]/PX[1]];
const rect=b=>({center:xy((b[0]+b[2])/2,(b[1]+b[3])/2),width:(b[2]-b[0])*MM[0]/PX[0],height:(b[3]-b[1])*MM[1]/PX[1]});
const place=(b,rotationDeg=0)=>({reference:'page',at:rect(b).center,unit:'mm',rotationDeg});
const size=b=>({width:rect(b).width,height:rect(b).height,unit:'mm'});
const paper=(id,b,fill,{rotationDeg=0,texture='medium',edge,pattern}={})=>({op:'paper.add',id,place:place(b,rotationDeg),size:size(b),style:{fill},texture,...(edge?{edge}:{}),...(pattern?{pattern}:{})});
const text=(id,content,x,y,widthPx,fontSizePt,color,{fontFamily='Ma Shan Zheng',...style}={})=>({op:'text.add',id,content,place:{reference:'page',at:xy(x,y),unit:'mm',anchor:'top-left'},size:{width:widthPx*MM[0]/PX[0],unit:'mm'},style:{fontFamily,fontSizePt,color,lineHeight:1.08,...style}});
const graphic=(id,kind,b,fill,stroke,strokeWidthMm=.3)=>({op:'graphic.add',id,geometry:{kind},place:place(b),size:size(b),style:{fill,stroke,strokeWidthMm}});
const path=(id,b,d,stroke,width=.35,fill=null)=>({op:'graphic.add',id,geometry:{kind:'path',viewBox:[0,0,100,100],paths:[{d}]},place:place(b),size:size(b),style:{fill,stroke,strokeWidthMm:width}});
const id=a=>a.alias||a.id;
const name=a=>`${a.originalFilename||a.title||''} ${(a.tags||[]).join(' ')}`.toLowerCase();
function pick(assets,used,explicit,predicate,rank){
 if(explicit){const a=assets.find(x=>id(x)===explicit);if(!a)throw Error(`指定的素材不存在：${explicit}`);if(used.has(id(a)))throw Error(`素材重复占用：${explicit}`);return a;}
 return assets.filter(a=>!used.has(id(a))&&predicate(a)).sort((a,b)=>rank(a)-rank(b))[0];
}
function addMaterial(ops,used,asset,nodeId,b,rotation=0){
 ops.push({op:'material.add',id:nodeId,asset:id(asset),place:place(b,rotation)});used.add(id(asset));
}
function addDigit(ops,assets,used,slot,value,b,rotation,colors,explicit){
 const a=pick(assets,used,explicit,x=>String(x.numberValue??x.digit??'')===value||(/number|digit|数字/i.test(name(x))&&new RegExp(`(?:^|[^0-9])${value}(?:[^0-9]|$)`).test(name(x))),x=>Math.abs(x.physicalHeightMM-rect(b).height)+Math.abs(x.physicalWidthMM-rect(b).width));
 if(a&&a.physicalWidthMM<=rect(b).width*1.2&&a.physicalHeightMM<=rect(b).height*1.2){addMaterial(ops,used,a,slot,b,rotation);return 'material';}
 const blue=slot!=='bottom-one',black=slot==='bottom-one';
 ops.push(text(slot,value,b[0]+(black?-8:-2),b[1]-10,rect(b).width*PX[0]/MM[0]+35,blue?49:61,colors.ink,
  {fontFamily:'Otsutome',widthScale:slot==='top-four'?.66:blue?.78:.7,...(blue?{backing:{kind:'closed',color:colors.blue,paddingMm:1.1}}:{})}));
 return 'text';
}

export function compileMeasuredD146({assets=[],bindings={},texts={},palette={},layout={},slotValues={}}={}){
 if(!Array.isArray(assets))throw new TypeError('assets must be an array');
 const c={page:'#F7F5F0',dark:'#171D2A',yellow:'#F0C51E',cream:'#F3F0E9',lowerPaper:'#E8E2D7',gray:'#B8BBC5',blue:'#8BD2E8',ink:'#1D2027',...palette};
 const graph=resolveD146Graph({overrides:layout}),B=id=>graph.boxes[id];
 for(const key of Object.keys(slotValues))if(!graph.slots[key])throw new RangeError(`未知的 D146 槽位：${key}`);
 const choice=id=>({...graph.slots[id].defaultValue,...slotValues[id]});
 const slotText=(nodeId,content,fontSizePt,color,style)=>{const b=B(nodeId),v=slotValues[nodeId]||{};return text(nodeId,content,b[0],b[1],b[2]-b[0],v.fontSizePt??fontSizePt,v.color??color,{...style,...v.style});};
 const ops=[{op:'page.update',paperColor:c.page}],used=new Set(),warnings=[];
 ops[0].paperColor=slotValues.page?.color??c.page;
 const paperSlot=(nodeId,defaultColor,options={},candidate)=>{
  const v=choice(nodeId),b=B(nodeId),assetAlias=v.generated?null:v.asset??(slotValues[nodeId]?.color?null:bindings[nodeId]),a=v.generated?null:assetAlias?pick(assets,used,assetAlias,()=>true,()=>0):candidate;
  if(!a){ops.push(paper(nodeId,b,slotValues[nodeId]?.color??defaultColor,options));return;}
  if(a.kind!=='paper')throw new TypeError(`${nodeId} 只能使用纸张素材`);
  const w=Number(a.physicalWidthMM),h=Number(a.physicalHeightMM),bw=rect(b).width,bh=rect(b).height;
  if(!(w>0&&h>0))throw new RangeError(`${id(a)} 缺少物理尺寸`);
  if(w<=bw&&h<=bh){addMaterial(ops,used,a,nodeId,b,options.rotationDeg||0);return;}
  const printed=/card|text|letter|number|数字|字|人物|person|girl|photo/i.test(name(a));
  const fit=v.fit??'auto';
  if(fit==='none'||(fit==='auto'&&printed)){
   warnings.push(`${nodeId} 的 ${id(a)} 超过目标区间，保留素材并使用默认纸张`);
   ops.push(paper(nodeId,b,slotValues[nodeId]?.color??defaultColor,options));return;
  }
  const cw=Math.min(w,bw),ch=Math.min(h,bh),region={shape:'rect',space:'source',unit:'mm',box:[(w-cw)/2,(h-ch)/2,cw,ch]};
  if(fit==='mask'){
   addMaterial(ops,used,a,nodeId,b,options.rotationDeg||0);
   ops.push({op:'layer.mask',target:nodeId,region,mode:'intersect'});
  }else if(fit==='auto'||fit==='crop'){
   ops.push({op:'material.split',asset:id(a),pieces:[{id:nodeId,region,place:place(b,options.rotationDeg||0)}],keepRemainder:true});
   used.add(id(a));
  }else throw new RangeError(`${nodeId} 不支持 fit=${fit}`);
 };
 paperSlot('dark-top',c.dark);
 paperSlot('dark-bottom',c.dark);
 paperSlot('yellow-top',c.yellow,{edge:{style:'torn',edges:['top','right','bottom'],depthMm:.55}});
 const mainBox=B('main-paper'),main=slotValues['main-paper']?.generated||slotValues['main-paper']?.color&&!slotValues['main-paper']?.asset?null:pick(assets,used,slotValues['main-paper']?.asset??bindings.mainPaper,a=>a.kind==='paper'&&a.physicalHeightMM>70&&a.physicalWidthMM>45&&/cream|white|米白|白纸|弧线/.test(name(a)),a=>Math.abs(a.physicalWidthMM-rect(mainBox).width)+Math.abs(a.physicalHeightMM-rect(mainBox).height));
 paperSlot('main-paper',c.cream,{},main);
 const dotBox=B('gray-dot-paper'),dotPaper=slotValues['gray-dot-paper']?.generated||slotValues['gray-dot-paper']?.color&&!slotValues['gray-dot-paper']?.asset?null:pick(assets,used,slotValues['gray-dot-paper']?.asset??bindings.dotPaper,a=>a.kind==='paper'&&a.physicalWidthMM>35&&/pattern|纹|star|dot|点/.test(name(a)),a=>Math.abs(a.physicalWidthMM-rect(dotBox).width)+Math.abs(a.physicalHeightMM-rect(dotBox).height));
 paperSlot('gray-dot-paper',c.gray,{rotationDeg:-8,pattern:'dots'},dotPaper);
 paperSlot('bottom-writing',c.lowerPaper,{edge:{style:'torn',edges:['top'],depthMm:.6}});
 paperSlot('yellow-number-bar',c.yellow,{rotationDeg:-1});
 // Marker strokes are placed after font layout from each rendered line's ink bounds.
 const lineSlot=(nodeId,d,width)=>{
  const v=slotValues[nodeId]||{},b=B(nodeId),a=v.asset?pick(assets,used,v.asset,()=>true,()=>0):null;
  if(a&&a.physicalWidthMM<=rect(b).width*1.25&&a.physicalHeightMM<=rect(b).height*1.25){addMaterial(ops,used,a,nodeId,b);return;}
  if(a)warnings.push(`${nodeId} 的 ${id(a)} 过大，改用可编辑线条`);
  ops.push(path(nodeId,b,d,v.color??c.ink,width));
 };
 lineSlot('arc-left','M86 0 Q115 35 85 65 Q60 93 0 100',.4);
 lineSlot('arc-right','M100 0 Q36 36 29 65 Q35 85 7 100',.4);
 for(const [slot,legacy,rotation] of [['top-one',bindings.topOne,8],['top-four',bindings.topFour,8],['bottom-one',bindings.bottomOne,-4]]){
  const v=choice(slot);addDigit(ops,assets,used,slot,String(v.value),B(slot),rotation,c,v.asset??legacy);
 }
 const stampBox=B('stamp-frame'),stampCandidate=slotValues['stamp-material']?.generated||slotValues['stamp-material']?.text&&!slotValues['stamp-material']?.asset?null:pick(assets,used,slotValues['stamp-material']?.asset??bindings.stamp,a=>['paper','sticker'].includes(a.kind)&&a.physicalWidthMM<=rect(stampBox).width*.95&&a.physicalHeightMM<=rect(stampBox).height*.95,a=>Math.abs(a.physicalWidthMM/a.physicalHeightMM-rect(stampBox).width/rect(stampBox).height)*20+Math.abs(a.physicalWidthMM-rect(stampBox).width)*.1);
 const stamp=stampCandidate&&stampCandidate.physicalWidthMM<=rect(stampBox).width*.95&&stampCandidate.physicalHeightMM<=rect(stampBox).height*.95?stampCandidate:null;
 if(stampCandidate&&!stamp)warnings.push(`stamp-material 的 ${id(stampCandidate)} 超过槽位，改用可编辑文字`);
 ops.push(paper('stamp-frame',stampBox,slotValues['stamp-frame']?.color??c.blue,{texture:'subtle'}));
 ops.push(graphic('stamp-border','rect',B('stamp-border'),null,slotValues['stamp-border']?.color??c.dark,.55));
 if(stamp){addMaterial(ops,used,stamp,'stamp-material',stampBox);ops.push({op:'layer.stack',target:'stamp-material',reference:'stamp-border',side:'after'});}
 else ops.push(slotText('stamp-word',slotValues['stamp-material']?.text??texts.stamp??graph.slots['stamp-word'].defaultValue.text,16,c.dark,{fontFamily:'Otsutome'}));
 const clipCandidate=slotValues['top-clip']?.generated?null:pick(assets,used,slotValues['top-clip']?.asset??bindings.clip,a=>a.kind==='sticker'&&a.physicalWidthMM<=18&&a.physicalHeightMM<=20,a=>a.physicalWidthMM+a.physicalHeightMM),clip=clipCandidate&&clipCandidate.physicalWidthMM<=18&&clipCandidate.physicalHeightMM<=20?clipCandidate:null;
 if(clipCandidate&&!clip)warnings.push(`top-clip 的 ${id(clipCandidate)} 过大，改用可编辑夹子`);
 if(clip)addMaterial(ops,used,clip,'top-clip',B('top-clip'));
 else {ops.push(graphic('clip-ring','ellipse',B('clip-ring'),slotValues['clip-ring']?.color??c.gray,c.cream,.5));ops.push(paper('clip-body',B('clip-body'),slotValues['clip-body']?.color??c.gray,{texture:'subtle'}));}
 const textContent=(id,legacy)=>slotValues[id]?.text??legacy??graph.slots[id].defaultValue.text;
 for(const key of ['q1','q2','q3'])ops.push(slotText(key,textContent(key),24,slotValues[key]?.color??c.ink));
 for(const [key,legacy,font] of [['q1-head',texts.q1Heading,12],['q1-body',texts.q1,10.5],['q2-head',texts.q2Heading,12],['q2-body',texts.q2,10.5],['q3-head',texts.q3Heading,12],['q3-body',texts.q3,10.5]])ops.push(slotText(key,textContent(key,legacy),font,slotValues[key]?.color??c.ink));
 for(const nodeId of ['star-left','star-mid','star-right','star-bottom']){
  const v=choice(nodeId),b=B(nodeId),a=v.asset?pick(assets,used,v.asset,()=>true,()=>0):null;
  if(a&&a.physicalWidthMM<=rect(b).width*1.2&&a.physicalHeightMM<=rect(b).height*1.2){addMaterial(ops,used,a,nodeId,b);continue;}
  if(a)warnings.push(`${nodeId} 的 ${id(a)} 过大，改用可编辑点缀`);
  if(!['star','ellipse'].includes(v.kind))throw new RangeError(`${nodeId} 目前仅支持 star 或 ellipse 图形，其他点缀请指定 asset`);
  ops.push(graphic(nodeId,v.kind,b,v.color??(nodeId==='star-right'?c.yellow:c.ink)));
 }
 lineSlot('arrow-q1','M10 5 Q30 53 75 68 M62 54 L78 69 L59 79',.38);
 lineSlot('arrow-q2','M5 5 Q60 40 47 83 M34 70 L47 87 L62 69',.38);
 return {templateId:'D146',operations:ops,layoutGraph:graph,refinement:{digitInkBoxes:{'top-one':B('top-one'),'top-four':B('top-four'),'bottom-one':B('bottom-one')},textRegions:{'q1-body':{maxWidthMm:(B('main-paper')[2]-B('q1-body')[0])*110/630-4},'q2-body':{maxWidthMm:(B('main-paper')[2]-B('q2-body')[0])*110/630-1}},highlightTextIds:['q1-body','q2-body']},report:{used:[...used],unused:assets.map(id).filter(alias=>!used.has(alias)),warnings,modelCalls:0,referenceImagesUsed:0,source:'measured-template',pageMm:MM}};
}
