import {creationHelp,inspectCreationDocument} from '../../src/creation-inspection.js';
import {creationCommandRegistry} from '../../src/creation-v2-contract.js';
import {creationCommonDefinitions} from '../../src/creation-command-spec.js';
import {validateWebScene} from '../../src/web-scene-workbench.js';
import {assetFromSourceSnapshot} from '../../src/material-anatomy.js';
import {techniqueCatalog} from '../../creative-agent/library/techniques.js';

export function recommendCreationSkills(skills,document,brief={}){
  if(document.source.materials?.length===0){
    const catalog=new Map(skills.catalog().map(skill=>[skill.name,skill]));
    const names=[...(document.source.textMode==='none'?[]:['journal-writing','journal-lettering']),'journal-graphics','journal-composition','journal-color','journal-accents'];
    return names.filter(name=>catalog.has(name)).map(name=>catalog.get(name));
  }
  const names=['journal-composition','journal-color','paper-layering','journal-accents'];
  if(document.source.textMode!=='none')names.push('journal-writing','journal-lettering');
  const styles=new Set([...(brief.styles||[]),...(document.source.styles||[]),brief.style]);
  const routes={'童趣可爱':'journal-graphics','复古旧物':'paper-layering','清新淡雅':'photo-story','极简留白':'journal-composition','疏朗留白':'journal-composition','丰富层叠':'journal-composition','美式拼贴':'photo-story','杂志排版':'photo-story','日系文具':'journal-writing'};
  for(const [style,name] of Object.entries(routes))if(styles.has(style))names.push(name);
  const catalog=new Map(skills.catalog().map(skill=>[skill.name,skill]));
  return [...new Set(names)].filter(name=>catalog.has(name)).map(name=>catalog.get(name));
}

export function shortlistCreationMethods(document,brief={}){
  const style=[...(brief.styles||[]),...(document.source.styles||[]),brief.style].filter(Boolean).join(' ');
  const materialCount=document.source.materials.length;
  const text=style+' '+String(brief.intent||'');
  if(!materialCount){
    const ids=document.source.textMode==='none'?['graphic-loop','graphic-route']:/丰富|层叠|拼贴/.test(text)?['title-stack','title-phrases','title-paper-lettering','graphic-route']:
      ['title-phrases','title-tape','title-paper-lettering','graphic-loop'];
    const methods=new Map(techniqueCatalog.methods.map(method=>[method.id,method]));
    return ids.map(id=>methods.get(id)).filter(Boolean).map(({id,title,when,skill})=>({id,title,when,skill,readWith:{name:skill,level:'detail',methodId:id}}));
  }
  const ids=/丰富|层叠|拼贴/.test(text)?['paper-peek','accent-materials','graphic-route','accent-spark','title-tape']:
    /极简|留白|清新|淡雅/.test(text)?['paper-peek','graphic-loop','title-phrases','title-tape']:
    /杂志|照片|旅行/.test(text)?['photo-film','paper-peek','graphic-route']:
    ['paper-peek','accent-materials','title-label'];
  const methods=new Map(techniqueCatalog.methods.map(method=>[method.id,method]));
  const candidates=[...ids];
  if(document.source.textMode!=='none')candidates.splice(Math.min(2,candidates.length),0,'record-on-material');
  return [...new Set(candidates)].map(id=>methods.get(id)).filter(method=>method&&(document.source.textMode!=='none'||!['journal-writing','journal-lettering'].includes(method.skill))).map(({id,title,when,skill})=>({id,title,when,skill,readWith:{name:skill,level:'detail',methodId:id}}));
}

export function initialToolGuide(document){
  const topics=[...(document.source.materials.length?['material.add']:[]),'layer.update','graphic.add','place','size','order'];
  if(document.source.textMode!=='none')topics.push('text.add');
  const tapeAliases=document.source.materials.filter(m=>document.source.sourceSnapshots.find(s=>s.assetID===m.assetID)?.kind==='tape').map(m=>m.alias);
  const commandIndex=creationHelp();
  return {topics:commandIndex.topics,conventions:commandIndex.conventions,families:commandIndex.families,common:creationHelp({topics}),tapeAliases,fieldDefinitions:{Color:creationCommonDefinitions.Color,Letters:creationCommonDefinitions.Letters},
    notes:['常用操作、全局素材编号图与尺寸已加载；复杂参数先用 creation_help 查询精确命令名，如 text.add（不是 text）。','place.at 必须是 [x,y] 数组；相对定位使用 reference、referenceAnchor、anchor 和 offset。','creation_inspect 返回从后到前的 layerTree；后加的纸遮住素材时，用 layer.update.order={before:素材ID} 或 edge=back 调整。跨组调前后用 layer.stack；组合用 group.create、layer.reparent、group.ungroup。','几何调整统一用 layout：nudge 按毫米/角度增量微调，matchRotation 跟另一素材对齐角度，alignEdge 贴齐指定可见边，align 按边界对齐或分布；这几项都保留实体尺寸。matchRotation、alignEdge 的相对角度都叫 offsetDeg；nudge.rotationDeg 是当前角度的增量。批量操作用 targets，单对象操作用 target。','数字纸用 creation_paper 批量创建，直接选 color、texture、edge，可加 pattern 和 translucency；默认无阴影。order 明确层序，勿盖正文。纯色矩形适合普通色块，纸层分工与露边可读 paper-layering。graphic.add 的常用 kind 是 rect、ellipse、star。星角数量写 geometry.options.points，例如 {kind:"star",options:{points:5}}。圆圈、方块、星星都用 size.width/height 和 style.fill/stroke。手写压感线条才用 kind:"stroke" 与 geometry.points=[{x,y,pressure}]，它不支持 strokeDash；点线或虚线用 path/基础图形。','标题用 creation_title：layout 选择 plain/stagger/curve，runs 设置词组大小角色与错位，effect 直接选 outline/hollow/offset-outline/gradient-outline/shadow/none，accentColor 配色，style 可微调，backdrop 设置字后衬形；可组合也可简洁。整组移动用 layer.update，子文字和底形同样可编辑；复杂拆字读 journal-lettering。','material.tape 只能使用 tapeAliases 中的来源；列表为空时本次没有胶带。普通长条纸、文字剪片用 material.add 或合法裁切。','创建用 id，修改已有对象用 target；不要在 layer.update 中传 id。普通 text.add 文字改内容、位置、尺寸、样式都用 layer.update；text.reflow 只给 text.lettering 的逐字标题组重排。','透明填充用 style.fill:null，不能写 none。grid/dots/stripes 的 fill 是底色、stroke 是纹样色；行列数 1–128；stripes.angle=0 横向、90 纵向。横线纸 linedNote 用 rows 控制行数，不接收 spacing。颜色用六位 HEX；文字用 style.color，图形和笔迹用 style.stroke 或 style.fill，不能对 ink 使用 style.color。']};
}

export function compactInitialToolGuide(document){
  const guide=initialToolGuide(document);
  return {topics:guide.topics,conventions:guide.conventions,families:guide.families,common:guide.common.descriptions.map(({name,summary,required,parameters,examples,notes})=>({name,summary,required,fields:Object.keys(parameters||{}),example:name==='graphic.add'?{op:'graphic.add',id:'accent-dot',geometry:{kind:'ellipse'},place:{reference:'page',at:[50,50],unit:'mm'},size:{width:8,height:8,unit:'mm'},style:{fill:'#D5A45B'}}:examples?.[0],notes})),tapeAliases:guide.tapeAliases,fieldDefinitions:guide.fieldDefinitions,
    basicMethods:'单个星、花、箭头、波浪、边框、回形针、点/条纹/网格，以及文字的普通阴影、描边、渐变、下划线和图注，直接用 graphic.add / text.add 的 geometry/style，修改用 layer.update；它们不是需要 read_skill 的技巧。需要真实组合关系、字群、纸层、照片组或点缀簇时再读 Skill。',notes:guide.notes};
}

export function materialBrief(document){
  const required=new Set(document.source.requiredAssetIDs||[]);
  return document.source.materials.map(m=>{
    const s=document.source.sourceSnapshots.find(s=>s.assetID===m.assetID),a=assetFromSourceSnapshot(s,{frozenRevision:true});
    return {alias:m.alias,title:s.title,widthMM:a.physicalWidthMM,heightMM:a.physicalHeightMM,required:required.has(m.assetID),priority:Object.entries(document.source.materialPriority||{}).find(([,ids])=>Array.isArray(ids)&&ids.includes(m.assetID))?.[0],tapeAxis:s.tapeAxis};
  });
}

export function automaticSceneFeedback(document){
  const inspection=inspectCreationDocument(document),byID=new Map(inspection.layers.map(l=>[l.id,l]));
  const visible=l=>l.surface==='page'&&!l.hidden&&l.opacity>0&&(!l.parent||visible(byID.get(l.parent)));
  const placed=new Set(inspection.layers.filter(l=>l.asset&&visible(l)).map(l=>l.asset));
  const required=materialBrief(document).filter(m=>m.required).map(m=>({alias:m.alias,title:m.title,present:placed.has(m.alias)}));
  let finalValidation={ok:true};
  try{validateWebScene(document.page,document.source,document.source.sourceSnapshots.map(s=>assetFromSourceSnapshot(s,{frozenRevision:true})),{final:true});}
  catch(e){finalValidation={ok:false,issue:e.message};}
  return {required,finalValidation,foundation:paperFoundationStatus(document,inspection)};
}

const rgb=hex=>/^#[0-9a-f]{6}$/i.test(hex||'')?[1,3,5].map(index=>parseInt(hex.slice(index,index+2),16)):null;
const colorDistance=(a,b)=>{const aa=rgb(a),bb=rgb(b);return aa&&bb?Math.hypot(...aa.map((value,index)=>value-bb[index])):0;};

export function paperFoundationStatus(document,inspection=inspectCreationDocument(document)){
  const rich=(document.source.styles||[]).some(style=>/丰富|层叠|拼贴/.test(style));
  const required=document.source.materials.length>0&&(rich||document.source.materials.length>=2)&&!(document.source.styles||[]).some(style=>/极简|无打底/.test(style));
  if(!required)return {required:false,missingPages:[],unconnectedPages:[],flatBoards:false};
  const page=document.page,height=page.physicalPageHeightMM;
  const leaves=page.pageMode==='spread'?2:1;
  const leafWidth=page.canvas.width/page.canvas.height*height/leaves;
  const leafArea=leafWidth*height;
  const sourceByAlias=new Map(document.source.materials.map(material=>[material.alias,document.source.sourceSnapshots.find(snapshot=>snapshot.assetID===material.assetID)]));
  const found=Array(leaves).fill(false),papers=Array.from({length:leaves},()=>[]),carriers=Array.from({length:leaves},()=>[]),contents=Array.from({length:leaves},()=>[]);
  const box=layer=>{const [w,h]=layer.world.sizeMm,[x,y]=layer.world.centerMm;return {l:x-w/2,r:x+w/2,t:y-h/2,b:y+h/2,area:w*h};};
  const overlap=(a,b)=>Math.max(0,Math.min(a.r,b.r)-Math.max(a.l,b.l))*Math.max(0,Math.min(a.b,b.b)-Math.max(a.t,b.t));
  for(const layer of inspection.layers){
    if(layer.surface!=='page'||layer.hidden||layer.opacity<0.6||!layer.world?.sizeMm||!layer.world?.centerMm)continue;
    const [width,layerHeight]=layer.world.sizeMm;
    const pageIndex=leaves===1?0:Math.min(1,Math.floor(layer.world.centerMm[0]/leafWidth));
    if(layer.type==='material'||layer.type==='text')contents[pageIndex].push({id:layer.id,box:box(layer)});
    const area=width*layerHeight;
    if(layer.type==='shape'&&area>=leafArea*0.14&&layer.fill&&colorDistance(layer.fill,page.paperColor)>=30){
      found[pageIndex]=true;
      papers[pageIndex].push({fill:layer.fill.toLowerCase(),width,height:layerHeight,centerY:layer.world.centerMm[1],area:width*layerHeight});
      carriers[pageIndex].push({id:layer.id,box:box(layer)});
    }
    if(layer.type==='material'){
      const source=sourceByAlias.get(layer.asset);
      // A real card can carry a collage even when it covers a little less
      // area than a generated color panel; its printed edge remains visible.
      if(area>=leafArea*0.1&&source?.kind==='paper'){
        found[pageIndex]=true;
        carriers[pageIndex].push({id:layer.id,box:box(layer)});
      }
    }
  }
  // Two identical oversized color panels satisfy a color check but read as a
  // presentation board, not as paper pieces supporting a journal collage.
  const prominent=papers.map(rows=>rows.filter(row=>row.area>=leafArea*0.35));
  const [left,right]=prominent.map(rows=>rows.length===1?rows[0]:null);
  const close=(a,b,scale)=>Math.abs(a-b)<=scale;
  const flatBoards=Boolean(rich&&leaves===2&&left&&right&&
    close(left.width,right.width,leafWidth*0.12)&&close(left.height,right.height,height*0.12)&&
    close(left.centerY,right.centerY,height*0.08));
  const pageName=index=>leaves===1?'page':index?'page.right':'page.left';
  const unconnectedPages=rich?carriers.flatMap((rows,index)=>{
    if(!rows.length||!contents[index].length)return [];
    const connected=rows.some(paper=>contents[index].some(content=>content.id!==paper.id&&overlap(paper.box,content.box)>=Math.min(paper.box.area,content.box.area)*0.05));
    return connected?[]:[pageName(index)];
  }):[];
  return {required:true,missingPages:found.flatMap((value,index)=>value?[]:[pageName(index)]),unconnectedPages,flatBoards,
    hint:'承托层可以是已有的纹样纸、可写卡、纸片或数字纸形；先试摆真实素材，只有缺少合适写面或色彩关系时再加数字纸。'};
}

export function modelContext(messages,state={}){
  // The stage prompt is inserted into the outgoing request. Never let that
  // insertion mutate the checkpoint's source messages.
  if(messages.length<=2)return [...messages];
  const first=messages[1],parts=Array.isArray(first?.content)?first.content:null;
  const afterFirstPreview=Boolean(state.qualityFrames?.length);
  const index=parts?{...first,content:parts.filter((part,i)=>part.type!=='image_url'||(!afterFirstPreview&&i===parts.findIndex(p=>p.type==='image_url'))).map(part=>
    afterFirstPreview&&part.type==='text'&&part.text?.startsWith('全局素材编号图')?{...part,text:'全局素材编号与尺寸仍在任务清单；需要重看原始总图时调用 workspace_view({id:"source"})。'}:part)}:first;
  const turns=messages.flatMap((message,i)=>message.role==='assistant'?[i]:[]);
  // Opening user constraints (including study scope and preloaded skills)
  // remain authoritative after the first tool call, not expendable history.
  const opening=messages.slice(2,turns[0]??messages.length).filter(m=>m.role==='user'&&typeof m.content==='string');
  // Keep a substantial recent span verbatim. The separate Scene checkpoint
  // carries exact geometry; this tail carries the author's still-live intent.
  let start=Math.max(Number.isInteger(state.compactedUntil)?state.compactedUntil:2,turns.at(-8)??turns.at(0)??2);
  while(start>2&&messages[start]?.role==='tool')start--;
  const isPreview=message=>message.role==='user'&&Array.isArray(message.content)&&message.content.some(part=>part.type==='text'&&part.text?.includes('当前真实画面：'));
  const tail=messages.slice(start),latestObservation=messages.slice(2).findLast(isPreview);
  if(latestObservation&&!tail.includes(latestObservation))tail.unshift(latestObservation);
  const lastPreview=tail.findLastIndex(isPreview),lastAssistant=tail.findLastIndex(message=>message.role==='assistant');
  const recent=tail.filter((message,i)=>{
    if(isPreview(message))return i===lastPreview;
    if(message.role==='user'&&Array.isArray(message.content)&&message.content.some(part=>part.type==='image_url'))return i>lastAssistant;
    return true;
  });
  const recentToolNames=new Map(recent.flatMap(message=>message.role==='assistant'?(message.tool_calls||[]).map(call=>[call.id,call.function?.name]):[]));
  const recentAssistants=recent.flatMap((message,i)=>message.role==='assistant'?[i]:[]);
  const compactedRecent=recent.map((message,i)=>{
    if(message.role==='tool'&&recentToolNames.get(message.tool_call_id)==='creation_help'&&i<(recentAssistants.at(-2)??-1))return {...message,content:'{"ok":true,"detail":"参数已读取；需要再次查看时调用 creation_help。"}'};
    if(message.role==='tool'&&['creation_apply','creation_recipe','creation_paper','creation_title'].includes(recentToolNames.get(message.tool_call_id))&&i<(recentAssistants.at(-2)??-1)){
      try{const receipt=JSON.parse(message.content);if(receipt.ok)return {...message,content:'{"ok":true,"detail":"较早的编辑已生效；对象和最新版本见当前 Scene。"}'};}catch{/* Keep the original response. */}
    }
    return message;
  });
  // A tray-only render may carry no page image. Keep exactly the page image
  // matching the current visual signature, even after several read-only turns.
  const signature=state.visualState?.page?.signature;
  const pageParts=message=>{
    if(!signature||!Array.isArray(message.content))return null;
    const i=message.content.findIndex(part=>part.type==='text'&&part.text?.startsWith('工作空间 page；')&&part.text.includes('画面版本：'+signature));
    return i>=0&&message.content[i+1]?.type==='image_url'?message.content.slice(i,i+2):null;
  };
  if(signature&&!compactedRecent.some(pageParts)){
    const prior=messages.findLast(message=>pageParts(message));
    if(prior)compactedRecent.push({role:'user',content:pageParts(prior)});
  }
  // A tutorial is a comparison reference, not a one-turn material inspection.
  // Keep one most recently studied example beside the current artwork, even
  // when its read_skill call has left the rolling history window.
  let tutorialParts;
  for(const message of messages){
    if(message.role!=='user'||!Array.isArray(message.content))continue;
    for(let i=0;i<message.content.length-1;i++){
      const part=message.content[i];
      if(part.type==='text'&&part.text?.startsWith('教程示意（')&&message.content[i+1].type==='image_url')tutorialParts=message.content.slice(i,i+2);
    }
  }
  if(tutorialParts&&!compactedRecent.some(message=>Array.isArray(message.content)&&message.content.some(part=>part.type==='image_url'&&part.image_url?.url===tutorialParts[1].image_url?.url))){
    compactedRecent.push({role:'user',content:tutorialParts});
  }
  const pinnedOpening=opening.filter(m=>!compactedRecent.includes(m));
  if(!state.document)return [messages[0],index,...pinnedOpening,...compactedRecent];
  const names=new Map(messages.slice(2,start).flatMap(message=>message.role==='assistant'?(message.tool_calls||[]).map(call=>[call.id,call.function?.name]):[]));
  const references=messages.slice(2,start).filter(message=>message.role==='tool'&&['read_skill','read_case'].includes(names.get(message.tool_call_id))).flatMap(message=>{
    try{const receipt=JSON.parse(message.content);return receipt.ok?[{tool:names.get(message.tool_call_id),detail:JSON.stringify(receipt.data).slice(0,1200)}]:[];}catch{return [];}
  }).slice(-2);
  const inspected=inspectCreationDocument(state.document);
  // The newest automatic observation already carries the same Scene. Keep only
  // its revision in the state summary so a long page is not billed twice.
  const previewVisible=lastPreview>=0;
  const scene=previewVisible?{sceneRevision:inspected.sceneRevision}:{sceneRevision:inspected.sceneRevision,page:inspected.page,layers:inspected.layers.filter(layer=>state.phase!=='review'||layer.surface==='page').map(({id,type,surface,asset,content,world,hidden,parent})=>({id,type,surface,asset,content:typeof content==='string'?content.slice(0,120):undefined,world,hidden,parent}))};
  // Windowing must not silently erase decisions before the token threshold
  // triggers model compaction. Summarize only the uncovered interval locally.
  const memoryStart=Number.isInteger(state.compactedUntil)?state.compactedUntil:2;
  const memory=start>memoryStart?fallbackCreativeMemory(state.creativeMemory,creativeCompactionTranscript(messages.slice(memoryStart,start)),state):state.creativeMemory;
  const summary={creativeMemory:memory||null,memoryNote:'creativeMemory 只总结较早回合；若与最新 Scene 或下方原始回合冲突，以最新信息为准',phase:state.phase||'direction',phaseReviews:(state.phaseReviews||[]).map(({from,to,observations,adjustments})=>({from,to,observations,adjustments})),plan:state.plan,decisions:(state.decisions||[]).slice(-6),spaces:state.spaces,visualState:state.visualState||null,scene,preview:state.preview?{pngHash:state.preview.pngHash,sceneRevision:state.preview.sceneRevision,artifact:state.preview.artifact}:null,loadedSkills:state.loadedSkills,recommendedMethods:(state.recommendedMethods||[]).map(({id,skill,title})=>({id,skill,title})),skillReferences:state.phase==='review'?[]:(state.skillReferences||[]),references:state.phase==='review'?[]:references,lastResults:(state.results||[]).slice(-6).map(({name,ok,code,detail})=>({name,ok,code,detail})),drafts:state.phase==='review'?[]:(state.drafts||[]).map(({id,goal,pngHash,baseSceneRevision})=>({id,goal,pngHash,baseSceneRevision})),undoAvailable:(state.undoStack||[]).length,reviewPending:state.reviewPending??Boolean(state.preview&&!state.review),review:state.review||null};
  return [messages[0],index,...pinnedOpening,{role:'user',content:'当前创作状态（由检查点生成，早期对话已压缩）：'+JSON.stringify(summary)},...compactedRecent];
}

export function creativeCompactionCandidate(messages,state={}){
  // Pi-style threshold compaction: summarize only when the actual preceding
  // request became large, rather than paying for a summary every four turns.
  // Keep six assistant cycles intact so live decisions and tool outcomes stay
  // visible after a checkpoint. Images are never summarized as text.
  if((state.usage?.at(-1)?.prompt_tokens||0)<38000)return null;
  const from=Number.isInteger(state.compactedUntil)?state.compactedUntil:2;
  const enough=cutoff=>Number.isInteger(cutoff)&&cutoff>from&&messages.slice(from,cutoff).filter(message=>message.role==='assistant').length>=6;
  const assistants=messages.flatMap((message,index)=>message.role==='assistant'?[index]:[]);
  let cutoff=assistants.at(-6);
  while(cutoff>2&&messages[cutoff]?.role==='tool')cutoff--;
  if(!enough(cutoff))return null;
  const older=messages.slice(from,cutoff);
  return {cutoff,history:creativeCompactionTranscript(older)};
}

export function creativeCompactionTranscript(messages){
  const compactCall=call=>{
    const name=call.function?.name;
    let args;try{const parsed=JSON.parse(call.function?.arguments||'{}');args=parsed&&typeof parsed==='object'?parsed:{};}catch{return {name,invalidArguments:true};}
    if(name==='creation_apply')return {name,transactionId:args.transactionId,decision:args.decision,operations:(Array.isArray(args.operations)?args.operations:[]).map(raw=>{const op=raw&&typeof raw==='object'?raw:{};return {op:op.op,id:op.id,target:op.target,asset:op.asset,content:typeof op.content==='string'?op.content.slice(0,120):undefined,size:op.size,fontFamily:op.style?.fontFamily,surface:op.place?.surface||op.patch?.place?.surface,reference:op.place?.reference,at:op.place?.at,rotationDeg:op.place?.rotationDeg};})};
    return {name,args:JSON.stringify(args).slice(0,800)};
  };
  return messages.map(message=>{
    if(message.role==='assistant')return {role:'assistant',text:typeof message.content==='string'?message.content.slice(0,1000):'',calls:(message.tool_calls||[]).map(compactCall)};
    if(message.role==='tool'){
      try{const receipt=JSON.parse(message.content);return {role:'tool',ok:receipt.ok,code:receipt.code,detail:String(receipt.detail||'').slice(0,500)};}catch{return {role:'tool',detail:String(message.content).slice(0,300)};}
    }
    if(message.role==='user'&&typeof message.content==='string')return {role:'user',text:message.content.slice(0,500)};
    return null;
  }).filter(Boolean);
}

export function fallbackCreativeMemory(previousSummary,history,state={}){
  // The visible Scene and structured plan are supplied separately. Preserve
  // creative intent and rejected approaches if a summary model times out or
  // returns an unusable answer, instead of repeatedly paying for the same
  // failed compaction and silently dropping older turns.
  const remarks=history.filter(item=>item.role==='assistant'&&item.text?.trim()).map(item=>item.text.trim().slice(0,300)).slice(-5);
  const rejected=history.filter(item=>item.role==='tool'&&item.ok===false).map(item=>item.detail?.slice(0,180)).filter(Boolean).slice(-3);
  return JSON.stringify({intent:state.plan?.intent,composition:state.plan?.composition,
    decisions:(state.decisions||[]).slice(-5),recentRemarks:remarks,rejectedAttempts:rejected,
    previous:previousSummary?String(previousSummary).slice(-700):undefined}).slice(0,2400);
}

export function iterationAdvice(messages){
  const edits=messages.filter(m=>m.role==='assistant').flatMap(m=>(m.tool_calls||[]).filter(c=>c.function?.name==='creation_apply').map(c=>{try{return JSON.parse(c.function.arguments).operations||[];}catch{return [];}})).slice(-4);
  const counts=new Map();for(const batch of edits)for(const target of new Set(batch.map(o=>o.target).filter(Boolean)))counts.set(target,(counts.get(target)||0)+1);
  const repeated=[...counts].filter(([,n])=>n>=3).map(([id])=>id);
  return repeated.length?'近期连续多次修改同一批对象（'+repeated.join('、')+'）。这通常是布局方向没有定下来：先缩小看整页，决定保留这组关系、把冲突素材移到 tray，或整体重排一个素材簇；若已没有明确影响阅读或完成度的问题，就交付。不要再把同一批对象逐件来回移动。':'';
}

export function failureGuidance(name,args,error){
  if(name==='creation_help')return {available:creationHelp()};
  if(name==='creation_finish'&&/存在未解决的问题/.test(error.message||''))return {hint:'review.issues 只列必须修好才能交付的画面缺陷。若这些只是可选的优化意见，移入 observations 并在当前画面无严重问题时以 issues:[] 再次提交；若确有缺陷，先合批修改并看新预览。'};
  if(name==='creation_finish'&&/独立画面审查发现/.test(error.message||''))return {hint:'这是对刚才画面的独立审查。针对列出的遮挡、裁字或越界做一次有针对性的合批修复；下一张自动预览若已解决，应重新调用 creation_finish 获取当前画面的新审查。不要一直追着旧画面的提示微调。可用 creation_inspect 查看图层树和实际坐标，用 layer.stack、layout.nudge 或 layout.alignEdge 修正。'};
  if(name!=='creation_apply')return undefined;
  const match=(error.path||error.message||'').match(/operations(?:\/|\[)(\d+)/),op=args?.operations?.[Number(match?.[1])]?.op;
  const operation=args?.operations?.[Number(match?.[1])];
  if(op==='layer.update'&&operation?.place?.rotationDeg!==undefined&&!operation.place.at&&!operation.place.referenceAnchor)return {hint:'只改角度可用 layout.nudge，rotationDeg 表示相对当前角度的增量；若用 layer.update.place 设置绝对朝向，需同时提供 reference、at、unit，at 是对象中心在该参考框中的位置。整批编辑未生效，修正后重试。'};
  if(op==='text.reflow')return {hint:'text.reflow 只用于 text.lettering 逐字标题组，且不接受 size 或 place。普通文字修改内容、位置、尺寸、样式请用 layer.update。整批编辑未生效，修正后重试。'};
  if(op==='graphic.add'&&operation?.geometry?.kind==='stroke')return {hint:'笔迹格式为 geometry:{kind:"stroke",unit:"mm",points:[{x:0,y:0,pressure:0.5},{x:12,y:1,pressure:0.5}]}。points 是对象数组，unit 放在 geometry 内；笔迹不支持 style.strokeDash，虚线请用 path 或基础图形。整批编辑未生效，修正后重试。'};
  if(op==='graphic.add'&&/geometry\/points/.test(error.path||error.message||'')&&args?.operations?.[Number(match?.[1])]?.geometry?.kind==='star')
    return {hint:'星角数量不写在 geometry.points。改为 geometry:{kind:"star",options:{points:5}}；若画手写线条才用 kind:"stroke" 和 points:[{x,y,pressure}]。整批编辑未生效，请修正后重试。'};
  return op&&creationCommandRegistry[op]?{operation:creationHelp({topics:[op]}),fieldDefinitions:{Color:creationCommonDefinitions.Color,Letters:creationCommonDefinitions.Letters}}:undefined;
}
