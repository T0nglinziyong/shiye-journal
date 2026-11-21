import {creationHelp,inspectCreationDocument} from '../../src/creation-inspection.js';
import {creationCommandRegistry} from '../../src/creation-v2-contract.js';
import {creationCommonDefinitions} from '../../src/creation-command-spec.js';
import {validateWebScene} from '../../src/web-scene-workbench.js';
import {assetFromSourceSnapshot} from '../../src/material-anatomy.js';

export function preloadCreationSkills(skills,document,brief={}){
  const names=['journal-composition','paper-layering','journal-accents'];
  if(document.source.textMode!=='none')names.push('journal-lettering');
  const styles=new Set([...(brief.styles||[]),...(document.source.styles||[]),brief.style]);
  const routes={'童趣可爱':'playful-journal','复古旧物':'vintage-journal','清新淡雅':'quiet-photo-journal','极简留白':'quiet-photo-journal','疏朗留白':'quiet-photo-journal','丰富层叠':'layered-journal','美式拼贴':'magazine-journal','杂志排版':'magazine-journal','日系文具':'functional-journal'};
  for(const [style,name] of Object.entries(routes))if(styles.has(style))names.push(name);
  const available=new Set(skills.catalog().map(s=>s.name));
  return [...new Set(names)].filter(name=>available.has(name)).map(name=>skills.read(name));
}

export function initialToolGuide(document){
  const topics=['material.add','layer.update','page.update','graphic.add','place','size','order','geometry','shapeOptions','region'];
  if(document.source.textMode!=='none')topics.push('text.add','text.lettering');
  const tapeAliases=document.source.materials.filter(m=>document.source.sourceSnapshots.find(s=>s.assetID===m.assetID)?.kind==='tape').map(m=>m.alias);
  return {catalog:creationHelp(),common:creationHelp({topics}),tapeAliases,fieldDefinitions:{Color:creationCommonDefinitions.Color,Letters:creationCommonDefinitions.Letters},
    notes:['常用操作、全局素材编号图与尺寸已加载；只有未提供的参数才查询帮助。','material.tape 只能使用 tapeAliases 中的来源；列表为空时本次没有胶带。普通长条纸、文字剪片用 material.add 或合法裁切，不能当胶带延展。','创建用 id，修改已有对象用 target；不要在 layer.update 中传 id。','letters.index 从 0 开始；所有颜色（含 shadow.color）用六位 HEX。','geometry.kind=stroke 必须同时提供 geometry.unit="mm" 与 points=[{x,y,pressure}]。style 使用 stroke、strokeWidthMm、penStyle；透明度用 opacity，不要带 fill（即使是 null）、fillOpacity、strokeOpacity。','penStyle 仅用于笔迹，sketch 图形使用 stroke 和 strokeWidthMm。']};
}

export function materialBrief(document){
  const required=new Set(document.source.requiredAssetIDs||[]);
  return document.source.materials.map(m=>{
    const s=document.source.sourceSnapshots.find(s=>s.assetID===m.assetID),a=assetFromSourceSnapshot(s,{frozenRevision:true});
    return {alias:m.alias,title:s.title,kind:s.kind,role:s.role,tags:s.tags,widthMM:a.physicalWidthMM,heightMM:a.physicalHeightMM,required:required.has(m.assetID),priority:Object.entries(document.source.materialPriority||{}).find(([,ids])=>Array.isArray(ids)&&ids.includes(m.assetID))?.[0],tapeAxis:s.tapeAxis};
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
  return {required,finalValidation};
}

export function modelContext(messages,state={}){
  if(messages.length<=2)return messages;
  const first=messages[1],parts=Array.isArray(first?.content)?first.content:null;
  const index=parts?{...first,content:parts.filter((part,i)=>part.type!=='image_url'||i===parts.findIndex(p=>p.type==='image_url'))}:first;
  const turns=messages.flatMap((message,i)=>message.role==='assistant'?[i]:[]),start=Number.isInteger(state.compactedUntil)?state.compactedUntil:turns.at(-2)??turns.at(0)??2;
  const isPreview=message=>message.role==='user'&&Array.isArray(message.content)&&message.content[0]?.text?.startsWith('当前真实画面：');
  const tail=messages.slice(start),lastPreview=tail.findLastIndex(isPreview);
  const recent=tail.filter((message,i)=>!isPreview(message)||i===lastPreview);
  if(!state.document)return [messages[0],index,...recent];
  const names=new Map(messages.slice(2,start).flatMap(message=>message.role==='assistant'?(message.tool_calls||[]).map(call=>[call.id,call.function?.name]):[]));
  const references=messages.slice(2,start).filter(message=>message.role==='tool'&&['read_skill','read_template','creation_help'].includes(names.get(message.tool_call_id))).flatMap(message=>{
    try{const receipt=JSON.parse(message.content);return receipt.ok?[{tool:names.get(message.tool_call_id),detail:JSON.stringify(receipt.data).slice(0,3500)}]:[];}catch{return [];}
  }).slice(-3);
  const summary={creativeMemory:state.creativeMemory||null,plan:state.plan,decisions:(state.decisions||[]).slice(-8),spaces:state.spaces,visualState:state.visualState||null,scene:inspectCreationDocument(state.document),loadedSkills:state.loadedSkills,references,lastResults:(state.results||[]).map(({name,ok,code,detail})=>({name,ok,code,detail})),undoAvailable:(state.undoStack||[]).length,review:state.review?.approved?'approved':null};
  return [messages[0],index,{role:'user',content:'当前创作状态（由检查点生成，早期对话已压缩）：'+JSON.stringify(summary)},...recent];
}

export function creativeCompactionCandidate(messages,state={}){
  const from=Number.isInteger(state.compactedUntil)?state.compactedUntil:2;
  const turns=messages.flatMap((message,i)=>message.role==='assistant'?[i]:[]);
  const cutoff=turns.at(-2);
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
