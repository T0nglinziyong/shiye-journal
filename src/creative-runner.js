import {applyToolCalls} from './creative.js';
export {agentTools} from './creative-contract.js';
import {creativeProtocol} from './creative-delivery.js';
import {reviewCreativeDraft} from './creative-quality.js';
import {creativeTypographyGuide} from './creative-typography.js';
import {requestChat} from './chat-transport.js';

const system='你是拾页手账创作者。只使用素材台中的真实素材；尺寸、库存和加工由本地工具判定，不得缩放或复制实物。文字和数字图形是可编辑图层。根据用途与风格建立主视觉、连续阅读区、细节与留白，避免堆在中央、遮住正文、重复空相框或每段机械加白底。未提供经历时只能写客观观察或通用主题内容，不编日期地点经历。位置默认页面比例，文字遵守本页字号与层级建议。加工只能用合同中安全操作，不假装识别未提供的图案，不执行网址、脚本或文件。每轮以实际画布和回执修正，完成前审阅整个页面。';
const purposes={日常记录:'标题、至少两段关联观察与图像穿插，不做仅口号的封面。',旅途记录:'有依据的地点路线、图、票据及短段落，不编地名日期。',图文收藏:'不同大小的图、标签及有内容的文字格位，禁止空相框。',清单计划:'实际清单或记录区；缺少事项时写通用可编辑主题条目，不虚构日程。',影像故事:'主图与相关小图建立阅读顺序，穿插说明细节。',主题封面:'允许大主视觉、短标题及明显留白。'};
export function creativeScene(d,aliases={}){
 const map=Object.fromEntries(Object.entries(aliases).map(([k,v])=>[v,k])),g=x=>({key:x.creativePieceID||x.agentKey||x.key||x.id,x:x.x/d.canvas.width,y:x.y/d.canvas.height,width:x.width/d.canvas.width,height:x.height/d.canvas.height,rotation:x.rotation||0,z:x.zIndex||0});
 return {canvas:d.canvas,pageMode:d.pageMode,pageRatio:d.pageRatio,pageHeightMM:d.physicalPageHeightMM,paper:{color:d.paperColor,pattern:d.paperPattern},materials:d.items.filter(x=>!x.isParked).map(x=>({...g(x),asset:map[x.assetID],cropRect:x.cropRect||null})),texts:d.textBlocks.filter(x=>!x.isHidden).map(x=>({...g(x),content:x.content,fontSize:x.fontSize,color:x.color})),graphics:d.primitives.filter(x=>!x.hidden).map(x=>({...g(x),kind:x.kind,fill:x.fill}))};
}
export function buildCreativeMessages(o){
 const {draft,assets,aliases,images=[],prompt='',customLayoutPrompt='',textMode='automatic',styles=[draft.style],pagePurposes=['日常记录'],processing,assetProcessing={},materialUseHints={},materialUseRequired={},requiredAssetIDs=[],includeStructureReference=true,referencePage=1,referenceImages=[]}=o;
 const list=Object.entries(aliases).flatMap(([label,id])=>{const a=assets.find(x=>x.id===id);return a?[`${label}: ${a.title}，${a.kind}，${a.role}，${a.physicalWidthMM||'未确认'}×${a.physicalHeightMM||'未确认'} mm，库存 ${a.supply?.quantity??1}，加工 ${assetProcessing[id]||processing||'保留完整'}，用法 ${materialUseHints[id]||'由生成器选择'}${materialUseRequired[id]?'（每个方案必做）':''}${requiredAssetIDs.includes(id)?'（每版必用）':''}，标签 ${(a.tags||[]).join('、')}`]:[];});
 const policy=textMode==='none'?'不生成文字。':textMode==='requested'?'仅用户明确要求文字时配文。':'按用途生成真实内容的图文手账。';
 const reference=includeStructureReference?`匿名结构参考第${referencePage}页：${['左主图，右标题及两段正文，下方短注','上标题，中间错层主图，底部两栏文字','左叙述，右图文收藏，边缘少量点缀','上主视觉，中间有内容的网格，底部短注'][Math.max(0,Math.min(3,referencePage-1))]}。只参考阅读结构，必须按真实尺寸重排，不含私人日记。`:'';
 const mode=creativeProtocol(o).instruction;
 const first=[{type:'text',text:`页面：${draft.pageRatio} ${draft.pageMode==='spread'?'双页':'单页'}，物理高${draft.physicalPageHeightMM}mm。风格：${styles.join('、')}。用途：${pagePurposes.map(p=>p+'：'+(purposes[p]||'遵守主题要求。')).join('\n')}\n素材台：\n${list.join('\n')}\n用户要求：${prompt||'按用途和素材创作。'}\n实际初始画布：${JSON.stringify(creativeScene(draft,aliases))}`}];
 images.slice(0,8).forEach((input,i)=>{const url=typeof input==='string'?input:input.url,label=typeof input==='string'?Object.keys(aliases)[i]:input.asset;if(url)first.push({type:'text',text:'素材 '+label+' 的图片：'},{type:'image_url',image_url:{url}});});
 referenceImages.forEach(url=>first.push({type:'text',text:'用户明确开启发送的参考页，仅作风格参考。'},{type:'image_url',image_url:{url}}));
 const geometry='所有 placement 与文字/图形 x,y 都是中心点而非左上角。ratio 默认归一化到当前画布；毫米材料宽/纸宽和高/纸高决定可用中心范围，旋转还会扩大边界。unit 从0开始，库存1必须 unit:0。piece 是唯一片段ID，不是工序名称，各材料不得共用 whole 等ID。relation.target、relative_to、fit target 指已创建的 piece/key，不能填素材 alias 或 canvas。直接页文字 x,y 同样为中心（不是左上），完整行高可能扩展；长段请分栏或降低字号，保持框间间距。完成检查会拒绝任何文字框互相遮挡、文字不完整或对比不足。窄栏标题应短或缩小字号，不能把标题与长正文放在同一位置。没有素材图片时，你只知道名称、标签、尺寸：禁止猜测色彩深浅、星月具体形状/位置、人物姿态/动作/持球手方向、纸面纹理，只能写已给的色名、主题关联与这次排版的尺寸和留白关系。';
 const printType=creativeTypographyGuide(draft);
 return [{role:'system',content:[system,geometry,printType,policy,customLayoutPrompt,reference,mode].join('\n')},{role:'user',content:first}];
}
export function buildCreativePayload(o,messages){
 const deepseek=new URL(o.endpoint||'https://api.deepseek.com/chat/completions').host==='api.deepseek.com',mode=o.reasoningMode||'automatic',thinking=deepseek?(mode==='automatic'||o.disableThinking!==false?{type:'disabled'}:mode==='low'?{type:'enabled'}:null):null;
 return {model:o.model||'deepseek-flash',messages,stream:false,temperature:o.temperature??.75,...(o.sendOutputLimit!==false?{max_tokens:o.maxTokens||6000}:{}),...creativeProtocol(o).request(thinking),...(thinking?{thinking}:{}),...(thinking?.type==='enabled'&&mode==='low'?{reasoning_effort:'low'}:{})};
}
export async function runCreativeAgent(o){
 const {draft,assets,aliases,key,endpoint='https://api.deepseek.com/chat/completions',maxTurns=5,requestTimeout=75,signal,onTurn=()=>{},request=fetch,onScene,onInspection}=o;
 if(!key?.trim())throw Error('请输入自己的 API 密钥');if(new URL(endpoint).protocol!=='https:')throw Error('API 地址必须使用 HTTPS');
 const options={...o,allowNoText:o.textMode==='none'||o.textMode==='requested'&&!/文字|正文|标题|写|清单/.test(o.prompt||'')};
 let working=structuredClone(draft),turn=0,failures=0;if(working.agentRun?.status==='finished')working.agentRun={...working.agentRun,status:'editing'};const messages=buildCreativeMessages({...o,draft:working}),limit=maxTurns===0?5:Math.max(1,Math.min(5,maxTurns));
 for(;turn<limit;){
  if(signal?.aborted)throw signal.reason||Error('创作已停止');turn++;
  const payload=buildCreativePayload(o,messages),protocol=creativeProtocol(o),native=protocol.native;
  const data=await requestChat({endpoint,key,payload,request,signal,timeout:requestTimeout,onProgress:p=>o.onProgress?.({...p,turn})}),choice=data.choices?.[0],message=choice?.message;if(!message)throw Error('模型没有返回可用消息');
  await o.onResponse?.(data);
  if(choice.finish_reason==='length'){messages.push({role:'user',content:'输出截断，整轮未执行。返回较小完整批次。实际状态：'+JSON.stringify(creativeScene(working,aliases))});await onTurn({turn,results:[{name:'response',ok:false,detail:'输出截断，整轮未执行'}],draft:working,text:''});continue;}
  let calls;
  try{calls=protocol.calls(message,turn);}catch(e){messages.push({role:'user',content:'页面/JSON不符合合同：'+e.message+'。未执行；修正后完整返回。'});await onTurn({turn,results:[{name:'response',ok:false,detail:e.message}],draft:working,text:''});continue;}
  if(!calls.length)throw Error('第 '+turn+' 轮没有返回创作操作；画布未因此标记为完成。');
  messages.push(native?{role:'assistant',content:message.content||null,...(message.reasoning_content?{reasoning_content:message.reasoning_content}:{}),tool_calls:calls}:{role:'assistant',content:message.content||''});
  const result=applyToolCalls({tool_calls:calls},working,assets,aliases,options);working=result.draft;
  const inspectionParts=[];
  for(const r of result.results){const content=JSON.stringify({ok:r.ok,detail:r.detail,...(r.data?{data:r.data}:{})});messages.push(native?{role:'tool',tool_call_id:r.id,content}:{role:'user',content:r.name+': '+content});if(r.ok&&r.name==='inspect_materials'&&onInspection){const previews=await onInspection(r.data);if(previews?.length)inspectionParts.push(...previews);}}
  // Every native call needs its contiguous tool reply before any user image.
  // Interleaving inspection previews makes the provider reject the next turn.
  if(inspectionParts.length)messages.push({role:'user',content:inspectionParts});
  const review=reviewCreativeDraft(working,{allowNoText:options.allowNoText,purposes:o.pagePurposes});await onTurn({turn,results:result.results,draft:working,text:message.content||'',review});
  failures=result.results.some(x=>x.ok)?0:failures+1;
  if(working.agentRun?.status==='finished')return {draft:working,turns:turn,finished:true,messages,review};
  const scene=[{type:'text',text:'实际画布状态：'+JSON.stringify(creativeScene(working,aliases))+'\n排版检查（非美感评分）：'+JSON.stringify(review)+'\n按成功回执修正，不重复已放置实物。'}],image=await onScene?.(working);if(image)scene.push({type:'image_url',image_url:{url:image}});messages.push({role:'user',content:scene});
  if(failures>=4)throw Error('连续四轮没有有效修改，已保留成功步骤');
 }
 throw Error('已达到 '+limit+' 轮上限，前面成功的步骤仍已保存');
}
