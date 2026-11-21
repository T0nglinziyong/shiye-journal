// Thin model gateway. All scene mutations use the same transaction reducer as
// the exported CLI. Conversation, storage, rendering and cancellation stay host-owned.
import {createCreationDocument} from './creation-document.js';
import {applyCreationTransaction,creationSceneRevision} from './creation-transaction.js';
import {inspectCreationDocument,creationHelp,describeCreationGuidance} from './creation-inspection.js';
import {validateWebScene} from './web-scene-workbench.js';
import {attachSceneV2} from './scene-v2.js';
import {applyToolCalls} from './creative.js';
import {creationNodes} from './creation-scene-core.js';
import {validateCreationV2Commands} from './creation-v2-commands.js';
import {validateValue} from './creative-contract.js';

const object=(properties,required=[])=>({type:'object',properties,required,additionalProperties:false});
const topics={type:'array',maxItems:8,items:{type:'string',minLength:1,maxLength:120}};
const contracts={
 creation_apply:object({protocolVersion:{const:2},transactionId:{type:'string',pattern:'^[A-Za-z0-9_-]{1,96}$'},baseSceneRevision:{type:'string',pattern:'^sha256:[a-f0-9]{64}$'},operations:{type:'array',minItems:1,maxItems:200,items:{type:'object'}}},['protocolVersion','transactionId','baseSceneRevision','operations']),
 creation_help:object({topics,full:{type:'boolean'}}),
 creation_guide:object({topics}),
 creation_inspect:object({ids:topics,full:{type:'boolean'}}),
 inspect_materials:object({keys:{...topics,minItems:1}},['keys']),
 creation_finish:object({sceneRevision:{type:'string',pattern:'^sha256:[a-f0-9]{64}$'},summary:{type:'string',maxLength:1200}},['sceneRevision'])
};
const descriptions={
 creation_apply:'一次原子提交统一 Command；初次构图与局部修改都用它。operations 的精确参数用 creation_help 查询。失败整批不生效，同 transactionId 重试不重复添加。',
 creation_help:'按需查看操作或公共参数合同；topics 为空返回能力目录。不要猜参数或一次阅读全部 Schema。',
 creation_guide:'按需查看共用创作方法或风格专题；topics 为空列出目录。',
 creation_inspect:'读取当前 Scene 版本、世界毫米位置、图层及高级参数；ids 可限定对象，full 可读取完整原生字段。',
 inspect_materials:'查看素材别名或已放置裁片的真实局部图片与尺寸；只读。',
 creation_finish:'请求交付当前 Scene；必须是本轮最后调用且前序调用全部成功。系统校验并真实渲染后才完成。'
};
export const creationAgentTools=Object.entries(contracts).map(([name,parameters])=>({type:'function',function:{name,description:descriptions[name],parameters}}));
export async function createCreationAgentSession(options){
 const {assets,aliases={}}=options;
 let document=await createCreationDocument(options),host=structuredClone(options.draft);
 const draft=()=>attachSceneV2({...structuredClone(host),...structuredClone(document.page)});
 return {
  get document(){return document;},get draft(){return draft();},
  get revision(){return creationSceneRevision(document);},
  setRun(metadata){host.agentRun={...host.agentRun,...metadata};},
  async execute(calls){
   const results=[];let finishRequested=false;
   for(let index=0;index<calls.length;index++){
    const call=calls[index],name=call.function?.name||call.name,id=call.id||'call-'+index;
    try{
     if(!Object.hasOwn(contracts,name))throw Error('未知工具：'+name+'；请使用 creation_apply / creation_help');
     const raw=call.function?.arguments??call.arguments??{},args=typeof raw==='string'?JSON.parse(raw):raw;
     validateValue(args,contracts[name]);let data,changed=false;
     if(name==='creation_apply'){
      validateCreationV2Commands(args);
      const capabilities=options.commandCapabilities||await options.prepareCommandCapabilities?.(args)||{};
      if(options.signal?.aborted)throw options.signal.reason||Error('创作已停止');
      const result=applyCreationTransaction(document,args,assets,capabilities);
      document=result.document;changed=result.changed;data=result.result;
      if(changed)host.agentRun={...host.agentRun,status:'editing',renderedSceneHash:null,reviewedSceneHash:null};
     }else if(name==='creation_help'){
      const topics=args.topics||[];data=creationHelp({...args,topics:topics.filter(t=>t!=='fonts')});
      if(topics.includes('fonts'))data.fonts={glyphKnockout:options.glyphFonts||[],note:'文字可使用 fontPreset；字形镂空仅支持列出的解析字体，或显式 region 轮廓'};
     }
     else if(name==='creation_guide')data=describeCreationGuidance(args.topics);
     else if(name==='creation_inspect')data=inspectCreationDocument(document,args);
     else if(name==='inspect_materials'){
      for(const key of args.keys){
       const node=creationNodes(document.page.layers).find(n=>[n.id,n.creativePieceID,n.agentKey].includes(key));
       if(!Object.hasOwn(aliases,key)&&!(node?.type==='material'&&document.source.materials.some(m=>m.assetID===node.assetID)))throw Error('素材不在本次授权来源中：'+key);
      }
      // Reuse the read-only material/source observer, never its mutating tools.
      const observed=applyToolCalls({tools:[{name,arguments:args}]},draft(),assets,aliases,options).results[0];
      if(!observed.ok)throw Error(observed.detail);data=observed.data;
     }else{
      if(index!==calls.length-1||results.some(r=>!r.ok))throw Error('creation_finish 必须是最后调用，且本轮前序调用全部成功');
      if(args.sceneRevision!==creationSceneRevision(document))throw Object.assign(Error('完成请求的 Scene 版本已过期'),{code:'REVISION_CONFLICT'});
      validateWebScene(document.page,document.source,assets,{final:true});
      if(!document.page.layers.length)throw Error('画布为空，尚无可交付内容');
      finishRequested=true;host.agentRun={...host.agentRun,status:'editing',note:args.summary||''};
      data={sceneRevision:creationSceneRevision(document),awaitingRender:true};
     }
     results.push({id,name,ok:true,changed,detail:descriptions[name].split('；')[0],data});
    }catch(error){results.push({id,name,ok:false,changed:false,detail:error.message,code:error.code,data:{sceneRevision:creationSceneRevision(document)}});}
   }
   return {results,draft:draft(),finishRequested};
  }
 };
}
