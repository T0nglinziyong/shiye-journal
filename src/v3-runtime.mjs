import {inspectCreationDocument,creationHelp} from './creation-inspection.js';
import {verifyImageReference} from './image-reference-runtime.mjs';
import {creationTaskBrief,describeCreationGuidance} from './creation-guidance.js';
import {runGraphics} from './graphics-runtime.mjs';
import {auditCreationDesign} from './creation-design-audit.js';
import {auditRenderedPixels} from './creation-pixel-audit.js';
import {offlineFontCatalog} from './offline-font-catalog.mjs';
import {localGlyphOutline} from './creation-font-resolver.mjs';
import {statSync,readFileSync,writeFileSync,renameSync,mkdirSync,existsSync,rmSync} from 'node:fs';
import {hostname} from 'node:os';
import {createHash} from 'node:crypto';
import {applyCreationV2Batch,validateCreationV2Commands,describeCreationV2Command} from './creation-v2-commands.js';
import {applyCreationTransaction,creationSceneRevision} from './creation-transaction.js';
import {validateV3SceneDocument} from './v3-scene-schema.js';
import {validateWebScene,webSceneDocument,inspectWebScene} from './web-scene-workbench.js';
import {assetFromSourceSnapshot} from './material-anatomy.js';
import {craftSceneHash} from './craft-fingerprint.js';
import {loadOfflineCanvas,renderOfflinePNG} from './offline-node-preview.mjs';
import {buildMaterialLedger} from './material-ledger.js';
import {canonicalTaskSource} from './task-source.js';
import {validateMaterialDecisions} from './creation-material-decisions.js';
const sha=x=>'sha256:'+createHash('sha256').update(x).digest('hex');
const load=(p,max=8_000_000)=>{if(statSync(p).size>max)throw Error('文件过大：'+p);return JSON.parse(readFileSync(p,'utf8'));};
const save=(p,x)=>writeFileSync(p,JSON.stringify(x,null,2)+'\n');
const atomic=(p,x)=>{save(p+'.tmp',x);renameSync(p+'.tmp',p);};
const revision=creationSceneRevision;
const fail=(code,issue,other={})=>Object.assign(Error(issue),{code,...other});
function lockOwnerAlive(owner){
 if(!owner||owner.host!==hostname()||!Number.isSafeInteger(owner.pid)||owner.pid<=0)return true;
 try{process.kill(owner.pid,0);return true;}catch(error){return error.code!=='ESRCH';}
}
function withSceneLock(fn){
 const lock='work/.scene-write-lock',ownerPath=lock+'/owner.json';
 const owner={pid:process.pid,host:hostname(),createdAt:Date.now(),token:createHash('sha256').update(String(Math.random())).digest('hex')};
 for(let attempt=0;attempt<2;attempt++){
  try{mkdirSync(lock);writeFileSync(ownerPath,JSON.stringify(owner));break;}
  catch(error){
   if(error.code!=='EEXIST')throw error;
   if(attempt)throw fail('SCENE_BUSY','已有 Scene 写入操作正在进行；请核对并发进程后重试');
   let previous=null,age=0;try{previous=JSON.parse(readFileSync(ownerPath,'utf8'));}catch{}
   try{age=Date.now()-statSync(lock).mtimeMs;}catch{}
   const abandoned=previous?previous.host===hostname()&&age>=60_000&&!lockOwnerAlive(previous):age>=300_000;
   if(!abandoned)throw fail('SCENE_BUSY','已有 Scene 写入操作正在进行；请核对并发进程后重试');
   const stale=lock+'.stale-'+owner.token.slice(0,12);
   try{renameSync(lock,stale);rmSync(stale,{recursive:true,force:true});}catch{throw fail('SCENE_BUSY','旧写入锁状态已变化；请重试');}
  }
 }
 try{return fn();}finally{try{if(JSON.parse(readFileSync(ownerPath,'utf8')).token===owner.token)rmSync(lock,{recursive:true,force:true});}catch{}}
}
function verifiedImages(task){const images={};for(const m of task.materials){if(!m.image||!/^assets\/[A-Za-z0-9_-]+\.(png|webp|jpg)$/.test(m.image)||!existsSync(m.image))throw fail('ASSET_MISSING','素材图片缺失：'+m.alias);const bytes=readFileSync(m.image);if(sha(bytes)!==m.sha256)throw fail('ASSET_CHANGED','素材图片指纹不一致：'+m.alias);images[m.alias]=bytes;}return images;}
function pngSize(bytes){if(bytes.length<24||bytes.toString('ascii',12,16)!=='IHDR')throw fail('PNG_INVALID','PNG 预览无效');return {width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};}
async function pixelAdvisory(png,page,canvasModule){
 if(typeof canvasModule.createCanvas!=='function'||typeof canvasModule.loadImage!=='function')return null;
 const picture=await canvasModule.loadImage(png),canvas=canvasModule.createCanvas(picture.width,picture.height),context=canvas.getContext('2d');
 context.drawImage(picture,0,0);
 return auditRenderedPixels(context.getImageData(0,0,picture.width,picture.height).data,picture.width,picture.height,page);
}
export async function runV3(task,command,arg,{protocolVersion=2,full=false}={}){
 const started=performance.now(),source=task.sourceContext,assets=source.sourceSnapshots.map(s=>assetFromSourceSnapshot(s,{frozenRevision:true}));
 mkdirSync('output',{recursive:true});mkdirSync('work',{recursive:true});
 const doc=validateV3SceneDocument(load('scene.json'));
 if(canonicalTaskSource(doc.source)!==canonicalTaskSource(source))throw fail('SOURCE_CHANGED','scene.json 的只读来源与 TASK.json 不一致');
 const current=revision(doc);
 if(command==='brief'){process.stdout.write(JSON.stringify({ok:true,...creationTaskBrief(task)})+'\n');return;}
 if(command==='guide'){process.stdout.write(JSON.stringify({ok:true,...describeCreationGuidance(Array.isArray(arg)?arg:arg?[arg]:[])})+'\n');return;}
 if(command==='graphics'){runGraphics(arg,current);return;}
 if(command==='help'){process.stdout.write(JSON.stringify({ok:true,...creationHelp(),tools:[{name:'graphics',readOnly:true,help:'graphics help'}]})+'\n');return;}
 if(command==='describe'){const topics=Array.isArray(arg)?arg:[arg];const descriptions=(topics.length?topics:[undefined]).map(topic=>describeCreationV2Command(topic,{full}));process.stdout.write(JSON.stringify(descriptions.length===1?{ok:true,...descriptions[0]}:{ok:true,descriptions})+'\n');return;}
 if(command==='design-check'){const result={ok:true,sceneRevision:current,...auditCreationDesign(doc.page,{materials:task.materials,styles:task.styles})};save('output/design-advisory.json',result);process.stdout.write(JSON.stringify(result)+'\n');return;}
 if(command==='fonts'){process.stdout.write(JSON.stringify({ok:true,...offlineFontCatalog({full})})+'\n');return;}
 if(command==='info'){process.stdout.write(JSON.stringify({ok:true,tools:['graphics'],protocolVersion:2,supportedProtocolVersions:[2],taskId:source.bundleId,sceneRevision:current,sceneHash:craftSceneHash(doc.page),pageMode:doc.page.pageMode,physicalPageHeightMM:doc.page.physicalPageHeightMM,materials:task.materials.map(m=>({alias:m.alias,title:m.title,physicalWidthMM:m.physicalWidthMM,physicalHeightMM:m.physicalHeightMM})),commands:'node runtime/shiye.cjs apply work/commands.json'})+'\n');return;}
 if(command==='self-test'){
  const result={ok:false,node:process.version,renderer:null,fonts:'environment-dependent',hint:null};
  try{const canvas=await loadOfflineCanvas();result.ok=true;result.renderer=canvas.rendererBackend+'/shiye-scene-v2';result.fonts=existsSync('fonts/MaShanZheng-Regular.ttf')?'Ma Shan Zheng (bundled)':'environment-dependent';}catch(e){result.hint=e.message;}
  save('output/self-test.json',result);process.stdout.write(JSON.stringify(result)+'\n');if(!result.ok)process.exitCode=1;return;
 }
 if(command==='begin'){
  const path=arg||'work/commands.json';
  if(!/^work\/[A-Za-z0-9._-]+\.json$/.test(path))throw fail('COMMAND_PATH_INVALID','事务草稿必须写入 work 目录中的 JSON 文件');
  if(existsSync(path))throw fail('DRAFT_EXISTS','草稿已存在；请另选文件名或先处理原草稿');
  if(protocolVersion!==2)throw fail('COMMAND_PROTOCOL_INVALID','只接受统一协议 2');
  const draft={protocolVersion:2,transactionId:'tx-'+Date.now().toString(36)+'-'+createHash('sha256').update(String(Math.random())).digest('hex').slice(0,8),baseSceneRevision:current,operations:[]};
  atomic(path,draft);process.stdout.write(JSON.stringify({ok:true,path,...draft})+'\n');return;
 }
 if(command==='check'||command==='apply'){
  const input=load(arg||'work/commands.json');
  const applied=applyCreationTransaction(doc,input,assets,{dryRun:command==='check',glyphOutline:localGlyphOutline}),next=applied.document;
  if(command==='check'||applied.result.replayed){process.stdout.write(JSON.stringify(applied.result)+'\n');return;}
  // Scene and its receipt are one atomic file. Recheck content under the lock.
  withSceneLock(()=>{
   const latest=validateV3SceneDocument(load('scene.json'));
   if(revision(latest)!==current)throw fail('REVISION_CONFLICT','并发操作已修改 Scene',{currentSceneRevision:revision(latest)});
   const latestReceipts=latest.v3Transactions||{};
   if(latestReceipts[input.transactionId])throw fail('TRANSACTION_CONFLICT','事务已由并发操作提交；请重新读取 Scene');
   next.v3Transactions={...latestReceipts,[input.transactionId]:next.v3Transactions[input.transactionId]};atomic('scene.json',next);
  });
  for(const name of ['preview.png','preview-capture.json','preview-report.json','project.shiyeproject.json','manifest.json'])rmSync('output/'+name,{force:true});
  process.stdout.write(JSON.stringify(applied.result)+'\n');return;
 }
 const info=inspectWebScene(doc,assets);
 if(command==='inspect'){const result={...(full?info:inspectCreationDocument(doc)),sceneRevision:current,ledger:buildMaterialLedger(doc.page,assets),quality:info.quality};save('output/scene-summary.json',result);process.stdout.write(JSON.stringify(result)+'\n');return;}
 if(!['preview','pack','review'].includes(command))throw fail('UNKNOWN_COMMAND','支持 brief/guide/graphics/info/fonts/design-check/self-test/help/describe/begin/check/apply/preview/inspect/review/pack');
 const draft=validateWebScene(doc.page,source,assets),sceneHash=craftSceneHash(draft);
 if(command==='preview'){
  if(arg){
   if(!/^work\/[A-Za-z0-9._-]+\.json$/.test(arg))throw fail('COMMAND_PATH_INVALID','试做命令必须位于 work 目录');
   const input=load(arg);validateCreationV2Commands(input);
   if(input.baseSceneRevision!==current)throw fail('REVISION_CONFLICT','试做基准 Scene 已变化',{currentSceneRevision:current});
   const proposed=applyCreationV2Batch(doc,input,assets,{glyphOutline:localGlyphOutline}),page=validateWebScene(proposed.page,source,assets);
   const canvasModule=await loadOfflineCanvas(),{png,report}=await renderOfflinePNG(page,source,verifiedImages(task),canvasModule);
   mkdirSync('output/proposals',{recursive:true});const stem=input.transactionId;
   writeFileSync('output/proposals/'+stem+'.png',png);
   const advisory=auditCreationDesign(page,{materials:task.materials,styles:task.styles});
   const result={ok:true,proposal:true,baseSceneRevision:current,proposedSceneHash:report.sceneHash,pngHash:sha(png),path:'output/proposals/'+stem+'.png',geometryReview:{observations:advisory.observations,graphicVocabulary:advisory.graphicVocabulary,graphicScale:advisory.graphicScale,estimatedGraphicPaintFraction:advisory.estimatedGraphicPaintFraction,materialFrames:advisory.materialFrames,pages:advisory.pages},pixelReview:report.pixelReview||await pixelAdvisory(png,page,canvasModule)};
   atomic('output/proposals/'+stem+'.json',result);process.stdout.write(JSON.stringify(full?result:{ok:true,proposal:true,baseSceneRevision:current,proposedSceneHash:result.proposedSceneHash,path:result.path,diagnosticsPath:'output/proposals/'+stem+'.json',durationMs:Math.round(performance.now()-started),next:'打开实际 PNG 判断构图；详细诊断按需读取，不作为审美评分。'})+'\n');return;
  }
  const canvasModule=await loadOfflineCanvas(),{png,report}=await renderOfflinePNG(draft,source,verifiedImages(task),canvasModule),dimensions=pngSize(png);
  if(report.sceneHash!==sceneHash||dimensions.width!==Math.round(draft.canvas.width)||dimensions.height!==Math.round(draft.canvas.height))throw fail('RENDER_MISMATCH','渲染摘要或尺寸与当前 Scene 不符');
  writeFileSync('output/preview.png',png);
  const pixels=report.pixelReview||await pixelAdvisory(png,draft,canvasModule);
  const capture={sceneRevision:current,sceneHash,pngHash:sha(png),renderer:report.rendererVersion,rendererBackend:report.rendererBackend,fonts:report.fontReview,pixelReview:pixels,assets:Object.fromEntries(task.materials.map(m=>[m.alias,m.sha256])),...dimensions,renderedAt:new Date().toISOString(),visualReview:'pending'};
  const advisory=auditCreationDesign(draft,{materials:task.materials,styles:task.styles});
  atomic('output/preview-capture.json',capture);
  const result={ok:true,...capture,path:'output/preview.png',geometryReview:{observations:advisory.observations,graphicVocabulary:advisory.graphicVocabulary,graphicScale:advisory.graphicScale,estimatedGraphicPaintFraction:advisory.estimatedGraphicPaintFraction,materialFrames:advisory.materialFrames,pages:advisory.pages},pixelReview:pixels,durationMs:Math.round(performance.now()-started)};
  atomic('output/preview-report.json',result);
  process.stdout.write(JSON.stringify(full?result:{ok:true,sceneRevision:current,sceneHash,pngHash:capture.pngHash,path:result.path,...dimensions,renderer:capture.renderer,rendererBackend:capture.rendererBackend,diagnosticsPath:'output/preview-report.json',durationMs:result.durationMs,next:'打开实际 PNG 判断构图；详细诊断按需读取，不作为审美评分。'})+'\n');return;
 }
 if(command==='review'){
  if(!['pass','fail'].includes(arg))throw fail('REVIEW_RESULT_INVALID','使用 review pass 或 review fail');
  const capture=existsSync('output/preview-capture.json')?load('output/preview-capture.json'):null;
  if(!capture||capture.sceneRevision!==current||capture.sceneHash!==sceneHash)throw fail('PREVIEW_STALE','当前 Scene 尚无可审阅的正式预览');
  const advisory=auditCreationDesign(draft,{materials:task.materials,styles:task.styles});
  const reviewedPNG=readFileSync('output/preview.png');
  if(sha(reviewedPNG)!==capture.pngHash)throw fail('PREVIEW_STALE','预览 PNG 与当前记录不一致；先重新运行 preview');
  const pixels=capture.pixelReview||await pixelAdvisory(reviewedPNG,draft,await loadOfflineCanvas());
  const review={result:arg,source:'agent-declared',sceneRevision:current,pngHash:capture.pngHash,reviewedAt:new Date().toISOString(),geometryAdvisories:advisory.observations,pixelReview:pixels};
  atomic('output/review.json',review);process.stdout.write(JSON.stringify({ok:true,...review,reminder:'这是创作者声明；用真实 PNG 核对低笔触区和几何提示，若仍有显著问题应继续修改，不能据此宣称独立视觉验收通过。'})+'\n');return;
 }
 const imageReference=verifyImageReference(source);
 verifiedImages(task);validateMaterialDecisions(doc.materialDecisions,draft,source);
 const capture=existsSync('output/preview-capture.json')?load('output/preview-capture.json'):null,png=existsSync('output/preview.png')?readFileSync('output/preview.png'):null;
 if(!capture||!png||capture.sceneRevision!==current||capture.sceneHash!==sceneHash||capture.pngHash!==sha(png)||capture.renderer!=='shiye-scene-v2')throw fail('PREVIEW_STALE','当前 Scene 缺少同源 PNG；先运行 preview');
 const dimensions=pngSize(png);if(dimensions.width!==capture.width||dimensions.height!==capture.height)throw fail('PREVIEW_STALE','PNG 尺寸与预览记录不一致');
 const verified=await renderOfflinePNG(draft,source,verifiedImages(task),await loadOfflineCanvas());
 if(verified.report.rendererVersion!==capture.renderer||verified.report.rendererBackend!==capture.rendererBackend||sha(verified.png)!==capture.pngHash)throw fail('PREVIEW_STALE','PNG 与当前 Scene 的实际 Canvas 渲染不一致；请重新运行 preview');
 const result=webSceneDocument(source,draft,doc.title,doc.materialDecisions),bytes=JSON.stringify(result);writeFileSync('output/project.shiyeproject.json',bytes);
 const review=existsSync('output/review.json')?load('output/review.json'):null,visualReview=review?.sceneRevision===current&&review?.pngHash===capture.pngHash?{result:review.result,source:review.source}:null;
 const manifest={format:'shiye-v3-delivery',version:3,...(imageReference?{imageReference}:{}),sceneRevision:current,sceneHash,sceneJsonHash:sha(readFileSync('scene.json')),projectHash:sha(bytes),previewHash:capture.pngHash,renderer:capture.renderer,rendererBackend:capture.rendererBackend,fonts:capture.fonts,assets:capture.assets,physical:'passed',reading:info.quality.reading,visualReview,materialDecisions:doc.materialDecisions,createdAt:new Date().toISOString()};
 atomic('output/manifest.json',manifest);process.stdout.write(JSON.stringify({ok:true,...manifest,durationMs:Math.round(performance.now()-started)})+'\n');
}
