import {applyToolCalls} from './creative.js';

const shape=(properties,required)=>({type:'object',properties,required,additionalProperties:false});
const string={type:'string'},numeric={type:'number'};
const descriptions={
  place_materials:'把真实素材放入页面，只给素材编号和中心位置比例；宽高由本地计算，不得重复库存。',
  edit_materials:'对已有实物片段执行直线矩形裁切。cropRect 的 x/y/width/height 都是原材料比例。短边至少 6 mm。',
  upsert_text:'写真实的手账内容，不写图注或设计解释；返回可编辑的文字块。',
  upsert_primitives:'加入数字图形点缀，使用颜色、位置和大小。',
  move_elements:'移动已有图层，保持实物尺寸。',
  delete_elements:'移走作品图层，不改素材库。',
  set_paper:'更新纸色和纸张纹理。',
  finish_design:'确认完成当前方案。'
};
const definitions={
  place_materials:shape({items:{type:'array',items:shape({asset:string,piece:string,x:numeric,y:numeric,rotation:numeric,z:numeric},['asset'])}},['items']),
  edit_materials:shape({items:{type:'array',items:shape({piece:string,operations:{type:'array',items:shape({type:{type:'string',enum:['rectangularCut','useWhole']},cropRect:shape({x:numeric,y:numeric,width:numeric,height:numeric},['x','y','width','height'])},['type'])}},['piece','operations'])}},['items']),
  upsert_text:shape({items:{type:'array',items:shape({key:string,content:string,width:numeric,x:numeric,y:numeric,height:numeric,font_size:numeric,style:string,color:string,role:string,alignment:string},['key','content','width'])}},['items']),
  upsert_primitives:shape({items:{type:'array',items:shape({key:string,kind:string,x:numeric,y:numeric,width:numeric,height:numeric,fill:string,stroke:string,line_width:numeric,rotation:numeric,z:numeric},['key','kind'])}},['items']),
  move_elements:shape({items:{type:'array',items:shape({key:string,x:numeric,y:numeric,rotation:numeric,z:numeric},['key'])}},['items']),
  delete_elements:shape({keys:{type:'array',items:string}},['keys']),
  set_paper:shape({color:string,pattern:string,intent:string},[]),
  finish_design:shape({summary:string},[])
};
export const agentTools=Object.entries(definitions).map(([name,parameters])=>({type:'function',function:{name,description:descriptions[name],parameters}}));
const system=`你是拾页手账创作者。使用实际给出的纸质素材编号，尺寸与库存由本地工具判定。先分析素材的颜色与视觉重心，选择 3–6 件有关联的素材构成主角、衬底和细节；保留呼吸感，避免所有元素堆在中央。布局应有清晰的视觉层次，图像主角占较大的可见面积，文字和装饰互不遮挡。写有真实叙述的中文手账：一个有意味的短标题、一段具体的正文、至多一两处短旁注。不要写设计说明、画面图注、任务复述，不捏造日期地点经历。字色与底色形成清晰对比，正文避免淡灰小字；数字线框和色块应少而有目的，避免重复装饰或空泛的待办清单。坐标使用页面比例，标题字号 46–90，正文 32–55，旁注 24–36（工具仍会校验）。每轮先看工具反馈并改正，完成前确认已有可读正文、主视觉和留白，再调用 finish_design。`;

export async function runCreativeAgent({draft,assets,aliases,key,model='deepseek-flash',endpoint='https://api.deepseek.com/chat/completions',images=[],prompt='',temperature=0.8,maxTokens=4096,maxTurns=16,signal,onTurn=()=>{},request=fetch}){
  if(!key?.trim())throw Error('请输入自己的 API 密钥');
  if(!/^https:\/\/api\.deepseek\.com\/chat\/completions$/.test(endpoint))throw Error('目前仅允许 DeepSeek 官方接口');
  const list=Object.entries(aliases).map(([label,id])=>{const a=assets.find(x=>x.id===id);return a?`${label}: ${a.title}，${a.kind}，${a.role}，${a.physicalWidthMM||'未确认'}×${a.physicalHeightMM||'未确认'} mm，库存 ${a.supply?.quantity||1}，标签 ${(a.tags||[]).join('、')}`:'';}).filter(Boolean);
  const first=[{type:'text',text:`请为 A4 ${draft.pageMode==='spread'?'双页':'单页'}设计可编辑手账。素材：\n${list.join('\n')}\n补充要求：${prompt||'自然、丰富、文字有真实叙述。'}。坐标均为页面比例 0–1。`}];
  images.slice(0,4).forEach((url,i)=>first.push({type:'text',text:`素材 ${Object.keys(aliases)[i]} 的图片：`},{type:'image_url',image_url:{url}}));
  const messages=[{role:'system',content:system},{role:'user',content:first}];
  let working=structuredClone(draft),turn=0,failures=0;
  for(;;){
    if(signal?.aborted)throw signal.reason||Error('创作已停止');
    turn++;if(turn>maxTurns)throw Error(`已达到 ${maxTurns} 轮上限，前面成功的步骤仍已保存`);
    const response=await request(endpoint,{method:'POST',signal,headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},body:JSON.stringify({model,messages,tools:agentTools,tool_choice:'required',thinking:{type:'disabled'},stream:false,temperature,max_tokens:maxTokens})});
    if(!response.ok){const details=(await response.text()).slice(0,500);throw Error(`模型请求失败 ${response.status}：${details}`);}
    const data=await response.json(),message=data.choices?.[0]?.message;
    if(!message)throw Error('模型没有返回可用消息');
    const calls=message.tool_calls||[];
    if(!calls.length)throw Error(`第 ${turn} 轮没有返回创作操作；画布未因此标记为完成。请重试。`);
    messages.push({role:'assistant',content:message.content||null,tool_calls:calls});
    const result=applyToolCalls({tool_calls:calls},working,assets,aliases);working=result.draft;
    for(const outcome of result.results){messages.push({role:'tool',tool_call_id:outcome.id,content:JSON.stringify({ok:outcome.ok,detail:outcome.detail})});}
    failures=result.results.some(x=>x.ok)?0:failures+1;
    await onTurn({turn,results:result.results,draft:working,text:message.content||''});
    if(working.agentRun?.status==='finished')return {draft:working,turns:turn,finished:true,messages};
    if(failures>=4)throw Error('连续四轮没有有效修改，已保留前面成功的步骤');
  }
}
