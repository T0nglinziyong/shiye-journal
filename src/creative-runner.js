import {reconstructionInstruction} from './image-workflow.js';
import {reviewFinalCreativeScene} from './creative-visual-review.js';
import {multimodalCraftGuide,visualMaterialIDs} from './craft-vision.js';
import {craftSceneHash} from './craft-fingerprint.js';
import {attachSceneV2} from './scene-v2.js';
import {describeCraftSources} from './craft-task.js';
import {applyToolCalls} from './creative.js';
export {agentTools} from './creative-contract.js';
import {creativeProtocol} from './creative-delivery.js';
import {reviewCreativeDraft} from './creative-quality.js';
import {creativeTypographyGuide} from './creative-typography.js';
import {requestChat} from './chat-transport.js';
import {visualStyleBrief} from './creative-style-brief.js';
import {creativeLayeringGuide} from './creative-layering-guide.js';
import {creativeContentBrief} from './creative-content-brief.js';
import {creativePageBrief} from './creative-page-brief.js';
import {structureReferenceGuide,purposeMethod} from './creative-design-guide.js';
import {sceneFingerprint} from './offline-result-review.js';
import {applyScenePatch,patchSceneHash} from './scene-patch.js';
import {createCreativeBudget} from './ai-budget.js';
import {classifyJournalMaterial} from './journal-case-study.js';

const system='你是拾页手账创作者。只使用素材台中的真实素材；尺寸、来源区域和加工由本地工具判定，不得缩放或复制纸张、照片、贴纸，同一件裁下的非重叠余料可继续使用。胶带视为连续可裁取，但不能拉伸已校准的宽度或图案。文字和数字图形是可编辑图层。素材可先矩形裁片，再用 mask 做不规则、圆角或花边外轮廓；diagonal 用直线斜裁并指定保留侧，window 在素材内部开透明孔，两者可组合。把直线、自由矢量、手写笔与荧光笔拆成可编辑元素；可以使用共享 Scene 的多边形矢量蒙版为实体裁片、图形与文字剪外轮廓或开窗；透明纸、胶带可用 multiply 正片叠底；组只用于同步选中移动，不改变实物尺寸；让文字与素材形成有机关系。根据用途与风格建立主视觉、连续阅读区和细节，避免无意堆在中央、遮住正文、重复空相框或每段机械加白底。判断留白是否服务于主题与阅读：真实素材少时，可用有内容的可编辑文字、线条、底色或图形补充信息与节奏，也可有意识地保留空白；不要为填满面积而添加无关内容。不凭空制造实物。无经历时可以写态度、疑问、愿望或轻松自言自语，不编日期地点经历；按本次内容策略决定。位置默认页面比例，文字参考本页字号与层级建议。加工只能用合同中安全操作，不假装识别未提供的图案，不执行网址、脚本或文件。每轮以实际画布和回执修正，完成前审阅整个页面。';

export function creativeScene(d,aliases={}){
 const map=Object.fromEntries(Object.entries(aliases).map(([k,v])=>[v,k]));
 const norm=(x,axis)=>Number.isFinite(x)?Number((x/d.canvas[axis]).toFixed(5)):null;
 const walk=nodes=>(nodes||[]).filter(n=>!n.isParked&&!n.hidden&&!n.isHidden).map(n=>{
   const style={id:n.id,type:n.type,opacity:n.opacity??1,blendMode:n.blendMode||'normal',
     ...(n.vectorMask?{vectorMask:n.vectorMask}:{})};
   if(n.type==='group')return {...style,name:n.name,children:walk(n.children)};
   if(n.type==='ink')return {...style,stroke:{points:n.points?.length||0,width:n.width,color:n.color,penStyle:n.penStyle},zIndex:n.zIndex};
   const base={...style,x:norm(n.x,'width'),y:norm(n.y,'height'),width:norm(n.width,'width'),height:norm(n.height,'height'),rotation:n.rotation||0,zIndex:n.zIndex??0};
   if(n.type==='material')return {...base,asset:map[n.assetID]||'未授权素材',cropRect:n.cropRect||null,materialMask:n.materialMask||null,sourceUnit:n.materialUnitIndex??0,
     ...(n.manualVisualCopy?{manualVisualCopy:true}:{})};
   if(n.type==='text')return {...base,content:n.content,fontSize:n.fontSize,fontName:n.fontName||null,color:n.color,style:n.style};
   return {...base,kind:n.kind,fill:n.fill,stroke:n.stroke,vectorPaths:n.vectorPaths||null,vectorLayers:n.vectorLayers||null};
 });
 return {version:2,canvas:d.canvas,pageMode:d.pageMode,pageRatio:d.pageRatio,
   pageHeightMM:d.physicalPageHeightMM,paper:{color:d.paperColor,pattern:d.paperPattern},
   layers:walk(d.layers)};
}
const editableSceneState=d=>JSON.stringify([d.canvas,d.paperColor,d.paperPattern,d.paperRuling,d.drawCenterGutter,d.layers]);

export function buildCreativeMessages(o){
 const {draft,assets,aliases,images=[],prompt='',customLayoutPrompt='',textMode='automatic',contentPolicy='original',textPresentation='mixed',userText='',providedFacts='',styles=[draft.style],pagePurposes=['自由创作'],processing,requiredAssetIDs=[],materialPriority={},includeStructureReference=true}=o;
 const effectiveTextMode=contentPolicy==='visual'?'none':textMode;
 const contentBrief=creativeContentBrief({policy:contentPolicy,userText,providedFacts,topic:prompt,purposes:pagePurposes});
 const priority=id=>requiredAssetIDs.includes(id)||materialPriority.required?.includes(id)?'必须使用':materialPriority.available?.includes(id)?'可以使用（仅备选）':'优先使用';
 const list=Object.entries(aliases).flatMap(([label,id])=>{const a=assets.find(x=>x.id===id);return a?[`${label}: ${a.title}，优先级 ${priority(id)}，${a.kind}，${a.role}，图文职责 ${classifyJournalMaterial(a).join('、')}，${a.physicalWidthMM||'未确认'}×${a.physicalHeightMM||'未确认'} mm，取用规则 ${a.kind==='tape'?'可取多个独立段，不得拉伸宽度或伪造无缝图案':'单方案一份源素材，可裁成非重叠片段'}，标签 ${(a.tags||[]).join('、')}`]:[];});
 const policy=effectiveTextMode==='none'?'不生成文字。':effectiveTextMode==='requested'?'仅用户明确要求文字时配文。':'按内容策略与用途创作有表达的图文手帐。';
 const pageBrief=creativePageBrief({styles,purposes:pagePurposes,textMode:effectiveTextMode,contentPolicy,textPresentation,userText,theme:prompt,pageMode:draft.pageMode,materials:assets.filter(a=>Object.values(aliases).includes(a.id))});
 const spreadPreference=draft.pageMode==='spread'?'双页是一张加宽画布，中心 x=0.5 为装订中缝。优先把每件实体素材完整安排在左半页或右半页，尽量不要横跨中缝；这是视觉建议而非强制规则，合理的跨页设计允许保留。':'';
 const reference=includeStructureReference?structureReferenceGuide:'';
 const mode=creativeProtocol(o).instruction;
 const first=[{type:'text',text:`【本次任务】\n纸张：${draft.pageRatio} ${draft.pageMode==='spread'?'双页':'单页'}，物理高${draft.physicalPageHeightMM}mm。\n风格：${styles.map(name=>`${name}（${visualStyleBrief(name)}）`).join('；')||'不预设，由素材和主题决定'}。\n用途：${pagePurposes.map(p=>p+'：'+purposeMethod(p)).join('\n')||'不预设，由本次主题决定'}\n素材加工方式：${processing||'自由拆解'}，统一适用于本次素材。\n${contentBrief}\n优先级：必须使用每版落实；优先使用先考虑，合适时采用；可以使用只是备选；不使用的素材未发送，不得猜测或引用。\n【构思参考（非硬性配额）】\n${pageBrief}\n${spreadPreference}\n有图片时逐件观察，比较完整使用、合适的真实加工与舍弃；结束前核对选择是否体现在实际图层，工具模式在 finish_design 的 summary 简述关键取舍，直接页模式在内部完成核对。完整使用可以是最佳选择，不按工艺或素材数量评分。数字图形也可以成为视觉主角，但不能伪装成未拥有的真实素材。\n【真实素材】\n${list.join('\n')}\n【当前画布】\n${JSON.stringify(creativeScene(draft,aliases))}`}];
 const snapshotMode=['image','pdf'].includes(o.deliveryMode);
 if(snapshotMode)first[0].text=`创作一页将以${o.deliveryMode==='pdf'?'PDF':'图片'}快照交付的手帐。纸张：${draft.pageRatio} ${draft.pageMode==='spread'?'双页':'单页'}，物理高 ${draft.physicalPageHeightMM} mm。风格方向：${styles.join('、')||'不预设'}；用途：${pagePurposes.join('、')||'不预设'}。这些是方向，不是固定模板。\n素材加工方式：${processing||'自由拆解'}，统一适用于本次素材。\n${contentBrief}\n${pageBrief}\n${spreadPreference}\n真实素材与来源约束：\n${list.join('\n')}\n当前画布：${JSON.stringify(creativeScene(draft,aliases))}`;
 first[0].text+='\n【工艺场景基线】'+craftSceneHash(draft)+'\n【可用来源版本与已确认区域】'+JSON.stringify(describeCraftSources(assets,aliases));
 if(o.referenceImage){if(!/^data:image\/(png|jpeg|webp);base64,/.test(o.referenceImage))throw Error('重建参考必须是本次本机图像，不接受外链');first.push({type:'text',text:reconstructionInstruction},{type:'image_url',image_url:{url:o.referenceImage}});}
 images.forEach((input,i)=>{const url=typeof input==='string'?input:input.url,label=typeof input==='string'?Object.keys(aliases)[i]:input.asset;if(url)first.push({type:'text',text:'素材 '+label+' 的图片：'},{type:'image_url',image_url:{url}});});
 if(snapshotMode)return [{role:'system',content:`你是自由创作的手帐设计师。画面可大胆使用文字、数字手绘笔迹、荧光笔、自由矢量形状、色层及素材间的有机叠放；风格、用途与样例只是启发，不设素材数量、留白、密度、标题字数或固定版式指标。唯一硬性限制是真实纸张尺寸、实物素材的尺寸与单方案来源约束、裁片不能重叠重复使用、胶带保持真实宽度。未发送的实体素材不能凭空出现。坐标是画布中心的 0–1 比例，实体宽高始终由素材库决定。\n${multimodalCraftGuide}\n为让拾页生成快照，必须按机器可读合同返回页面，不要把整页内容当成一个新实体素材。${creativeProtocol(o).instruction}`},{role:'user',content:first}];
 const geometry='所有 placement 与文字/图形 x,y 都是中心点而非左上角。ratio 默认归一化到当前画布；实物按已确认毫米尺寸放置，不缩放、普通素材每方案只取用一份。图层可有意伸出纸边形成出血，页面预览及导出只显示纸内部分；重要文字与图像内容尽量留在纸内。普通素材 unit 必须为0；胶带可为不同独立段使用不同 unit。piece 是唯一片段ID，不是工序名称，各材料不得共用 whole 等ID。relation.target、relative_to、fit target 指已创建的 piece/key，不能填素材 alias 或 canvas。直接页文字 x,y 同样为中心（不是左上），完整行高可能扩展；长段可分栏或调整字号。文字重叠、对比偏低或框内显示不全会作为排版建议反馈，但不阻止有意的创意处理。没有素材图片时，你只知道名称、标签、尺寸：禁止猜测色彩深浅、星月具体形状/位置、人物姿态/动作/持球手方向、纸面纹理，只能依据已给信息联想或表达态度；排版尺寸和留白关系不写成正文。';
 const printType=creativeTypographyGuide(draft);
 return [{role:'system',content:[`【通用创作与物理规则】\n${system}\n${multimodalCraftGuide}`,`【坐标与排版】\n${geometry}\n${printType}`,`【文字、素材与图形的关系】\n${policy}\n${creativeLayeringGuide}\n${customLayoutPrompt}\n${reference}`,`【本次 API 创作模式】\n${mode}`].filter(Boolean).join('\n')},{role:'user',content:first}];
}
export function buildCreativePayload(o,messages){
 const deepseek=new URL(o.endpoint||'https://api.deepseek.com/chat/completions').host==='api.deepseek.com',mode=o.reasoningMode||'automatic',thinking=deepseek?(mode==='automatic'||o.disableThinking!==false?{type:'disabled'}:mode==='low'?{type:'enabled'}:null):null;
 return {model:o.model||'deepseek-flash',messages,stream:false,temperature:o.temperature??.75,...(o.sendOutputLimit!==false?{max_tokens:o.maxTokens||6000}:{}),...creativeProtocol(o).request(thinking),...(thinking?{thinking}:{}),...(thinking?.type==='enabled'&&mode==='low'?{reasoning_effort:'low'}:{})};
}
export async function runCreativeAgent(o){
 if(o.deliveryMode==='image')throw Error('画面图片必须由图像模型直接生成，不能把可编辑页面截图伪装成生成图片');
 const {draft,assets,aliases,key,endpoint='https://api.deepseek.com/chat/completions',maxTurns=12,requestTimeout=75,signal,onTurn=()=>{},request=fetch,onScene,onInspection}=o;
 if(!key?.trim())throw Error('请输入自己的 API 密钥');if(new URL(endpoint).protocol!=='https:')throw Error('API 地址必须使用 HTTPS');
 const options={...o,visualAssetIDs:visualMaterialIDs(o.images,o.aliases),textMode:o.contentPolicy==='visual'?'none':o.textMode,allowNoText:o.contentPolicy==='visual'||o.textMode==='none'||o.textMode==='requested'&&!/文字|正文|标题|写|清单/.test(o.prompt||'')};
 let working=attachSceneV2(structuredClone(draft)),turn=0,noProgress=0,nextPhase='creation';if(working.agentRun?.status==='finished')working.agentRun={...working.agentRun,status:'editing'};const messages=buildCreativeMessages({...options,draft:working}),budget=createCreativeBudget(maxTurns);
 try {for(;;){
  if(signal?.aborted)throw signal.reason||Error('创作已停止');const counts=budget.begin(nextPhase);turn=counts.totalRequests;nextPhase='creation';const before=editableSceneState(working),beforePatchHash=await patchSceneHash(working);
  const payload=buildCreativePayload(o,messages),protocol=creativeProtocol(o),native=protocol.native;
  const data=await requestChat({endpoint,key,payload,request,signal,timeout:requestTimeout,onProgress:p=>o.onProgress?.({...p,turn,budget:budget.snapshot()})}),choice=data.choices?.[0],message=choice?.message;if(!message)throw Error('模型没有返回可用消息');
  await o.onResponse?.(data);
  if(signal?.aborted)throw signal.reason||Error('创作已停止');
  if(choice.finish_reason==='length'){nextPhase='format-repair';noProgress++;messages.push({role:'user',content:'输出截断，整轮未执行。返回较小完整批次。实际状态：'+JSON.stringify(creativeScene(working,aliases))});await onTurn({turn,results:[{name:'response',ok:false,detail:'输出截断，整轮未执行'}],draft:working,text:'',budget:budget.snapshot()});if(noProgress>=4){const error=Error('连续四轮没有有效修改，已保留成功步骤');error.code='no-progress';throw error;}continue;}
  let calls;
  try{calls=protocol.calls(message,turn);}catch(e){nextPhase='format-repair';noProgress++;messages.push({role:'user',content:'页面/JSON不符合合同：'+e.message+'。未执行；修正后完整返回。'});await onTurn({turn,results:[{name:'response',ok:false,detail:e.message}],draft:working,text:'',budget:budget.snapshot()});if(noProgress>=4){const error=Error('连续四轮没有有效修改，已保留成功步骤');error.code='no-progress';throw error;}continue;}
  if(!calls.length)throw Error('第 '+turn+' 轮没有返回创作操作；画布未因此标记为完成。');
  if(signal?.aborted)throw signal.reason||Error('创作已停止');
  messages.push(native?{role:'assistant',content:message.content||null,...(message.reasoning_content?{reasoning_content:message.reasoning_content}:{}),tool_calls:calls}:{role:'assistant',content:message.content||''});
  const fullScene=calls.some(call=>['compose_page','compose_story_page','compose_direct_page','apply_craft_plan'].includes(call.function?.name||call.name));
  const result=fullScene?applyToolCalls({tools:calls},working,assets,aliases,options):
    await applyScenePatch({mode:'applyPatch',baseSceneHash:beforePatchHash,tools:calls},working,assets,aliases,options);
  working=result.draft;
  const inspections=[];
  for(const r of result.results){const content=JSON.stringify({ok:r.ok,detail:r.detail,...(r.data?{data:r.data}:{})});messages.push(native?{role:'tool',tool_call_id:r.id,content}:{role:'user',content:r.name+': '+content});if(r.ok&&r.name==='inspect_materials'&&onInspection)inspections.push(r.data);}
  if(signal?.aborted)throw signal.reason||Error('创作已停止');
  noProgress=before===editableSceneState(working)?noProgress+1:0;
  const review=reviewCreativeDraft(working,{allowNoText:options.allowNoText,purposes:o.pagePurposes,styles:o.styles,materialPriority:o.materialPriority,assets});await onTurn({turn,results:result.results,draft:working,text:message.content||'',review,budget:budget.snapshot()});
  // The successful scene checkpoint is durable before optional image lookup.
  // Observation failure must not replay already applied tools next turn.
  const inspectionParts=[];
  for(const data of inspections){if(signal?.aborted)throw signal.reason||Error('创作已停止');try{const previews=await onInspection(data);if(previews?.length)inspectionParts.push(...previews);}catch{if(signal?.aborted)throw signal.reason||Error('创作已停止');inspectionParts.push({type:'text',text:'素材局部预览暂不可用。已成功执行的工具无需重放；可继续或稍后重新检查。'});}}
  // Every native call needs its contiguous tool reply before any user image.
  if(inspectionParts.length)messages.push({role:'user',content:inspectionParts});
  if(working.agentRun?.status==='finished'){
   working=await reviewFinalCreativeScene({draft:working,options,assets,aliases,budget,render:o.onFinalScene||onScene,request,onResponse:o.onResponse,onTurn,signal});
   if(signal?.aborted)throw signal.reason||Error('创作已停止');
   const sceneHash=craftSceneHash(working);
   return {draft:working,turns:budget.snapshot().totalRequests,finished:true,messages,review:reviewCreativeDraft(working),sceneHash,renderedSceneHash:working.agentRun.renderedSceneHash,budget:budget.stop('completed')};
  }
  if(noProgress>=4){const error=Error('连续四轮没有有效修改，已保留成功步骤');error.code='no-progress';throw error;}
  const scene=[{type:'text',text:'当前工艺场景基线：'+craftSceneHash(working)+'\n实际画布状态：'+JSON.stringify(creativeScene(working,aliases))+'\n排版检查（非美感评分）：'+JSON.stringify(review)+'\n按成功回执修正，不重复已放置实物。'} ];let image;try{image=await onScene?.(working);}catch{if(signal?.aborted)throw signal.reason||Error('创作已停止');scene.push({type:'text',text:'画面观察暂不可用，已提交工具不应重放。'});}if(image)scene.push({type:'image_url',image_url:{url:image}});messages.push({role:'user',content:scene});
 }}catch(error){budget.stop(signal?.aborted?'cancelled':error.code||'error');if(error&&typeof error==='object')error.budget=budget.snapshot();throw error;}
}
