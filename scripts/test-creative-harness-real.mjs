import {loadStyleReferences,attachStyleReferences} from '../creative-agent/runtime/style-references.mjs';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {draft} from '../src/domain.js';
import {paperDimensions} from '../src/paper-sizes.js';
import {createCreationDocument} from '../src/creation-document.js';
import {deriveMaterialEdgeQuads} from '../creative-agent/runtime/material-edge-quads.mjs';
import {assetFromSourceSnapshot} from '../src/material-anatomy.js';
import {localGlyphOutline} from '../src/creation-font-resolver.mjs';
import {createCreativeHarness,initialHarnessState} from '../creative-agent/runtime/agent.mjs';
import {loadCreationSkills} from '../creative-agent/runtime/skills.mjs';
import {JournalCheckpointSaver,fileCheckpointJournal} from '../creative-agent/runtime/checkpoints.mjs';
import {createDeepSeekCreativeModel} from '../creative-agent/runtime/deepseek.mjs';
import {createHarnessRenderer} from '../creative-agent/runtime/renderer.mjs';
import {createCreativeNetwork} from '../creative-agent/runtime/network.mjs';
import {createMaterialSegmenter} from '../creative-agent/runtime/segmentation.mjs';
import {SamDaemonClient} from '../compute-server/sam-daemon-client.mjs';
import {summarizeCreativeEvaluation} from '../creative-agent/runtime/quality-evaluation.mjs';
import {createLayoutStudyBudget} from './lib/layout-study-budget.mjs';
import {loadStudyReferences} from './lib/study-references.mjs';
import {studyStageDefinitions,reissueStudySeed,studyVisualParts} from './lib/study-stage.mjs';
import {auditAcceptanceModel} from './lib/acceptance-model-audit.mjs';

const flags=process.argv.slice(2).filter(arg=>arg.startsWith('--'));
if(flags.some(flag=>!['--resume','--layout-only'].includes(flag)&&!/^--(study-stage|from-project|stage-notes|study-mode)=.+$/.test(flag)))throw Error('未知验收参数');
const option=name=>flags.find(flag=>flag.startsWith('--'+name+'='))?.slice(name.length+3);
const stageName=option('study-stage')||(flags.includes('--layout-only')?'layout':null),stageDefinition=stageName?studyStageDefinitions[stageName]:null;
if(stageName&&!stageDefinition)throw Error('未知研究阶段');
if(option('study-stage')&&flags.includes('--layout-only'))throw Error('研究阶段只能选一项');
const seedPath=option('from-project'),notesPath=option('stage-notes');
const studyMode=option('study-mode')||'guided';
if(!['guided','blind','cross-reference'].includes(studyMode))throw Error('未知研究模式');
if(studyMode!=='guided'&&(!stageName||notesPath||process.env.SHIYE_ACCEPTANCE_INSTRUCTIONS))throw Error('统一提示词测试禁止专属指导和环境附加指令');
if((seedPath||notesPath)&&!stageName)throw Error('接续项目和研究备注需要显式研究阶段');
if(stageName&&stageName!=='layout'&&!stageDefinition.allowBlank&&!seedPath)throw Error('标题、正文和装饰研究必须从已保存项目继续');
const [packagePath,outputPath,style='复古收藏']=process.argv.slice(2).filter(arg=>!arg.startsWith('--'));
if(!packagePath||!outputPath)throw Error('用法：node --env-file=<私有配置> scripts/test-creative-harness-real.mjs <当前任务包目录> <私有输出目录> [风格] [--resume | --layout-only]');
const started=Date.now(),input=resolve(packagePath),output=resolve(outputPath),resume=flags.includes('--resume'),layoutOnly=stageName==='layout';
if(stageName&&resume)throw Error('阶段研究须使用新输出目录，不能接续完整创作');
const study=stageName?createLayoutStudyBudget({deadlineMs:studyMode==='guided'?(layoutOnly?180000:300000):(layoutOnly?300000:600000),maxPreviews:stageDefinition.maxPreviews??(studyMode==='guided'||layoutOnly?1:2),maxRequests:studyMode==='guided'?(layoutOnly?3:5):(layoutOnly?5:12)}):null;
await mkdir(output,{recursive:true,mode:0o700});
const task=JSON.parse(await readFile(join(input,'TASK.json'),'utf8'));
if(task.format!=='shiye-gpt-creation-package'||task.version!==3||task.protocolVersion!==2)throw Error('只接受当前 v3 / 协议 2 任务包');
if(!paperDimensions(task.page?.ratio))throw Error('任务包纸张尺寸无效：须使用支持的纸张规格或整数毫米 custom:宽x高，禁止默认退回 A4 后调用付费模型');
const studyReferences=study?await loadStudyReferences(input):{parts:[],records:[]};
if(studyMode==='blind'&&studyReferences.records.length)throw Error('无参考测试禁止参考图');
if(studyMode==='cross-reference'&&(!studyReferences.records.length||studyReferences.records.some(r=>r.stage!=='style')))throw Error('跨案例测试只接受其他案例的风格图');
if(studyMode!=='guided'&&seedPath){const audit=JSON.parse(await readFile(join(resolve(seedPath,'..'),'input-audit.json'),'utf8'));if(audit.studyMode!==studyMode||audit.intent!==task.intent)throw Error('禁止接续有答案或不同提示词的起点');}
const images={};
for(const material of task.materials){
  if(!/^assets\/[a-zA-Z0-9_-]+\.(png|jpg|webp)$/.test(material.image))throw Error('素材路径不合规');
  const bytes=await readFile(join(input,material.image));
  if('sha256:'+createHash('sha256').update(bytes).digest('hex')!==material.sha256)throw Error('真实素材指纹不一致：'+material.alias);
  images[material.alias]=bytes;
}
const skills=await loadCreationSkills(undefined,studyMode==='guided'?{}:{illustrationRoot:null}),assets=task.sourceContext.sourceSnapshots.map(s=>assetFromSourceSnapshot(s,{frozenRevision:true}));
if(studyMode!=='guided'){skills.imageParts=()=>[];skills.methodImageParts=async()=>[];}
const skillResources=skills.catalog().map(({name,version,illustrationCount})=>({name,version,illustrationCount}));
console.log(JSON.stringify({stage:'preflight',materialCount:task.materials.length,styles:task.styles,textMode:task.textMode||'automatic',skillResources}));
let document,initial;
if(resume){initial=JSON.parse(await readFile(join(output,'input.json'),'utf8'));document=initial.document;}
else {
  const fallbackPrompt=task.materials.length
    ?'使用本次真实素材创作一份完成态的'+style+'手帐。图文共同构图，有具体内容与手作层次；不要做商品目录。'
    :'创作一份完成态的'+style+'手帐。本次没有任何素材；不得调用预设素材、模板中的素材或外部图片。可使用原创可编辑文字、荧光笔、程序绘制的图形、线条和笔迹。风格只约束视觉表达；自行选择一个具体的日常主题，用原创文字写出有内容和阅读节奏的观察，不要用空标题或占位文字凑版。';
  const prompt=(typeof task.intent==='string'&&task.intent.trim()?task.intent.trim():fallbackPrompt)+(process.env.SHIYE_ACCEPTANCE_INSTRUCTIONS||'');
  document=await createCreationDocument({draft:draft({mode:task.page.mode,ratio:task.page.ratio}),assets,
    aliases:Object.fromEntries(task.sourceContext.materials.map(m=>[m.alias,m.assetID])),title:style+'手帐',
    styles:[...new Set([style,...(Array.isArray(task.styles)?task.styles:[])])],pagePurposes:task.purposes,
    prompt,userText:task.userText||'',providedFacts:task.providedFacts||'',textMode:task.textMode||'automatic',textPresentation:task.textPresentation||'mixed',
    contentPolicy:task.contentPolicy||'original',processing:task.processing,requiredAssetIDs:task.requiredAssetIDs,materialPriority:task.sourceContext.materialPriority});
}
let studySeed=null;
if(seedPath){
 const bytes=await readFile(resolve(seedPath));
 document=await reissueStudySeed(JSON.parse(bytes),document,assets);
 studySeed={reissuedTask:true,file:resolve(seedPath),sha256:'sha256:'+createHash('sha256').update(bytes).digest('hex')};
}
if(!resume)await writeFile(join(output,'input-audit.json'),JSON.stringify({studyMode,intent:document.source.intent,references:studyReferences.records,seed:studySeed,blankStart:!seedPath,caseNotes:Boolean(notesPath),promptHash:createHash('sha256').update(document.source.intent).digest('hex')},null,2),{flag:'wx'});
const stageNotes=notesPath?await readFile(resolve(notesPath),'utf8'):'';
const renderer=await createHarnessRenderer({source:document.source,images,saveArtifact:async({png,pngHash,document,report})=>{
  const name='preview-'+pngHash.slice(7,23)+'.png';
  await writeFile(join(output,name),png,{mode:0o600});
  await writeFile(join(output,name+'.json'),JSON.stringify({report,document}),{mode:0o600});
  return name;
}});
if(!resume){
  initial=initialHarnessState({document,skills,brief:{style,page:task.page,intent:document.source.intent,contentPolicy:document.source.contentPolicy,processing:task.processing,priority:task.sourceContext.materialPriority},tray:await renderer.index(document),startedAt:started,deadlineAt:started+(Number(process.env.SHIYE_ACCEPTANCE_DEADLINE_MS)||570000)});
  await writeFile(join(output,'input.json'),JSON.stringify(initial),{mode:0o600,flag:'wx'});
}
if(study){
  initial.deadlineAt=started+study.deadlineMs;
  const names=stageDefinition.skills;
  initial.loadedSkills=names.map(name=>{const skill=skills.read(name);return {name,version:skill.version,selection:'overview:::0'};});
  initial.messages.push({role:'user',content:'本次是渐进式研究，当前只做 '+stageName+' 阶段；用户最终主题、疏密、文字和处理方向保持不变。此前阶段要求属于已经完成的研究步骤。'+stageDefinition.instruction+' 已预读以下 Skill，直接使用，不重复读取。creation_plan 通常只填简短 intent；所需参数已知时同轮合批编辑。生成 '+study.maxPreviews+' 张有变化的预览后停止；有下一轮时，必须先看上一张实际画面，自查纸层质感、图文阅读和遮挡再修改，不用几何通过代替视觉判断。不执行交付或付费独立审查；最多 '+study.maxRequests+' 次 HTTP 请求，保留正常深度思考输出预算。'+(stageNotes?'\n研究者观察与本阶段重点（不是用户经历）：'+stageNotes:'')+'\n'+names.map(name=>skills.read(name).guidance).join('\n\n')});
  await writeFile(join(output,'stage-input.json'),JSON.stringify(initial),{mode:0o600,flag:'wx'});
}
const seedParts=[];
if(studySeed){
 const view=await renderer.renderDraft(document);
 studySeed.previewHash=view.pngHash;studySeed.sceneRevision=view.sceneRevision;
 seedParts.push({type:'text',text:'工作空间 page；这是本阶段起点的真实页面，保留已成立的关系，在它上面继续当前研究步骤。'},{type:'image_url',image_url:{url:view.imageURL}});
 await writeFile(join(output,'seed.json'),JSON.stringify(studySeed,null,2),{mode:0o600});
}
const productionReferences=await loadStyleReferences({styles:document.source.styles});
attachStyleReferences(initial,productionReferences);
await writeFile(join(output,'production-references.json'),JSON.stringify(productionReferences.records,null,2));
const checkpointer=await new JournalCheckpointSaver(fileCheckpointJournal(join(output,'checkpoints.jsonl'))).restore();
const network=createCreativeNetwork({dns:process.env.SHIYE_CREATIVE_DNS||'system'});
const daemon=process.env.SHIYE_CREATIVE_SAM_ROOT?new SamDaemonClient(process.env.SHIYE_CREATIVE_SAM_ROOT):null;
const segmentMaterial=daemon?await createMaterialSegmenter({source:document.source,images,imageHashes:Object.fromEntries(task.materials.map(m=>[m.alias,m.sha256])),daemon,saveArtifact:async({proposal,png})=>{
  const name='cut-'+proposal.id+'.png';await writeFile(join(output,name),png,{mode:0o600});
  await writeFile(join(output,name+'.json'),JSON.stringify(proposal),{mode:0o600});return name;
}}):undefined;
const thinkingPolicy=study?'high':process.env.SHIYE_CREATIVE_THINKING_POLICY||'low';
// Use the provider's normal deep-thinking output allowance. A small forced
// max_tokens truncates reasoning + tool arguments and causes paid repeats.
const provider=createDeepSeekCreativeModel({key:process.env.SHIYE_CREATIVE_API_KEY,effort:process.env.SHIYE_CREATIVE_EFFORT||'high',fetcher:study?(url,options)=>study.fetch(network.fetcher,url,options):network.fetcher});
// Deliberately do not copy provider.compact/critique: no hidden paid auxiliary calls.
const requestInputs=[];let autonomousAuditCount=Math.max(0,...(await readdir(output)).map(name=>Number(name.match(/^autonomous-request-(\d+)-audit\.json$/)?.[1]||0)));
const autonomousProvider=auditAcceptanceModel(provider,async record=>{await writeFile(join(output,'autonomous-request-'+(++autonomousAuditCount)+'-audit.json'),JSON.stringify(record,null,2),{mode:0o600,flag:'wx'});});
const model=study?async options=>{
  study.beforeModel();
  // Reattach on each bounded request: rolling history can discard user images
  // after a help call. Both difficulty levels must see the same reference.
  const messages=[...options.messages];
  const visualParts=studyVisualParts({referenceParts:studyReferences.parts,seedParts,hasNewPreview:Boolean(study.snapshot().preview)});
  if(visualParts.length)messages.push({role:'user',content:visualParts});
  const tools=options.tools.filter(t=>!['creation_finish',...(studyMode!=='guided'?['search_references']:[]),...(layoutOnly?['creation_recipe']:[])].includes(t.function.name));
  requestInputs.push({request:requestInputs.length+1,studyMode,promptHash:createHash('sha256').update(document.source.intent).digest('hex'),references:studyReferences.records,seed:studySeed,imageCount:messages.reduce((n,m)=>n+(Array.isArray(m.content)?m.content.filter(p=>p.type==='image_url').length:0),0),tools:tools.map(t=>t.function.name)});
  await writeFile(join(output,'request-inputs.json'),JSON.stringify(requestInputs,null,2),{mode:0o600});
  const auditedMessages=messages.map(m=>({...m,content:Array.isArray(m.content)?m.content.map(p=>p.type==='image_url'?{type:p.type,sha256:createHash('sha256').update(p.image_url.url).digest('hex')}:p):m.content}));
  await writeFile(join(output,'request-'+requestInputs.length+'-audit.json'),JSON.stringify({messages:auditedMessages,toolNames:tools.map(t=>t.function.name)},null,2),{mode:0o600});
  return provider({...options,messages,tools});
}:autonomousProvider;
const stageRenderer=study?{...renderer,render:async(...args)=>{const capture=await renderer.render(...args);if(!studySeed||capture.sceneRevision!==studySeed.sceneRevision)study.capture({artifact:capture.artifact,pngHash:capture.pngHash,sceneRevision:capture.sceneRevision});return capture;}}:renderer;
const harness=createCreativeHarness({skills,checkpointer,...stageRenderer,segmentMaterial,reasoningPolicy:thinkingPolicy,capabilities:{glyphOutline:localGlyphOutline,edgeQuads:deriveMaterialEdgeQuads(document.source,images)},model,onProgress:e=>console.log(JSON.stringify(e))});
const studySignal=study?AbortSignal.timeout(Math.max(1,initial.deadlineAt-Date.now())):undefined;
try{
  const result=await harness.run({id:'acceptance',state:resume?undefined:initial,signal:studySignal});
  if(study)throw Object.assign(Error('阶段研究已停止'),{code:'LAYOUT_STUDY_STOP',reason:'harness-returned'});
  const evaluation=summarizeCreativeEvaluation(result.qualityFrames||[]);
  const report={status:result.status,totalMs:Date.now()-initial.startedAt,turns:result.turns,thinkingPolicy,loadedSkills:result.loadedSkills,skillResources,taskConstraints:{styles:document.source.styles,textMode:document.source.textMode,textPresentation:document.source.textPresentation,contentPolicy:document.source.contentPolicy},models:[...new Set((result.trace||[]).filter(e=>e.kind==='model'&&e.model).map(e=>e.model))],review:result.review,independentReviews:result.independentReviews||[],preview:result.preview,usage:result.usage,auxiliaryUsage:result.auxiliaryUsage||[],compactions:result.compactions||[],evaluation:evaluation.comparison,traceEvents:result.trace?.length||0,style,materialCount:task.materials.length,source:'existing-private-v3-package',liveApp:false,execution:{stage:stageName,seed:Boolean(seedPath),caseNotes:Boolean(notesPath),extraInstructions:Boolean(process.env.SHIYE_ACCEPTANCE_INSTRUCTIONS),preloadedSkills:Boolean(study),autonomousAuditCount,automaticCritique:typeof model.critique==='function',automaticCompaction:typeof model.compact==='function'}};
  await writeFile(join(output,'project.shiyeproject.json'),JSON.stringify(result.document),{mode:0o600});
  await writeFile(join(output,'evaluation.json'),JSON.stringify(evaluation,null,2),{mode:0o600});
  await writeFile(join(output,'trace.json'),JSON.stringify(result.trace||[],null,2),{mode:0o600});
  await writeFile(join(output,'report.json'),JSON.stringify(report,null,2),{mode:0o600});
  console.log(JSON.stringify(report));
}catch(error){
  const saved=await harness.state('acceptance');
  if(study){
    const budget=study.snapshot(),expected=error.code==='LAYOUT_STUDY_STOP'||studySignal.aborted;
    const report={status:expected?(budget.preview?'stage-captured':'stage-budget-exhausted'):'stage-failed',reason:studySignal.aborted?'deadline':error.reason||error.code||'FAILED',...budget,turns:saved?.turns,usage:saved?.usage||[],loadedSkills:saved?.loadedSkills||[],scope:stageDefinition.scope,studyMode,studyStage:stageName,seed:studySeed,completedWork:false,visualQualityPassed:false,preloadedSkills:true,auxiliaryModelCalls:false};
    if(saved){await writeFile(join(output,'stage-project.shiyeproject.json'),JSON.stringify(saved.document),{mode:0o600});await writeFile(join(output,'trace.json'),JSON.stringify(saved.trace||[],null,2),{mode:0o600});await writeFile(join(output,'stage-plan.json'),JSON.stringify(saved.plan||null,null,2),{mode:0o600});}
    await writeFile(join(output,'stage-report.json'),JSON.stringify(report,null,2),{mode:0o600});
    console.log(JSON.stringify(report));if(!expected)process.exitCode=1;
  }else{
  if(saved){await writeFile(join(output,'evaluation.json'),JSON.stringify(summarizeCreativeEvaluation(saved.qualityFrames||[]),null,2),{mode:0o600});await writeFile(join(output,'trace.json'),JSON.stringify(saved.trace||[],null,2),{mode:0o600});}
  await writeFile(join(output,'failure.json'),JSON.stringify({code:error.code||'FAILED',message:error.message,totalMs:Date.now()-initial.startedAt,turns:saved?.turns,results:saved?.results},null,2),{mode:0o600});
  console.error(JSON.stringify({code:error.code||'FAILED',message:error.message,output}));process.exitCode=1;
  }
}finally{daemon?.stop();await network.close();}
