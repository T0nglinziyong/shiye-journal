import {applyToolCalls} from './creative.js';
export {agentTools} from './creative-contract.js';
import {creativeProtocol} from './creative-delivery.js';
import {reviewCreativeDraft} from './creative-quality.js';
import {creativeTypographyGuide} from './creative-typography.js';
import {requestChat} from './chat-transport.js';
import {visualStyleBrief} from './creative-style-brief.js';
import {presetReferenceGuide,presetReferencePlans} from './creative-reference-presets.js';
import {creativeLayeringGuide} from './creative-layering-guide.js';
import {creativeContentBrief} from './creative-content-brief.js';
import {sceneFingerprint} from './offline-result-review.js';

const system='你是拾页手账创作者。只使用素材台中的真实素材；尺寸、库存和加工由本地工具判定，不得缩放或复制纸张、照片、贴纸，同一件裁下的非重叠余料可继续使用。胶带视为连续可裁取，但不能拉伸已校准的宽度或图案。文字和数字图形是可编辑图层。素材可先矩形裁片，再用 mask 做不规则、圆角或花边外轮廓；diagonal 用直线斜裁并指定保留侧，window 在素材内部开透明孔，两者可组合。把直线、自由矢量、手写笔与荧光笔拆成可编辑元素；让文字与素材形成有机关系。根据用途与风格建立主视觉、连续阅读区和细节，避免无意堆在中央、遮住正文、重复空相框或每段机械加白底。判断留白是否服务于主题与阅读：真实素材少时，可用有内容的可编辑文字、线条、底色或图形补充信息与节奏，也可有意识地保留空白；不要为填满面积而添加无关内容。不凭空制造实物。未提供经历时只能写客观观察或通用主题内容，不编日期地点经历。位置默认页面比例，文字参考本页字号与层级建议。加工只能用合同中安全操作，不假装识别未提供的图案，不执行网址、脚本或文件。每轮以实际画布和回执修正，完成前审阅整个页面。';
const purposes={日常记录:'用相关观察、图像和可编辑文字形成日记感；正文可是一段完整多行记录，也可分成若干短段。',旅途记录:'有依据的地点路线、图、票据及短段落，不编地名日期。',图文收藏:'不同大小的图、标签及有内容的文字格位，避免无意义空相框。',清单计划:'实际清单或记录区；缺少事项时写通用可编辑主题条目，不虚构日程。',影像故事:'主图与相关小图建立阅读顺序，穿插说明细节。',主题封面:'允许大主视觉、短标题及明显留白。'};
export function creativeScene(d,aliases={}){
 const map=Object.fromEntries(Object.entries(aliases).map(([k,v])=>[v,k])),g=x=>({key:x.creativePieceID||x.agentKey||x.key||x.id,x:x.x/d.canvas.width,y:x.y/d.canvas.height,width:x.width/d.canvas.width,height:x.height/d.canvas.height,rotation:x.rotation||0,z:x.zIndex||0});
 return {canvas:d.canvas,pageMode:d.pageMode,pageRatio:d.pageRatio,pageHeightMM:d.physicalPageHeightMM,paper:{color:d.paperColor,pattern:d.paperPattern,ruling:d.paperRuling,centerGutter:d.drawCenterGutter},materials:d.items.filter(x=>!x.isParked).map(x=>({...g(x),asset:map[x.assetID],cropRect:x.cropRect||null,materialMask:x.materialMask||null,opacity:x.opacity??1,flipped:!!x.isFlippedHorizontally})),texts:d.textBlocks.filter(x=>!x.isHidden).map(x=>({...g(x),content:x.content,fontSize:x.fontSize,fontName:x.fontName||null,style:x.style,color:x.color,alignment:x.alignment,letterSpacing:x.letterSpacing||0,lineSpacing:x.lineSpacing||0,fixedLineHeight:x.fixedLineHeight||null,paragraphSpacing:x.paragraphSpacing||0,bold:!!x.bold,italic:!!x.italic,underline:!!x.underline,strikethrough:!!x.strikethrough})),graphics:d.primitives.filter(x=>!x.hidden).map(x=>({...g(x),kind:x.kind,fill:x.fill,stroke:x.stroke,lineWidth:x.lineWidth,cornerRadius:x.cornerRadius,vectorPaths:x.vectorPaths||null,vectorLayers:x.vectorLayers||null})),inkStrokes:(d.strokes||[]).map(s=>({points:s.points?.length||0,color:s.color,width:s.width,opacity:s.opacity,penStyle:s.penStyle}))};
}
export function buildCreativeMessages(o){
 const {draft,assets,aliases,images=[],prompt='',customLayoutPrompt='',textMode='automatic',contentPolicy='documentary',userText='',providedFacts='',styles=[draft.style],pagePurposes=['日常记录'],processing,assetProcessing={},materialUseHints={},materialUseRequired={},requiredAssetIDs=[],materialPriority={},includeStructureReference=true,referenceImages=[],sendPresetReferences=false}=o;
 const effectiveTextMode=contentPolicy==='visual'?'none':textMode;
 const contentBrief=creativeContentBrief({policy:contentPolicy,userText,providedFacts,topic:prompt});
 const priority=id=>requiredAssetIDs.includes(id)||materialPriority.required?.includes(id)?'必须使用':materialPriority.available?.includes(id)?'可以使用（仅备选）':'优先使用';
 const list=Object.entries(aliases).flatMap(([label,id])=>{const a=assets.find(x=>x.id===id);return a?[`${label}: ${a.title}，优先级 ${priority(id)}，${a.kind}，${a.role}，${a.physicalWidthMM||'未确认'}×${a.physicalHeightMM||'未确认'} mm，库存 ${a.kind==='tape'?'连续胶带，可多次裁取但宽度与图案不得拉伸':a.supply?.quantity??1}，加工 ${assetProcessing[id]||processing||'保留完整'}，用法 ${materialUseHints[id]||'由生成器选择'}${materialUseRequired[id]?'（每个方案必做）':''}，标签 ${(a.tags||[]).join('、')}`]:[];});
 const policy=effectiveTextMode==='none'?'不生成文字。':effectiveTextMode==='requested'?'仅用户明确要求文字时配文。':'按用途生成真实内容的图文手账。';
 const isCover=pagePurposes[0]==='主题封面',isMinimal=styles[0]==='极简留白';
 const density=isCover||isMinimal?'可以让留白成为主题的一部分，并建立清楚的阅读焦点。':`先根据素材和用途考虑图文关系，避免只因惯性放一个标题和少量素材。${effectiveTextMode==='none'||effectiveTextMode==='requested'?'尊重本次文字设置。':'可用相互关联的可编辑正文、图注或清单展开内容；多行文字尽量合并成段落，不重复口号凑数。'}优先素材逐件审视：合适的多用，不适合的可以不放；不按数量或覆盖率评分。留白可以有意保留。`;
 const reference=includeStructureReference?'可以参考主图与旁注、错层图文、分栏收藏或留白封面等不同阅读结构；根据本次真实素材和用途自由选择，不复制固定坐标。':'';
 const mode=creativeProtocol(o).instruction;
 const first=[{type:'text',text:`【本次任务】\n纸张：${draft.pageRatio} ${draft.pageMode==='spread'?'双页':'单页'}，物理高${draft.physicalPageHeightMM}mm。\n风格：${styles.map(name=>`${name}（${visualStyleBrief(name)}）`).join('；')||'不预设，由素材和主题决定'}。\n用途：${pagePurposes.map(p=>p+'：'+(purposes[p]||'遵守主题要求。')).join('\n')||'不预设，由本次主题决定'}\n${contentBrief}\n优先级：必须使用每版落实；优先使用先考虑，合适时采用；可以使用只是备选；不使用的素材未发送，不得猜测或引用。\n【构思参考（非硬性配额）】\n${density}\n先浏览完整素材清单，决定主件、辅助件、文字和数字图形各自是否适合本页；数字图形也可以成为视觉主角，但不能伪装成未拥有的真实素材。\n【真实素材】\n${list.join('\n')}\n【当前画布】\n${JSON.stringify(creativeScene(draft,aliases))}`}];
 const snapshotMode=['image','pdf'].includes(o.deliveryMode);
 if(snapshotMode)first[0].text=`创作一页将以${o.deliveryMode==='pdf'?'PDF':'图片'}快照交付的手帐。纸张：${draft.pageRatio} ${draft.pageMode==='spread'?'双页':'单页'}，物理高 ${draft.physicalPageHeightMM} mm。风格方向：${styles.join('、')||'不预设'}；用途：${pagePurposes.join('、')||'不预设'}。这些是方向，不是固定模板。\n${contentBrief}\n真实素材与库存：\n${list.join('\n')}\n当前画布：${JSON.stringify(creativeScene(draft,aliases))}`;
 images.forEach((input,i)=>{const url=typeof input==='string'?input:input.url,label=typeof input==='string'?Object.keys(aliases)[i]:input.asset;if(url)first.push({type:'text',text:'素材 '+label+' 的图片：'},{type:'image_url',image_url:{url}});});
 referenceImages.forEach((url,i)=>first.push({type:'text',text:`匿名预设构图 ${i+1}/4，仅示意本次风格与用途的区域关系，不是私人日记，也不代表真实素材尺寸。`},{type:'image_url',image_url:{url}}));
 if(snapshotMode)return [{role:'system',content:`你是自由创作的手帐设计师。画面可大胆使用文字、数字手绘笔迹、荧光笔、自由矢量形状、色层及素材间的有机叠放；风格、用途与样例只是启发，不设素材数量、留白、密度、标题字数或固定版式指标。唯一硬性限制是真实纸张尺寸、实物素材的尺寸与库存、裁片不能重叠重复使用、胶带保持真实宽度。未发送的实体素材不能凭空出现。坐标是画布中心的 0–1 比例，实体宽高始终由素材库决定。\n为让拾页生成快照，必须按机器可读合同返回页面，不要把整页内容当成一个新实体素材。${creativeProtocol(o).instruction}`},{role:'user',content:first}];
 const geometry='所有 placement 与文字/图形 x,y 都是中心点而非左上角。ratio 默认归一化到当前画布；实物按已确认毫米尺寸放置，不缩放、不超库存。图层可有意伸出纸边形成出血，页面预览及导出只显示纸内部分；重要文字与图像内容尽量留在纸内。unit 从0开始，库存1必须 unit:0。piece 是唯一片段ID，不是工序名称，各材料不得共用 whole 等ID。relation.target、relative_to、fit target 指已创建的 piece/key，不能填素材 alias 或 canvas。直接页文字 x,y 同样为中心（不是左上），完整行高可能扩展；长段可分栏或调整字号。文字重叠、对比偏低或框内显示不全会作为排版建议反馈，但不阻止有意的创意处理。没有素材图片时，你只知道名称、标签、尺寸：禁止猜测色彩深浅、星月具体形状/位置、人物姿态/动作/持球手方向、纸面纹理，只能写已给的色名、主题关联与这次排版的尺寸和留白关系。';
 const printType=creativeTypographyGuide(draft);
 return [{role:'system',content:[`【通用创作与物理规则】\n${system}`,`【坐标与排版】\n${geometry}\n${printType}`,`【文字、素材与图形的关系】\n${policy}\n${creativeLayeringGuide}\n${customLayoutPrompt}\n${reference}`,sendPresetReferences||referenceImages.length?`【本次匿名预设样例】\n${presetReferenceGuide(presetReferencePlans({styles,purposes:pagePurposes,mode:draft.pageMode,ratio:draft.pageRatio}))}`:'',`【本次 API 创作模式】\n${mode}`].filter(Boolean).join('\n')},{role:'user',content:first}];
}
export function buildCreativePayload(o,messages){
 const deepseek=new URL(o.endpoint||'https://api.deepseek.com/chat/completions').host==='api.deepseek.com',mode=o.reasoningMode||'automatic',thinking=deepseek?(mode==='automatic'||o.disableThinking!==false?{type:'disabled'}:mode==='low'?{type:'enabled'}:null):null;
 return {model:o.model||'deepseek-flash',messages,stream:false,temperature:o.temperature??.75,...(o.sendOutputLimit!==false?{max_tokens:o.maxTokens||6000}:{}),...creativeProtocol(o).request(thinking),...(thinking?{thinking}:{}),...(thinking?.type==='enabled'&&mode==='low'?{reasoning_effort:'low'}:{})};
}
export async function runCreativeAgent(o){
 if(o.deliveryMode==='image')throw Error('画面图片必须由图像模型直接生成，不能把可编辑页面截图伪装成生成图片');
 const {draft,assets,aliases,key,endpoint='https://api.deepseek.com/chat/completions',maxTurns=5,requestTimeout=75,signal,onTurn=()=>{},request=fetch,onScene,onInspection}=o;
 if(!key?.trim())throw Error('请输入自己的 API 密钥');if(new URL(endpoint).protocol!=='https:')throw Error('API 地址必须使用 HTTPS');
 const options={...o,textMode:o.contentPolicy==='visual'?'none':o.textMode,allowNoText:o.contentPolicy==='visual'||o.textMode==='none'||o.textMode==='requested'&&!/文字|正文|标题|写|清单/.test(o.prompt||'')};
 let working=structuredClone(draft),turn=0,failures=0;if(working.agentRun?.status==='finished')working.agentRun={...working.agentRun,status:'editing'};const messages=buildCreativeMessages({...options,draft:working}),limit=maxTurns===0?5:Math.max(1,Math.min(20,maxTurns));
 for(;turn<limit;){
  if(signal?.aborted)throw signal.reason||Error('创作已停止');turn++;
  const payload=buildCreativePayload(o,messages),protocol=creativeProtocol(o),native=protocol.native;
  const data=await requestChat({endpoint,key,payload,request,signal,timeout:requestTimeout,onProgress:p=>o.onProgress?.({...p,turn})}),choice=data.choices?.[0],message=choice?.message;if(!message)throw Error('模型没有返回可用消息');
  await o.onResponse?.(data);
  if(signal?.aborted)throw signal.reason||Error('创作已停止');
  if(choice.finish_reason==='length'){messages.push({role:'user',content:'输出截断，整轮未执行。返回较小完整批次。实际状态：'+JSON.stringify(creativeScene(working,aliases))});await onTurn({turn,results:[{name:'response',ok:false,detail:'输出截断，整轮未执行'}],draft:working,text:''});continue;}
  let calls;
  try{calls=protocol.calls(message,turn);}catch(e){messages.push({role:'user',content:'页面/JSON不符合合同：'+e.message+'。未执行；修正后完整返回。'});await onTurn({turn,results:[{name:'response',ok:false,detail:e.message}],draft:working,text:''});continue;}
  if(!calls.length)throw Error('第 '+turn+' 轮没有返回创作操作；画布未因此标记为完成。');
  if(signal?.aborted)throw signal.reason||Error('创作已停止');
  messages.push(native?{role:'assistant',content:message.content||null,...(message.reasoning_content?{reasoning_content:message.reasoning_content}:{}),tool_calls:calls}:{role:'assistant',content:message.content||''});
  const result=applyToolCalls({tool_calls:calls},working,assets,aliases,options);working=result.draft;
  const inspections=[];
  for(const r of result.results){const content=JSON.stringify({ok:r.ok,detail:r.detail,...(r.data?{data:r.data}:{})});messages.push(native?{role:'tool',tool_call_id:r.id,content}:{role:'user',content:r.name+': '+content});if(r.ok&&r.name==='inspect_materials'&&onInspection)inspections.push(r.data);}
  if(signal?.aborted)throw signal.reason||Error('创作已停止');
  const review=reviewCreativeDraft(working,{allowNoText:options.allowNoText,purposes:o.pagePurposes,styles:o.styles,materialPriority:o.materialPriority,assets});await onTurn({turn,results:result.results,draft:working,text:message.content||'',review});
  // The successful scene checkpoint is durable before optional image lookup.
  // Observation failure must not replay already applied tools next turn.
  const inspectionParts=[];
  for(const data of inspections){if(signal?.aborted)throw signal.reason||Error('创作已停止');try{const previews=await onInspection(data);if(previews?.length)inspectionParts.push(...previews);}catch{if(signal?.aborted)throw signal.reason||Error('创作已停止');inspectionParts.push({type:'text',text:'素材局部预览暂不可用。已成功执行的工具无需重放；可继续或稍后重新检查。'});}}
  // Every native call needs its contiguous tool reply before any user image.
  if(inspectionParts.length)messages.push({role:'user',content:inspectionParts});
  failures=result.results.some(x=>x.ok)?0:failures+1;
  if(working.agentRun?.status==='finished'){
   const sceneHash=await sceneFingerprint(creativeScene(working,aliases));
   working.agentRun={...working.agentRun,finalSceneHash:sceneHash,renderedSceneHash:null,visualReview:'pending'};
   try{const preview=await (o.onFinalScene||onScene)?.(working);if(preview)working.agentRun.renderedSceneHash=sceneHash;}catch{working.agentRun.visualReview='render-failed';}
   if(signal?.aborted)throw signal.reason||Error('创作已停止');
   return {draft:working,turns:turn,finished:true,messages,review,sceneHash,renderedSceneHash:working.agentRun.renderedSceneHash};
  }
  const scene=[{type:'text',text:'实际画布状态：'+JSON.stringify(creativeScene(working,aliases))+'\n排版检查（非美感评分）：'+JSON.stringify(review)+'\n按成功回执修正，不重复已放置实物。'}],image=await onScene?.(working);if(image)scene.push({type:'image_url',image_url:{url:image}});messages.push({role:'user',content:scene});
  if(failures>=4)throw Error('连续四轮没有有效修改，已保留成功步骤');
 }
 throw Error('已达到 '+limit+' 轮上限，前面成功的步骤仍已保存');
}
