import {compactCanvasGuide} from './canvas-interface.mjs';
import {creativePhaseLabels} from './phases.mjs';
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
    const ids=document.source.textMode==='none'?['graphic-loop','graphic-route']:/丰富|层叠|拼贴/.test(text)?['title-art','graphic-route']:
      ['title-art','graphic-loop'];
    const methods=new Map(techniqueCatalog.methods.map(method=>[method.id,method]));
    return [...new Set(ids)].map(id=>methods.get(id)).filter(Boolean).map(({id,title,when,skill})=>({id,title,when,skill,readWith:{name:skill,level:'detail',methodId:id}}));
  }
  const ids=/丰富|层叠|拼贴/.test(text)?['paper-peek','accent-materials','graphic-route','accent-spark','title-art']:
    /极简|留白|清新|淡雅/.test(text)?['paper-peek','graphic-loop','title-art']:
    /杂志|照片|旅行/.test(text)?['photo-film','paper-peek','graphic-route']:
    ['paper-peek','accent-materials','title-art'];
  const methods=new Map(techniqueCatalog.methods.map(method=>[method.id,method]));
  const candidates=[...ids];
  if(document.source.textMode!=='none')candidates.splice(Math.min(2,candidates.length),0,'record-on-material');
  return [...new Set(candidates)].map(id=>methods.get(id)).filter(method=>method&&(document.source.textMode!=='none'||!['journal-writing','journal-lettering'].includes(method.skill))).map(({id,title,when,skill})=>({id,title,when,skill,readWith:{name:skill,level:'detail',methodId:id}}));
}

export function compactInitialToolGuide(){return compactCanvasGuide();}

export function materialBrief(document){
  const required=new Set(document.source.requiredAssetIDs||[]);
  return document.source.materials.map(m=>{
    const s=document.source.sourceSnapshots.find(s=>s.assetID===m.assetID),a=assetFromSourceSnapshot(s,{frozenRevision:true});
    return {alias:m.alias,title:s.title,kind:s.kind,widthMM:a.physicalWidthMM,heightMM:a.physicalHeightMM,required:required.has(m.assetID),priority:Object.entries(document.source.materialPriority||{}).find(([,ids])=>Array.isArray(ids)&&ids.includes(m.assetID))?.[0],tapeAxis:s.tapeAxis};
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
    hint:'承托层可以是已有的纹样纸、可写卡、纸片或数字纸形；先试摆真实素材与背景上的字群，再为图文共同承托、配色和露边增加数字纸；纸不必写字，文字不必另垫纸。'};
}

// Automatic snapshots are ephemeral request tails. The checkpoint retains
// their original images for audit/review, but model history keeps decisions,
// reasoning and tool receipts rather than obsolete copies of the workspace.
export function isCreativeSnapshot(message){
  if(message.role!=='user')return false;
  if(typeof message.content==='string')return /^(当前创作状态|压缩后的完整图层基线)/.test(message.content);
  return Array.isArray(message.content)&&message.content.some(p=>p.type==='text'&&p.text?.includes('当前真实画面：'));
}

export function modelContext(messages,state={}){
  if(messages.length<=2)return [...messages];
  let start=Math.max(2,Number.isInteger(state.compactedUntil)?state.compactedUntil:2);
  while(start>2&&messages[start]?.role==='tool')start--;
  const latestPreview=messages.findLast(m=>Array.isArray(m.content)&&isCreativeSnapshot(m));
  const workspaceParts=new Map();
  for(const message of messages.slice(2)){
    if(message.role!=='user'||!Array.isArray(message.content))continue;
    for(let i=0;i<message.content.length-1;i++){
      const p=message.content[i],id=p.type==='text'&&/^工作空间 ([^；]+)；/.exec(p.text||'')?.[1];
      if(!id||id==='source'||message.content[i+1]?.type!=='image_url')continue;
      const signature=state.visualState?.[id]?.signature;
      if(signature&&!p.text.includes('画面版本：'+signature))continue;
      if(state.spaces&&!state.spaces.some(space=>space.id===id))continue;
      workspaceParts.set(id,message.content.slice(i,i+2));
    }
  }
  const stable=message=>{
    if(isCreativeSnapshot(message))return null;
    if(message.role!=='user'||!Array.isArray(message.content))return message;
    const parts=[];
    for(let i=0;i<message.content.length;i++){
      const p=message.content[i];
      if(p.type==='text'&&/^工作空间 (?!source；)[^；]+；/.test(p.text||'')&&message.content[i+1]?.type==='image_url'){i++;continue;}
      parts.push(p);
    }
    return parts.length===message.content.length?message:parts.length?{...message,content:parts}:null;
  };
  const recent=messages.slice(start).map(stable).filter(Boolean);
  const firstAssistant=messages.findIndex(m=>m.role==='assistant');
  const opening=messages.slice(2,firstAssistant<0?messages.length:firstAssistant).filter(m=>m.role==='user'&&typeof m.content==='string'&&!isCreativeSnapshot(m)&&!recent.includes(m));
  const prefix=[...messages.slice(0,2),...opening,...(state.creativeMemory?[{role:'user',content:'已压缩的早期创作记忆：'+state.creativeMemory}]:[])];
  // Retain one studied example across the rare history compaction boundary.
  let tutorial;
  for(const m of messages)if(m.role==='user'&&Array.isArray(m.content))for(let i=0;i<m.content.length-1;i++){
    if(m.content[i].type==='text'&&m.content[i].text?.startsWith('教程示意（')&&m.content[i+1].type==='image_url')tutorial=m.content.slice(i,i+2);
  }
  if(tutorial&&!recent.some(m=>Array.isArray(m.content)&&m.content.some(p=>p.image_url?.url===tutorial[1].image_url?.url)))recent.push({role:'user',content:tutorial});
  if(!state.document)return [...prefix,...recent,...(latestPreview?[latestPreview]:[])];
  const images=[...workspaceParts.values()].flat();
  const snapshotImages=images.length?images:(latestPreview?.content.filter(p=>p.type==='image_url')||[]);
  const visual=state.preview||latestPreview?{role:'user',content:[{type:'text',text:'当前真实画面：'+JSON.stringify(state.preview||{})},...snapshotImages]}:null;
  const scene=inspectCreationDocument(state.document);
  const elapsedSeconds=Number.isFinite(state.contextNow)&&Number.isFinite(state.startedAt)?Math.max(0,Math.floor((state.contextNow-state.startedAt)/1000)):null;
  const summary={phase:state.phase||'direction',scene,preview:state.preview||null,
    ...(elapsedSeconds===null?{}:{pacing:{elapsedSeconds,targetRemainingSeconds:Math.max(0,360-elapsedSeconds),focus:elapsedSeconds>=300?'接近六分钟目标：集中修正可读性、遮挡与缺失的纸边连接，查看新图后交付；不追加可选微调，未解决缺陷仍如实保留。':'合批推进，预留最后约一分钟检查；当前画面与完整图层足以判断时直接编辑，无需反复查看同一资料。'}}),
    workflow:{stage:state.phaseDeclared?creativePhaseLabels[state.phase]:'由模型自行判断',focus:'根据最新画面决定本轮工作；固定说明中的五类方法可交错使用，阶段记录不代表验收或限制。'},
    plan:state.plan||null,loadedSkills:(state.loadedSkills||[]).map(({name})=>name),reviewPending:state.reviewPending??Boolean(state.preview&&!state.review),
    observation:state.observationFeedback||null,notes:state.observationNotes||null,
    taskReminder:{styles:state.document.source.styles,processing:state.document.source.processing,textMode:state.document.source.textMode,contentPolicy:state.document.source.contentPolicy},
    inspection:'这是当前完整图层清单和层序，不是增量；旧画面快照已移除。所有位置以此版本为准；完整原生字段可按需 creation_inspect(full=true)。'};
  return [...prefix,...recent,...(visual?[visual]:[]),{role:'user',content:'当前创作状态（由检查点生成）：'+JSON.stringify(summary)}];
}

export function creativeCompactionCandidate(messages,state={}){
  // Safety valve only. Control newly appended observations rather than
  // repeatedly rebuilding already cached history at a character/image count.
  const from=Number.isInteger(state.compactedUntil)?state.compactedUntil:2;
  const last=state.usage?.at(-1);
  const capacity=state.contextWindowTokens||1000000;
  const estimated=last?((last.prompt_tokens||0)+(last.completion_tokens||0)):
    messages.slice(from).reduce((n,m)=>n+(m.reasoning_content||'').length+JSON.stringify(m.tool_calls||[]).length+
      (typeof m.content==='string'?m.content:(m.content||[]).filter(p=>p.type==='text').map(p=>p.text||'').join('')).length,0);
  // Reserve 40% for the next response and newly appended multimodal input.
  if(estimated<capacity*0.6)return null;
  const assistants=messages.flatMap((message,index)=>message.role==='assistant'&&index>=from?[index]:[]);
  const keep=2,minimumOlder=2;
  if(assistants.length<keep+minimumOlder)return null;
  const cutoff=assistants.at(-keep);
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
  const counts=new Map();for(const batch of edits)for(const target of new Set((Array.isArray(batch)?batch:[]).map(o=>o&&typeof o==='object'?o.target:null).filter(Boolean)))counts.set(target,(counts.get(target)||0)+1);
  const repeated=[...counts].filter(([,n])=>n>=3).map(([id])=>id);
  return repeated.length?'近期连续多次修改同一批对象（'+repeated.join('、')+'）。这通常是布局方向没有定下来：先缩小看整页，决定保留这组关系、把冲突素材移到 tray，或整体重排一个素材簇；若已没有明确影响阅读或完成度的问题，就交付。不要再把同一批对象逐件来回移动。':'';
}

export function failureGuidance(name,args,error,document){
  const parameterError=String(error.path||'')+' '+String(error.message||'');
  if(/protocolVersion/.test(parameterError))return {hint:'protocolVersion 可省略，由运行时固定填写数字 2；若显式填写只能是数字 2。该调用未生效；按 Schema 修正后重试。'};
  if(/baseSceneRevision/.test(parameterError))return {hint:'baseSceneRevision 可填 current，绑定你本轮看到的 Scene；也可逐字复制本条失败回执的 sceneRevision（sha256: 加 64 位十六进制字符），不可截短或使用 PNG 哈希。该调用未生效；不要仅为获取同一版本再调用 inspect。'};
  if(name==='creation_title'&&/已经存在/.test(error.message||''))return {hint:'creation_title 只创建新标题；修改已有标题请 creation_inspect 查看组内子文字 id，再用 creation_apply 的 layer.update 修改 content、size、place 或 style；移动整组用标题组 id。失败调用没有生效，不要重复创建同 id。'};
  if(name==='creation_help')return {available:creationHelp()};
  if(name==='creation_finish'&&/存在未解决的问题/.test(error.message||''))return {hint:'review.issues 只列必须修好才能交付的画面缺陷。若这些只是可选的优化意见，移入 observations 并在当前画面无严重问题时以 issues:[] 再次提交；若确有缺陷，先合批修改并看新预览。'};
  if(name==='creation_finish'&&/独立画面审查发现/.test(error.message||''))return {hint:'这是对刚才画面的独立审查。针对列出的遮挡、裁字或越界做一次有针对性的合批修复；下一张自动预览若已解决，应重新调用 creation_finish 获取当前画面的新审查。不要一直追着旧画面的提示微调。可用 creation_inspect 查看图层树和实际坐标，用 layer.stack、layout.nudge 或 layout.alignEdge 修正。'};
  if(name!=='creation_apply')return undefined;
  const match=(error.path||error.message||'').match(/operations(?:\/|\[)(\d+)/),op=args?.operations?.[Number(match?.[1])]?.op;
  const operation=args?.operations?.[Number(match?.[1])];
  if(['creation_paper','creation_title','creation_recipe'].includes(op))return {hint:op+' 是独立工具，不是 creation_apply.operations 的操作。请以独立 tool call 调用；可与 creation_apply 同轮使用。该编辑批次未执行。'};
  if(op==='layer.update'&&document){
    const scene=inspectCreationDocument(document),node=scene.layers.find(n=>n.id===operation.target||n.alias===operation.target);
    if(node?.type==='group'&&(operation.style?.fontSizePt!==undefined||operation.size)){
      const ids=new Set([node.id]);for(const layer of scene.layers)if(ids.has(layer.parent))ids.add(layer.id);
      return {hint:'目标是组合。整组移动/旋转用组 id 的 place；字号、文字宽度和内容用下面的子文字 id 分别 layer.update。不要用 size 缩放整组；本批次未执行。',textChildren:scene.layers.filter(n=>ids.has(n.id)&&n.type==='text').map(({id,content,fontSizePt,world})=>({id,content,fontSizePt,widthMm:world?.sizeMm?.[0]}))};
    }
    if(node?.type==='material'&&operation.size)return {hint:'实体素材不能缩放。用 material.cut / material.tear 裁成所需尺寸，或只改 place/order；本批次未执行。'};
  }
  if(/penStyle/.test(parameterError))return {hint:'style.penStyle 仅支持 pen、ballpoint、brush、marker；一般笔迹可省略使用默认值。本批次未执行。'};
  if(op==='text.reflow')return {hint:'text.reflow 只用于 text.lettering 逐字标题组，且不接受 size 或 place。普通文字修改内容、位置、尺寸、样式请用 layer.update。整批编辑未生效，修正后重试。'};
  if(op==='graphic.add'&&operation?.geometry?.kind==='stroke')return {hint:'笔迹格式为 geometry:{kind:"stroke",unit:"mm",points:[{x:0,y:0,pressure:0.5},{x:12,y:1,pressure:0.5}]}。points 是对象数组，unit 放在 geometry 内；笔迹不支持 style.strokeDash，虚线请用 path 或基础图形。整批编辑未生效，修正后重试。'};
  if(op==='graphic.add'&&/geometry\/points/.test(error.path||error.message||'')&&args?.operations?.[Number(match?.[1])]?.geometry?.kind==='star')
    return {hint:'星角数量不写在 geometry.points。改为 geometry:{kind:"star",options:{points:5}}；若画手写线条才用 kind:"stroke" 和 points:[{x,y,pressure}]。整批编辑未生效，请修正后重试。'};
  return op&&creationCommandRegistry[op]?{operation:creationHelp({topics:[op]}),fieldDefinitions:{Color:creationCommonDefinitions.Color,Letters:creationCommonDefinitions.Letters}}:undefined;
}
