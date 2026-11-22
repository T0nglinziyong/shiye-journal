import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {draft} from '../src/domain.js';
import {createCreationDocument} from '../src/creation-document.js';
import {assetFromSourceSnapshot} from '../src/material-anatomy.js';
import {localGlyphOutline} from '../src/creation-font-resolver.mjs';
import {createCreativeHarness,initialHarnessState} from '../compute-server/harness/agent.mjs';
import {loadCreationSkills} from '../compute-server/harness/skills.mjs';
import {JournalCheckpointSaver,fileCheckpointJournal} from '../compute-server/harness/checkpoints.mjs';
import {createDeepSeekCreativeModel} from '../compute-server/harness/deepseek.mjs';
import {createHarnessRenderer} from '../compute-server/harness/renderer.mjs';
import {createCreativeNetwork} from '../compute-server/harness/network.mjs';
import {createMaterialSegmenter} from '../compute-server/harness/segmentation.mjs';
import {SamDaemonClient} from '../compute-server/sam-daemon-client.mjs';
import {summarizeCreativeEvaluation} from '../compute-server/harness/quality-evaluation.mjs';

const [packagePath,outputPath,style='复古收藏',resumeFlag]=process.argv.slice(2);
if(!packagePath||!outputPath)throw Error('用法：node --env-file=<私有配置> scripts/test-creative-harness-real.mjs <当前任务包目录> <私有输出目录> [风格] [--resume]');
const started=Date.now(),input=resolve(packagePath),output=resolve(outputPath),resume=resumeFlag==='--resume';
await mkdir(output,{recursive:true,mode:0o700});
const task=JSON.parse(await readFile(join(input,'TASK.json'),'utf8'));
if(task.format!=='shiye-gpt-creation-package'||task.version!==3||task.protocolVersion!==2)throw Error('只接受当前 v3 / 协议 2 任务包');
const images={};
for(const material of task.materials){
  if(!/^assets\/[a-zA-Z0-9_-]+\.(png|jpg|webp)$/.test(material.image))throw Error('素材路径不合规');
  const bytes=await readFile(join(input,material.image));
  if('sha256:'+createHash('sha256').update(bytes).digest('hex')!==material.sha256)throw Error('真实素材指纹不一致：'+material.alias);
  images[material.alias]=bytes;
}
const skills=await loadCreationSkills(),assets=task.sourceContext.sourceSnapshots.map(s=>assetFromSourceSnapshot(s,{frozenRevision:true}));
let document,initial;
if(resume){initial=JSON.parse(await readFile(join(output,'input.json'),'utf8'));document=initial.document;}
else {
  const prompt=task.materials.length
    ?'使用本次真实素材创作一份完成态的'+style+'手帐。图文共同构图，有具体内容与手作层次；不要做商品目录。'
    :'创作一份完成态的'+style+'手帐。本次没有任何素材；不得调用预设素材、模板中的素材或外部图片。可使用原创可编辑文字、荧光笔、程序绘制的图形、线条和笔迹。风格只约束视觉表达；自行选择一个具体的日常主题，用原创文字写出有内容和阅读节奏的观察，不要用空标题或占位文字凑版。';
  document=await createCreationDocument({draft:draft({mode:task.page.mode,ratio:task.page.ratio}),assets,
    aliases:Object.fromEntries(task.sourceContext.materials.map(m=>[m.alias,m.assetID])),title:style+'手帐',
    styles:[style],prompt:prompt+(process.env.SHIYE_ACCEPTANCE_INSTRUCTIONS||''),
    contentPolicy:task.contentPolicy||'original',processing:task.processing,requiredAssetIDs:task.requiredAssetIDs,materialPriority:task.sourceContext.materialPriority});
}
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
const checkpointer=await new JournalCheckpointSaver(fileCheckpointJournal(join(output,'checkpoints.jsonl'))).restore();
const network=createCreativeNetwork({dns:process.env.SHIYE_CREATIVE_DNS||'system'});
const daemon=process.env.SHIYE_CREATIVE_SAM_ROOT?new SamDaemonClient(process.env.SHIYE_CREATIVE_SAM_ROOT):null;
const segmentMaterial=daemon?await createMaterialSegmenter({source:document.source,images,imageHashes:Object.fromEntries(task.materials.map(m=>[m.alias,m.sha256])),daemon,saveArtifact:async({proposal,png})=>{
  const name='cut-'+proposal.id+'.png';await writeFile(join(output,name),png,{mode:0o600});
  await writeFile(join(output,name+'.json'),JSON.stringify(proposal),{mode:0o600});return name;
}}):undefined;
const harness=createCreativeHarness({skills,checkpointer,...renderer,segmentMaterial,capabilities:{glyphOutline:localGlyphOutline},model:createDeepSeekCreativeModel({key:process.env.SHIYE_CREATIVE_API_KEY,effort:process.env.SHIYE_CREATIVE_EFFORT||'high',fetcher:network.fetcher}),onProgress:e=>console.log(JSON.stringify(e))});
try{
  const result=await harness.run({id:'acceptance',state:resume?undefined:initial});
  const evaluation=summarizeCreativeEvaluation(result.qualityFrames||[]);
  const report={status:result.status,totalMs:Date.now()-initial.startedAt,turns:result.turns,loadedSkills:result.loadedSkills,review:result.review,preview:result.preview,usage:result.usage,evaluation:evaluation.comparison,traceEvents:result.trace?.length||0,style,materialCount:task.materials.length,source:'existing-private-v3-package',liveApp:false};
  await writeFile(join(output,'project.shiyeproject.json'),JSON.stringify(result.document),{mode:0o600});
  await writeFile(join(output,'evaluation.json'),JSON.stringify(evaluation,null,2),{mode:0o600});
  await writeFile(join(output,'trace.json'),JSON.stringify(result.trace||[],null,2),{mode:0o600});
  await writeFile(join(output,'report.json'),JSON.stringify(report,null,2),{mode:0o600});
  console.log(JSON.stringify(report));
}catch(error){
  const saved=await harness.state('acceptance');
  if(saved){await writeFile(join(output,'evaluation.json'),JSON.stringify(summarizeCreativeEvaluation(saved.qualityFrames||[]),null,2),{mode:0o600});await writeFile(join(output,'trace.json'),JSON.stringify(saved.trace||[],null,2),{mode:0o600});}
  await writeFile(join(output,'failure.json'),JSON.stringify({code:error.code||'FAILED',message:error.message,totalMs:Date.now()-initial.startedAt,turns:saved?.turns,results:saved?.results},null,2),{mode:0o600});
  console.error(JSON.stringify({code:error.code||'FAILED',message:error.message,output}));process.exitCode=1;
}finally{daemon?.stop();await network.close();}
