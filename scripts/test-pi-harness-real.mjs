import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {draft} from '../src/domain.js';
import {createCreationDocument} from '../src/creation-document.js';
import {assetFromSourceSnapshot} from '../src/material-anatomy.js';
import {localGlyphOutline} from '../src/creation-font-resolver.mjs';
import {deriveMaterialEdgeQuads} from '../creative-agent/runtime/material-edge-quads.mjs';
import {initialHarnessState} from '../creative-agent/runtime/agent.mjs';
import {createPiCreativeHarness} from '../creative-agent/runtime/pi-agent.mjs';
import {loadCreationSkills} from '../creative-agent/runtime/skills.mjs';
import {createDeepSeekCreativeModel} from '../creative-agent/runtime/deepseek.mjs';
import {createHarnessRenderer} from '../creative-agent/runtime/renderer.mjs';
import {createCreativeNetwork} from '../creative-agent/runtime/network.mjs';
import {createMaterialSegmenter} from '../creative-agent/runtime/segmentation.mjs';
import {SamDaemonClient} from '../compute-server/sam-daemon-client.mjs';
import {summarizeCreativeEvaluation} from '../creative-agent/runtime/quality-evaluation.mjs';

const [packagePath,outputPath,style='丰富层叠',resumeFlag]=process.argv.slice(2);
if(!packagePath||!outputPath)throw Error('用法：node --env-file=<私有配置> scripts/test-pi-harness-real.mjs <v3任务包> <私有输出目录> [风格] [--resume]');
const started=Date.now(),input=resolve(packagePath),output=resolve(outputPath),resume=resumeFlag==='--resume';
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
let snapshot=null,initial,document;
if(resume){snapshot=JSON.parse(await readFile(join(output,'pi-checkpoint.json'),'utf8'));document=snapshot.state.document;initial=snapshot.state;}
else{
  const fallback=task.materials.length?`使用本次真实素材创作一份完成态的${style}手帐。图文共同构图，有具体内容与手作层次；不要做商品目录。`:`创作一份完成态的${style}手帐。没有任何实体素材；可用原创文字和可编辑图形。`;
  document=await createCreationDocument({draft:draft({mode:task.page.mode,ratio:task.page.ratio}),assets,
    aliases:Object.fromEntries(task.sourceContext.materials.map(m=>[m.alias,m.assetID])),title:style+'手帐',styles:[...new Set([style,...(task.styles||[])])],pagePurposes:task.purposes,
    prompt:(task.intent?.trim()||fallback)+(process.env.SHIYE_ACCEPTANCE_INSTRUCTIONS||''),userText:task.userText||'',providedFacts:task.providedFacts||'',
    contentPolicy:task.contentPolicy||'original',processing:task.processing,requiredAssetIDs:task.requiredAssetIDs,materialPriority:task.sourceContext.materialPriority});
}
const renderer=await createHarnessRenderer({source:document.source,images,saveArtifact:async({png,pngHash,document,report})=>{
  const name='preview-'+pngHash.slice(7,23)+'.png';
  await writeFile(join(output,name),png,{mode:0o600});
  await writeFile(join(output,name+'.json'),JSON.stringify({report,document}),{mode:0o600});
  return name;
}});
if(!resume){initial=initialHarnessState({document,skills,brief:{style,page:task.page,intent:document.source.intent,contentPolicy:document.source.contentPolicy,processing:task.processing,priority:task.sourceContext.materialPriority},tray:await renderer.index(document),startedAt:started,deadlineAt:started+(Number(process.env.SHIYE_ACCEPTANCE_DEADLINE_MS)||570000)});await writeFile(join(output,'input.json'),JSON.stringify(initial),{mode:0o600});}
const network=createCreativeNetwork({dns:process.env.SHIYE_CREATIVE_DNS||'system'});
const daemon=process.env.SHIYE_CREATIVE_SAM_ROOT?new SamDaemonClient(process.env.SHIYE_CREATIVE_SAM_ROOT):null;
const segmentMaterial=daemon?await createMaterialSegmenter({source:document.source,images,imageHashes:Object.fromEntries(task.materials.map(m=>[m.alias,m.sha256])),daemon,saveArtifact:async({proposal,png})=>{
  const name='cut-'+proposal.id+'.png';await writeFile(join(output,name),png,{mode:0o600});return name;
}}):undefined;
const harness=createPiCreativeHarness({skills,...renderer,segmentMaterial,capabilities:{glyphOutline:localGlyphOutline,edgeQuads:deriveMaterialEdgeQuads(document.source,images)},
  model:createDeepSeekCreativeModel({key:process.env.SHIYE_CREATIVE_API_KEY,effort:process.env.SHIYE_CREATIVE_EFFORT||'high',fetcher:network.fetcher}),
  onProgress:event=>console.log(JSON.stringify(event)),
  checkpoint:async checkpoint=>writeFile(join(output,'pi-checkpoint.json'),JSON.stringify(checkpoint),{mode:0o600})});
try{
  const result=await harness.run({id:'pi-acceptance',state:initial,snapshot});
  const evaluation=summarizeCreativeEvaluation(result.qualityFrames||[]);
  const report={status:result.status,totalMs:Date.now()-initial.startedAt,turns:result.turns,loadedSkills:result.loadedSkills,review:result.review,independentReviews:result.independentReviews||[],preview:result.preview,usage:result.usage,auxiliaryUsage:result.auxiliaryUsage||[],compactions:result.compactions||[],evaluation:evaluation.comparison,traceEvents:result.trace?.length||0,style,materialCount:task.materials.length,runtime:'pi-agent-core'};
  await writeFile(join(output,'project.shiyeproject.json'),JSON.stringify(result.document),{mode:0o600});
  await writeFile(join(output,'evaluation.json'),JSON.stringify(evaluation,null,2),{mode:0o600});
  await writeFile(join(output,'trace.json'),JSON.stringify(result.trace||[],null,2),{mode:0o600});
  await writeFile(join(output,'report.json'),JSON.stringify(report,null,2),{mode:0o600});
  console.log(JSON.stringify(report));
}catch(error){
  const saved=JSON.parse(await readFile(join(output,'pi-checkpoint.json'),'utf8').catch(()=>JSON.stringify({state:initial})));
  const state=saved.state;
  await writeFile(join(output,'failure.json'),JSON.stringify({code:error.code||'FAILED',message:error.message,totalMs:Date.now()-initial.startedAt,turns:state.turns,preview:state.preview,toolErrors:state.trace?.filter(e=>e.kind==='tool'&&!e.ok)},null,2),{mode:0o600});
  console.error(JSON.stringify({code:error.code||'FAILED',message:error.message,output}));process.exitCode=1;
}finally{daemon?.stop();await network.close();}
