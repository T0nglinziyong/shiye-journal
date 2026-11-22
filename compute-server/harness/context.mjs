import {creationHelp,inspectCreationDocument} from '../../src/creation-inspection.js';
import {creationCommandRegistry} from '../../src/creation-v2-contract.js';
import {creationCommonDefinitions} from '../../src/creation-command-spec.js';
import {validateWebScene} from '../../src/web-scene-workbench.js';
import {assetFromSourceSnapshot} from '../../src/material-anatomy.js';
import {techniqueCatalog} from '../../src/creation-library/techniques.js';

export function recommendCreationSkills(skills,document,brief={}){
  if(document.source.materials?.length===0){
    const catalog=new Map(skills.catalog().map(skill=>[skill.name,skill]));
    const names=[...(document.source.textMode==='none'?[]:['journal-writing','journal-lettering','journal-text-layout']),'journal-graphics','pattern-and-doodle','journal-composition','journal-color'];
    return names.filter(name=>catalog.has(name)).map(name=>catalog.get(name));
  }
  const names=['journal-composition','journal-color','paper-layering','journal-accents'];
  if(document.source.textMode!=='none')names.push('journal-writing','journal-lettering','journal-text-layout');
  const styles=new Set([...(brief.styles||[]),...(document.source.styles||[]),brief.style]);
  const routes={'童趣可爱':'playful-journal','复古旧物':'vintage-journal','清新淡雅':'quiet-photo-journal','极简留白':'quiet-photo-journal','疏朗留白':'quiet-photo-journal','丰富层叠':'layered-journal','美式拼贴':'magazine-journal','杂志排版':'magazine-journal','日系文具':'functional-journal'};
  for(const [style,name] of Object.entries(routes))if(styles.has(style))names.push(name);
  const catalog=new Map(skills.catalog().map(skill=>[skill.name,skill]));
  return [...new Set(names)].filter(name=>catalog.has(name)).map(name=>catalog.get(name));
}

export function shortlistCreationMethods(document,brief={}){
  const style=[...(brief.styles||[]),...(document.source.styles||[]),brief.style].filter(Boolean).join(' ');
  const materialCount=document.source.materials.length;
  const text=style+' '+String(brief.intent||'');
  if(!materialCount){
    const ids=document.source.textMode==='none'?['graphic-wave','graphic-corner','graphic-star']:/丰富|层叠|拼贴/.test(text)?['title-stack','title-phrases','title-stagger','title-highlight','graphic-wave']:
      ['title-caption','title-underline','title-phrases','graphic-wave','graphic-corner'];
    const methods=new Map(techniqueCatalog.methods.map(method=>[method.id,method]));
    return ids.map(id=>methods.get(id)).filter(Boolean).map(({id,title,when,skill})=>({id,title,when,skill,readWith:{name:skill,level:'detail',methodId:id}}));
  }
  const ids=/丰富|层叠|拼贴/.test(text)?['paper-color-card','layered-center','layered-diagonal','paper-peek','accent-materials','graphic-route','accent-spark','accent-rings','title-tape']:
    /极简|留白|清新|淡雅/.test(text)?['paper-color-card','quiet-pair','quiet-note','paper-peek','graphic-loop','title-caption','title-tape']:
    /杂志|照片|旅行/.test(text)?['magazine-offset','photo-stagger','photo-caption','paper-underlay','graphic-route']:
    ['paper-color-card','composition-triangle','composition-s','paper-underlay','accent-materials','title-label'];
  const chosen=materialCount<3?ids.filter(id=>!['composition-s','layered-center','layered-diagonal','photo-stagger'].includes(id)):ids;
  const hasSourcePaper=document.source.sourceSnapshots?.some(snapshot=>snapshot.kind==='paper');
  const methods=new Map(techniqueCatalog.methods.map(method=>[method.id,method]));
  const candidates=chosen.filter(id=>id!=='paper-color-card'||!hasSourcePaper);
  if(hasSourcePaper&&document.source.textMode!=='none')candidates.splice(Math.min(2,candidates.length),0,'record-on-material');
  return candidates.map(id=>methods.get(id)).filter(Boolean).map(({id,title,when,skill})=>({id,title,when,skill,readWith:{name:skill,level:'detail',methodId:id}}));
}

export function initialToolGuide(document){
  const topics=[...(document.source.materials.length?['material.add']:[]),'layer.update','graphic.add','place','size'];
  if(document.source.textMode!=='none')topics.push('text.add');
  const tapeAliases=document.source.materials.filter(m=>document.source.sourceSnapshots.find(s=>s.assetID===m.assetID)?.kind==='tape').map(m=>m.alias);
  return {topics:creationHelp().topics,common:creationHelp({topics}),tapeAliases,fieldDefinitions:{Color:creationCommonDefinitions.Color,Letters:creationCommonDefinitions.Letters},
    notes:['常用操作、全局素材编号图与尺寸已加载；复杂参数先用 creation_help 查询精确命令名，如 text.add（不是 text）。','place.at 必须是 [x,y] 数组；相对定位使用 reference、referenceAnchor、anchor 和 offset。','material.tape 只能使用 tapeAliases 中的来源；列表为空时本次没有胶带。普通长条纸、文字剪片用 material.add 或合法裁切。','创建用 id，修改已有对象用 target；不要在 layer.update 中传 id。','颜色用六位 HEX；文字用 style.color，图形和笔迹用 style.stroke 或 style.fill，不能对 ink 使用 style.color。笔迹使用 geometry.unit="mm" 与 points=[{x,y,pressure}]。']};
}

export function compactInitialToolGuide(document){
  const guide=initialToolGuide(document);
  return {topics:guide.topics,common:guide.common.descriptions.map(({name,summary,required,examples,notes})=>({name,summary,required,example:examples?.[0],notes})),tapeAliases:guide.tapeAliases,fieldDefinitions:guide.fieldDefinitions,notes:guide.notes};
}

export function materialBrief(document){
  const required=new Set(document.source.requiredAssetIDs||[]);
  return document.source.materials.map(m=>{
    const s=document.source.sourceSnapshots.find(s=>s.assetID===m.assetID),a=assetFromSourceSnapshot(s,{frozenRevision:true});
    return {alias:m.alias,title:s.title,description:String(s.description||'').slice(0,160)||undefined,kind:s.kind,role:s.role,journalRoles:s.journalRoles,tags:s.tags,widthMM:a.physicalWidthMM,heightMM:a.physicalHeightMM,required:required.has(m.assetID),priority:Object.entries(document.source.materialPriority||{}).find(([,ids])=>Array.isArray(ids)&&ids.includes(m.assetID))?.[0],tapeAxis:s.tapeAxis};
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
  let start=Math.max(Number.isInteger(state.compactedUntil)?state.compactedUntil:2,turns.at(-4)??turns.at(0)??2);
  while(start>2&&messages[start]?.role==='tool')start--;
  const isPreview=message=>message.role==='user'&&Array.isArray(message.content)&&(/^(当前真实画面：|本轮最先核对的画面问题|独立构图审查发现必须先修复|独立文字与画面审查发现必须先修复)/.test(message.content[0]?.text||''));
  const tail=messages.slice(start),lastPreview=tail.findLastIndex(isPreview),lastAssistant=tail.findLastIndex(message=>message.role==='assistant');
  const recent=tail.filter((message,i)=>{
    if(isPreview(message))return i===lastPreview&&i>lastAssistant;
    if(message.role==='user'&&Array.isArray(message.content)&&message.content.some(part=>part.type==='image_url'))return i>lastAssistant;
    return true;
  });
  const recentToolNames=new Map(recent.flatMap(message=>message.role==='assistant'?(message.tool_calls||[]).map(call=>[call.id,call.function?.name]):[]));
  const recentAssistants=recent.flatMap((message,i)=>message.role==='assistant'?[i]:[]);
  const compactedRecent=recent.map((message,i)=>{
    if(message.role==='tool'&&recentToolNames.get(message.tool_call_id)==='creation_help'&&i<(recentAssistants.at(-2)??-1))return {...message,content:'{"ok":true,"detail":"参数已读取；需要再次查看时调用 creation_help。"}'};
    if(message.role==='tool'&&['creation_apply','creation_recipe'].includes(recentToolNames.get(message.tool_call_id))&&i<(recentAssistants.at(-2)??-1)){
      try{const receipt=JSON.parse(message.content);if(receipt.ok)return {...message,content:'{"ok":true,"detail":"较早的编辑已生效；对象和最新版本见当前 Scene。"}'};}catch{/* Keep the original response. */}
    }
    return message;
  });
  if(!state.document)return [messages[0],index,...compactedRecent];
  const names=new Map(messages.slice(2,start).flatMap(message=>message.role==='assistant'?(message.tool_calls||[]).map(call=>[call.id,call.function?.name]):[]));
  const references=messages.slice(2,start).filter(message=>message.role==='tool'&&['read_skill','read_case'].includes(names.get(message.tool_call_id))).flatMap(message=>{
    try{const receipt=JSON.parse(message.content);return receipt.ok?[{tool:names.get(message.tool_call_id),detail:JSON.stringify(receipt.data).slice(0,1200)}]:[];}catch{return [];}
  }).slice(-2);
  const inspected=inspectCreationDocument(state.document);
  // The newest automatic observation already carries the same Scene. Keep only
  // its revision in the state summary so a long page is not billed twice.
  const previewVisible=lastPreview>=0&&lastPreview>lastAssistant;
  const scene=previewVisible?{sceneRevision:inspected.sceneRevision}:{sceneRevision:inspected.sceneRevision,page:inspected.page,layers:inspected.layers.filter(layer=>state.phase!=='review'||layer.surface==='page').map(({id,type,surface,asset,content,world,hidden,parent})=>({id,type,surface,asset,content:typeof content==='string'?content.slice(0,120):undefined,world,hidden,parent}))};
  const summary={creativeMemory:state.creativeMemory||null,phase:state.phase||'direction',phaseReviews:(state.phaseReviews||[]).map(({from,to,observations,adjustments})=>({from,to,observations,adjustments})),plan:state.plan,decisions:(state.decisions||[]).slice(-6),spaces:state.spaces,visualState:state.visualState||null,scene,preview:state.preview?{pngHash:state.preview.pngHash,sceneRevision:state.preview.sceneRevision,artifact:state.preview.artifact}:null,loadedSkills:state.loadedSkills,recommendedMethods:(state.recommendedMethods||[]).map(({id,skill,title})=>({id,skill,title})),skillReferences:state.phase==='review'?[]:(state.skillReferences||[]),references:state.phase==='review'?[]:references,lastResults:(state.results||[]).slice(-6).map(({name,ok,code,detail})=>({name,ok,code,detail})),drafts:state.phase==='review'?[]:(state.drafts||[]).map(({id,goal,pngHash,baseSceneRevision})=>({id,goal,pngHash,baseSceneRevision})),undoAvailable:(state.undoStack||[]).length,reviewPending:state.reviewPending??Boolean(state.preview&&!state.review),review:state.review||null};
  return [messages[0],index,{role:'user',content:'当前创作状态（由检查点生成，早期对话已压缩）：'+JSON.stringify(summary)},...compactedRecent];
}

export function creativeCompactionCandidate(messages,state={}){
  const from=Number.isInteger(state.compactedUntil)?state.compactedUntil:2;
  let cutoff=(state.phaseReviews||[]).at(-1)?.messageIndex;
  if(!Number.isInteger(cutoff)||cutoff<=from){
    // A soft creative loop may never emit creation_phase. Compact completed
    // turns on cadence while retaining the latest four assistant/tool cycles.
    const assistants=messages.flatMap((message,index)=>message.role==='assistant'?[index]:[]);
    cutoff=assistants.at(-4);
  }
  while(cutoff>2&&messages[cutoff]?.role==='tool')cutoff--;
  if(!Number.isInteger(cutoff)||cutoff<=from)return null;
  const older=messages.slice(from,cutoff);
  if(older.filter(message=>message.role==='assistant').length<4)return null;
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

export function iterationAdvice(messages){
  const edits=messages.filter(m=>m.role==='assistant').flatMap(m=>(m.tool_calls||[]).filter(c=>c.function?.name==='creation_apply').map(c=>{try{return JSON.parse(c.function.arguments).operations||[];}catch{return [];}})).slice(-4);
  const counts=new Map();for(const batch of edits)for(const target of new Set(batch.map(o=>o.target).filter(Boolean)))counts.set(target,(counts.get(target)||0)+1);
  const repeated=[...counts].filter(([,n])=>n>=3).map(([id])=>id);
  return repeated.length?'近期反复修改 '+repeated.join('、')+'。先看最新图确认具体未解决问题，一次合批处理相关位置、字号和颜色；已可读且没有新问题时停止反复微调。':'';
}

export function failureGuidance(name,args,error){
  if(name==='creation_help')return {available:creationHelp()};
  if(name!=='creation_apply')return undefined;
  const match=(error.path||error.message||'').match(/operations(?:\/|\[)(\d+)/),op=args?.operations?.[Number(match?.[1])]?.op;
  return op&&creationCommandRegistry[op]?{operation:creationHelp({topics:[op]}),fieldDefinitions:{Color:creationCommonDefinitions.Color,Letters:creationCommonDefinitions.Letters}}:undefined;
}
