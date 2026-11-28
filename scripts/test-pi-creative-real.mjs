// Isolated Pi pilot. The production LangGraph runner is unchanged.
// PI_SDK_ROOT points to an isolated npm installation of @earendil-works/pi-coding-agent.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {draft} from '../src/domain.js';
import {createCreationDocument} from '../src/creation-document.js';
import {applyCreationTransaction,creationSceneRevision} from '../src/creation-transaction.js';
import {inspectCreationDocument,creationHelp,describeCreationGuidance} from '../src/creation-inspection.js';
import {validateWebScene} from '../src/web-scene-workbench.js';
import {validateValue} from '../src/creative-contract.js';
import {assetFromSourceSnapshot} from '../src/material-anatomy.js';
import {localGlyphOutline} from '../src/creation-font-resolver.mjs';
import {deriveMaterialEdgeQuads} from '../creative-agent/runtime/material-edge-quads.mjs';
import {harnessTools,initialHarnessState,canonicalToolRevision} from '../creative-agent/runtime/agent.mjs';
import {loadCreationSkills} from '../creative-agent/runtime/skills.mjs';
import {createHarnessRenderer} from '../creative-agent/runtime/renderer.mjs';
import {createDeepSeekCreativeModel} from '../creative-agent/runtime/deepseek.mjs';
import {createCreativeNetwork} from '../creative-agent/runtime/network.mjs';
import {compileLibraryRecipe,searchLibraryReferences,caseDetails,templateDetails} from '../creative-agent/runtime/library.mjs';
import {searchWritingTopics} from '../creative-agent/runtime/writing-topics.mjs';
import {creationBoundaryIssues} from '../src/creation-layout-guard.js';

const [packagePath,outputPath,style='丰富层叠']=process.argv.slice(2);
if(!packagePath||!outputPath)throw Error('用法：PI_SDK_ROOT=/tmp/shiye-pi-test node --env-file=<私有配置> scripts/test-pi-creative-real.mjs <v3任务包> <输出目录> [风格]');
const sdk=resolve(process.env.PI_SDK_ROOT||'/tmp/shiye-pi-test','node_modules');
const [{Agent},{createAssistantMessageEventStream}]=await Promise.all([
  import(pathToFileURL(join(sdk,'@earendil-works/pi-agent-core/dist/index.js')).href),
  import(pathToFileURL(join(sdk,'@earendil-works/pi-ai/dist/utils/event-stream.js')).href)
]);
const started=Date.now(),deadlineAt=started+(Number(process.env.SHIYE_ACCEPTANCE_DEADLINE_MS)||360000);
const input=resolve(packagePath),output=resolve(outputPath);
await mkdir(output,{recursive:true,mode:0o700});
const task=JSON.parse(await readFile(join(input,'TASK.json'),'utf8'));
if(task.format!=='shiye-gpt-creation-package'||task.version!==3||task.protocolVersion!==2)throw Error('只接受当前 v3 / 协议 2 任务包');
const images={};
for(const material of task.materials){
  if(!/^assets\/[a-zA-Z0-9_-]+\.(png|jpg|webp)$/.test(material.image))throw Error('素材路径不合规');
  const bytes=await readFile(join(input,material.image));
  if('sha256:'+createHash('sha256').update(bytes).digest('hex')!==material.sha256)throw Error('素材指纹不一致：'+material.alias);
  images[material.alias]=bytes;
}
const skills=await loadCreationSkills(),assets=task.sourceContext.sourceSnapshots.map(s=>assetFromSourceSnapshot(s,{frozenRevision:true}));
const prompt=(task.intent?.trim()||`使用本次真实素材创作一份完成态的${style}手帐。图文共同构图，有具体内容与手作层次；不要做商品目录。`)+(process.env.SHIYE_ACCEPTANCE_INSTRUCTIONS||'');
let document=await createCreationDocument({draft:draft({mode:task.page.mode,ratio:task.page.ratio}),assets,
  aliases:Object.fromEntries(task.sourceContext.materials.map(m=>[m.alias,m.assetID])),title:style+'手帐',styles:[...new Set([style,...(task.styles||[])])],
  pagePurposes:task.purposes,prompt,userText:task.userText||'',providedFacts:task.providedFacts||'',contentPolicy:task.contentPolicy||'original',
  processing:task.processing,requiredAssetIDs:task.requiredAssetIDs,materialPriority:task.sourceContext.materialPriority});
const renderer=await createHarnessRenderer({source:document.source,images,saveArtifact:async({png,pngHash,document,report})=>{
  const name='preview-'+pngHash.slice(7,23)+'.png';
  await writeFile(join(output,name),png,{mode:0o600});
  await writeFile(join(output,name+'.json'),JSON.stringify({report,document}),{mode:0o600});
  return name;
}});
const initial=initialHarnessState({document,skills,brief:{style,page:task.page,intent:document.source.intent,contentPolicy:document.source.contentPolicy,processing:task.processing,priority:task.sourceContext.materialPriority},tray:await renderer.index(document),startedAt:started,deadlineAt});
await writeFile(join(output,'input.json'),JSON.stringify(initial),{mode:0o600});
const network=createCreativeNetwork({dns:process.env.SHIYE_CREATIVE_DNS||'system'});
const model=createDeepSeekCreativeModel({key:process.env.SHIYE_CREATIVE_API_KEY,effort:process.env.SHIYE_CREATIVE_EFFORT||'high',fetcher:network.fetcher});
const capabilities={glyphOutline:localGlyphOutline,edgeQuads:deriveMaterialEdgeQuads(document.source,images)};
const selected=['creation_apply','creation_help','creation_guide','creation_inspect','read_skill','search_references','read_case','read_template','search_writing_topics','creation_recipe','creation_plan','inspect_materials','creation_preview','creation_review','creation_undo','creation_finish'];
const definitions=harnessTools.filter(t=>selected.includes(t.function.name));
const schemas=new Map(definitions.map(t=>[t.function.name,t.function.parameters]));
const trace=[],usage=[],loadedSkills=[];let preview=null,review=null,plan=null,complete=false,turns=0,toolCount=0,undo=[];
const revision=()=>creationSceneRevision(document);
const imagePart=url=>{const match=/^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(url||'');return match?{type:'image',mimeType:'image/'+match[1],data:match[2]}:null;};
const textPart=value=>({type:'text',text:typeof value==='string'?value:JSON.stringify(value)});
const checkTime=()=>{if(Date.now()>=deadlineAt)throw Error('Pi 测试达到时间上限');};
async function draw(){
  checkTime();preview=await renderer.render(document,undefined,[{id:'page'},{id:'tray'}]);review=null;
  return {data:{pngHash:preview.pngHash,sceneRevision:preview.sceneRevision,artifact:preview.artifact,spaces:preview.spaceViews.map(({id,items,parkedIDs})=>({id,items,parkedIDs}))},parts:[textPart('最新真实预览；页面版本 '+preview.sceneRevision),imagePart(preview.imageURL),...preview.spaceViews.filter(v=>v.id!=='page'&&v.imageURL).flatMap(v=>[textPart('工作空间 '+v.id+'；对象 '+JSON.stringify(v.items||v.parkedIDs||[])),imagePart(v.imageURL)])].filter(Boolean)};
}
async function execute(name,args){
  checkTime();validateValue(args,schemas.get(name));let data,parts=[];
  if(name==='creation_plan'){plan=args;data={saved:true,sceneRevision:revision()};}
  else if(name==='creation_help'){
    const topics=args.topics||[],toolNames=topics.filter(t=>schemas.has(t)),guideTopics=topics.filter(t=>!schemas.has(t));
    data={...(guideTopics.length||!toolNames.length?creationHelp({...args,topics:guideTopics}):{}),...(toolNames.length?{tools:definitions.filter(t=>toolNames.includes(t.function.name))}:{})};
  }
  else if(name==='creation_guide')data=describeCreationGuidance(args.topics);
  else if(name==='creation_inspect')data=inspectCreationDocument(document,{...args,edgeQuads:capabilities.edgeQuads});
  else if(name==='read_skill'){
    data=skills.read(args.name,args);loadedSkills.push({name:args.name,level:args.level||'overview',methodId:args.methodId||null});
    const visual=args.level&&args.level!=='overview'?await skills.methodImageParts(args.name,args):skills.imageParts(args.name);
    parts=visual.map(p=>p.type==='image_url'?imagePart(p.image_url?.url):textPart(p.text)).filter(Boolean);
  }
  else if(name==='search_references')data=searchLibraryReferences(document,{...args,includeTemplates:true});
  else if(name==='read_case')data=caseDetails(args.id,document);
  else if(name==='read_template'){const t=templateDetails(args.id);data={id:t.id,title:t.title,available:t.available,reason:t.reason,styles:t.styles,palette:t.palette,source:t.source,slots:t.slots};}
  else if(name==='search_writing_topics')data={topics:searchWritingTopics({materials:document.source.sourceSnapshots,query:args.query||'',seed:started,month:new Date(started).getUTCMonth()+1,limit:args.limit||5,exclude:args.exclude||[],allowFiction:document.source.contentPolicy!=='documentary'})};
  else if(name==='inspect_materials'){
    const requested=args.keys.slice(0,3);const found=await renderer.inspectMaterials(requested);
    data={keys:requested,deferredKeys:args.keys.slice(3)};parts=found.flatMap(p=>[textPart('素材 '+p.alias),imagePart(p.url)]).filter(Boolean);
  }
  else if(name==='creation_apply'||name==='creation_recipe'){
    if(!plan)throw Error('请先 creation_plan');
    let transaction;
    if(name==='creation_apply'){const {decision,...command}=args;transaction={...command,protocolVersion:2,baseSceneRevision:canonicalToolRevision(args.baseSceneRevision,revision())};}
    else {const {with:companions=[],...first}=args;const compiled=[first,...companions.map(c=>({...first,...c}))].map(r=>compileLibraryRecipe(document,r));transaction={protocolVersion:2,transactionId:args.transactionId,baseSceneRevision:canonicalToolRevision(args.baseSceneRevision,revision()),operations:compiled.flatMap(c=>c.operations)};}
    const before=document,applied=applyCreationTransaction(document,transaction,assets,capabilities);
    document=applied.document;data=applied.result;if(applied.changed){undo.push(before);const drawn=await draw();data={...data,...drawn.data};parts=drawn.parts;}
  }
  else if(name==='creation_undo'){
    if(!undo.length)throw Error('没有可撤回的编辑');document=undo.pop();const drawn=await draw();data=drawn.data;parts=drawn.parts;
  }
  else if(name==='creation_preview'){const drawn=await draw();data=drawn.data;parts=drawn.parts;}
  else if(name==='creation_review'){
    if(!preview||args.pngHash!==preview.pngHash||args.sceneRevision!==revision())throw Error('审查引用了旧画面');
    if(args.approved&&args.issues?.length)throw Error('仍有待修问题');
    review=args;data={saved:true};
  }
  else if(name==='creation_finish'){
    if(!preview||preview.sceneRevision!==revision())throw Error('请先查看最新真实预览');
    if(!review?.approved||review.sceneRevision!==revision())throw Error('请先对最新画面完成 creation_review');
    const issues=creationBoundaryIssues(document);if(issues.length)throw Error('作品越界：'+issues.map(i=>i.alias).join('、'));
    validateWebScene(document.page,document.source,assets,{final:true});complete=true;data={sceneRevision:revision(),pngHash:preview.pngHash,summary:args.summary||''};
  }
  return {data,parts};
}
const piTools=definitions.map(({function:f})=>({name:f.name,label:f.name,description:f.description,parameters:f.parameters,
  async execute(id,args){const begun=Date.now();toolCount++;try{const out=await execute(f.name,args);trace.push({kind:'tool',turn:turns,name:f.name,ok:true,durationMs:Date.now()-begun,sceneRevision:revision()});return {content:[textPart({ok:true,data:out.data}),...out.parts],details:out.data,terminate:complete};}
    catch(error){trace.push({kind:'tool',turn:turns,name:f.name,ok:false,durationMs:Date.now()-begun,error:String(error.message).slice(0,200),sceneRevision:revision()});return {content:[textPart({ok:false,error:error.message,sceneRevision:revision(),currentPreview:preview&&preview.sceneRevision===revision()?{pngHash:preview.pngHash,sceneRevision:preview.sceneRevision}:null})],details:{error:error.message},isError:true};}}
}));
function toOpenAI(messages){const out=[];let pendingPictures=[];const flushPictures=()=>{if(pendingPictures.length){out.push({role:'user',content:pendingPictures.map(p=>({type:'image_url',image_url:{url:`data:${p.mimeType};base64,${p.data}`}}))});pendingPictures=[];}};for(const m of messages){
  if(m.role!=='toolResult')flushPictures();
  if(m.role==='system'){out.push({role:'system',content:typeof m.content==='string'?m.content:(m.content||[]).filter(p=>p.type==='text').map(p=>p.text).join('\n')});continue;}
  if(m.role==='user'){const content=typeof m.content==='string'?m.content:(m.content||[]).map(p=>p.type==='image'?{type:'image_url',image_url:{url:`data:${p.mimeType};base64,${p.data}`}}:{type:'text',text:p.text});out.push({role:'user',content});continue;}
  if(m.role==='assistant'){const calls=m.content.filter(p=>p.type==='toolCall').map(p=>({id:p.id,type:'function',function:{name:p.name,arguments:JSON.stringify(p.arguments)}}));out.push({role:'assistant',content:m.content.filter(p=>p.type==='text').map(p=>p.text).join('\n')||null,...(calls.length?{tool_calls:calls}:{})});continue;}
  if(m.role==='toolResult'){const texts=m.content.filter(p=>p.type==='text').map(p=>p.text).join('\n');out.push({role:'tool',tool_call_id:m.toolCallId,content:texts||'{}'});pendingPictures.push(...m.content.filter(p=>p.type==='image'));}
}flushPictures();
  // Keep the source contact sheet and the two latest visual observations.
  // Pi retains the full transcript for local replay; old rendered frames are
  // redundant once a newer frame has been observed.
  const visualIndices=out.flatMap((m,i)=>m.role==='user'&&Array.isArray(m.content)&&m.content.some(p=>p.type==='image_url')?[i]:[]);
  const keep=new Set([visualIndices[0],...visualIndices.slice(-2)]);
  return out.flatMap((m,i)=>visualIndices.includes(i)&&!keep.has(i)?(m.content.some(p=>p.type==='text')?[{...m,content:m.content.filter(p=>p.type==='text')}]:[]):[m]);}
const piModel={id:'deepseek-flash',name:'DeepSeek Flash',api:'openai-completions',provider:'deepseek',baseUrl:'https://api.deepseek.com',input:['text','image'],reasoning:true,contextWindow:128000,maxTokens:14000,cost:{input:0,output:0,cacheRead:0,cacheWrite:0}};
const streamFn=(_model,context,options)=>{const stream=createAssistantMessageEventStream();(async()=>{
  const timestamp=Date.now();try{checkTime();turns++;if(turns>45)throw Error('轮次上限');
    const requestMessages=toOpenAI(context.messages);let reply;
    for(let retry=0;retry<3;retry++){
      reply=await model({messages:retry?[...requestMessages,{role:'user',content:'上一轮输出截断，没有执行。请只发一个完整的小工具调用；不重复整体规划。'}]:requestMessages,tools:definitions,signal:options?.signal,remainingMs:deadlineAt-Date.now(),reasoningEffort:turns===1&&retry===0?'high':'low',recoveringFromTruncation:retry>0});
      if(reply.truncated){usage.push(reply.usage||{});trace.push({kind:'truncated',turn:turns,usage:reply.usage||{}});continue;}
      break;
    }
    if(reply.truncated)throw Error('模型连续三次输出截断');const raw=reply.message;
    const content=[...(raw.reasoning_content?[{type:'thinking',thinking:raw.reasoning_content}]:[]),...(raw.content?[{type:'text',text:raw.content}]:[]),...(raw.tool_calls||[]).map(c=>({type:'toolCall',id:c.id,name:c.function.name,arguments:JSON.parse(c.function.arguments||'{}')}))];
    const u=reply.usage||{};usage.push(u);const message={role:'assistant',content,api:'openai-completions',provider:'deepseek',model:'deepseek-flash',usage:{input:u.prompt_tokens||0,output:u.completion_tokens||0,cacheRead:u.prompt_cache_hit_tokens||0,cacheWrite:0,totalTokens:u.total_tokens||0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:raw.tool_calls?.length?'toolUse':'stop',timestamp};
    trace.push({kind:'model',turn:turns,durationMs:Date.now()-timestamp,toolCalls:raw.tool_calls?.map(c=>c.function.name)||[],usage:u});
    stream.push({type:'done',reason:message.stopReason,message});
  }catch(error){const message={role:'assistant',content:[],api:'openai-completions',provider:'deepseek',model:'deepseek-flash',usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:options?.signal?.aborted?'aborted':'error',errorMessage:error.message,timestamp};trace.push({kind:'model_error',turn:turns,error:error.message});stream.push({type:'error',reason:message.stopReason,error:message});}
})();return stream;};
const agent=new Agent({initialState:{systemPrompt:initial.messages[0].content+'\nPi 对照试验：creation_review 审阅最新画面后，使用 creation_finish 交付。只能调用实际提供的工具。',model:piModel,thinkingLevel:'high',tools:piTools},streamFn,toolExecution:'sequential',finishTurn:()=>complete?{action:'end'}:Date.now()<deadlineAt&&turns<45?{action:'continue'}:{action:'end'}});
agent.subscribe(event=>{if(event.type==='turn_start')console.log(JSON.stringify({event:'turn',turn:turns+1,elapsedMs:Date.now()-started}));});
const userContent=initial.messages[1].content.map(p=>p.type==='image_url'?imagePart(p.image_url.url):textPart(p.text)).filter(Boolean);
let failure=null;try{await agent.prompt({role:'user',content:userContent,timestamp:Date.now()});}catch(error){failure=error.message;}finally{await network.close();}
if(agent.state.errorMessage)failure=agent.state.errorMessage;
const total={input:usage.reduce((n,u)=>n+(u.prompt_tokens||0),0),output:usage.reduce((n,u)=>n+(u.completion_tokens||0),0),total:usage.reduce((n,u)=>n+(u.total_tokens||0),0)};
const report={status:complete?'completed':'incomplete',failure,totalMs:Date.now()-started,turns,toolCount,materialCount:task.materials.length,style,usage:total,preview:preview?{pngHash:preview.pngHash,artifact:preview.artifact,sceneRevision:preview.sceneRevision}:null,loadedSkills,toolErrors:trace.filter(t=>t.kind==='tool'&&!t.ok).map(t=>({name:t.name,error:t.error})),sdk:'@earendil-works/pi-coding-agent 1.6.0 (pi-agent-core loop)'};
await writeFile(join(output,'project.shiyeproject.json'),JSON.stringify(document),{mode:0o600});
await writeFile(join(output,'trace.json'),JSON.stringify(trace,null,2),{mode:0o600});
await writeFile(join(output,'report.json'),JSON.stringify(report,null,2),{mode:0o600});
await writeFile(join(output,'pi-transcript.json'),JSON.stringify(agent.state.messages),{mode:0o600});
console.log(JSON.stringify(report));
if(!complete)process.exitCode=1;
