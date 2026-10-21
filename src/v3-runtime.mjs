import {statSync,readFileSync,writeFileSync,renameSync,mkdirSync,existsSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {applyCommandBatch,validateCommands} from './v3-commands.js';
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
const revision=doc=>{const {v3Transactions:_receipts,...state}=doc;return sha(JSON.stringify(state));};
const fail=(code,issue,other={})=>Object.assign(Error(issue),{code,...other});
function verifiedImages(task){const images={};for(const m of task.materials){if(!m.image||!/^assets\/[A-Za-z0-9_-]+\.(png|webp|jpg)$/.test(m.image)||!existsSync(m.image))throw fail('ASSET_MISSING','素材图片缺失：'+m.alias);const bytes=readFileSync(m.image);if(sha(bytes)!==m.sha256)throw fail('ASSET_CHANGED','素材图片指纹不一致：'+m.alias);images[m.alias]=bytes;}return images;}
function pngSize(bytes){if(bytes.length<24||bytes.toString('ascii',12,16)!=='IHDR')throw fail('PNG_INVALID','PNG 预览无效');return {width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};}
export async function runV3(task,command,arg){
 const started=performance.now(),source=task.sourceContext,assets=source.sourceSnapshots.map(s=>assetFromSourceSnapshot(s,{frozenRevision:true}));
 mkdirSync('output',{recursive:true});mkdirSync('work',{recursive:true});
 const doc=validateV3SceneDocument(load('scene.json'));
 if(canonicalTaskSource(doc.source)!==canonicalTaskSource(source))throw fail('SOURCE_CHANGED','scene.json 的只读来源与 TASK.json 不一致');
 const current=revision(doc);
 if(command==='info'){const result={ok:true,taskId:source.bundleId,sceneRevision:current,sceneHash:craftSceneHash(doc.page),pageMode:doc.page.pageMode,physicalPageHeightMM:doc.page.physicalPageHeightMM,materials:task.materials.map(m=>({alias:m.alias,title:m.title,physicalWidthMM:m.physicalWidthMM,physicalHeightMM:m.physicalHeightMM})),commands:'node runtime/shiye.cjs apply work/commands.json'};process.stdout.write(JSON.stringify(result)+'\n');return;}
 if(command==='self-test'){
  const result={ok:false,node:process.version,renderer:null,fonts:'environment-dependent',hint:null};
  try{await loadOfflineCanvas();result.ok=true;result.renderer='node-canvas/shiye-scene-v2';}
  catch(e){result.hint=e.message;}
  save('output/self-test.json',result);process.stdout.write(JSON.stringify(result)+'\n');if(!result.ok)process.exitCode=1;return;
 }
 if(command==='apply'){
  const input=load(arg||'work/commands.json');validateCommands(input);
  const receiptPath='work/transactions.json',receipts=doc.v3Transactions||{};
  const commandHash=sha(JSON.stringify(input)),prior=receipts[input.transactionId];
  if(prior){if(prior.commandHash!==commandHash)throw fail('TRANSACTION_CONFLICT','同一 transactionId 已用于不同命令');process.stdout.write(JSON.stringify({ok:true,replayed:true,...prior,currentSceneRevision:current})+'\n');return;}
  if(input.baseSceneRevision!==current)throw fail('REVISION_CONFLICT','Scene 已变化；请运行 info 获取当前 sceneRevision',{currentSceneRevision:current});
  const next=applyCommandBatch(doc,input,assets),nextRevision=revision(next);
  const updated={...receipts,[input.transactionId]:{transactionId:input.transactionId,commandHash,baseSceneRevision:current,sceneRevision:nextRevision,operations:input.operations.length,appliedAt:new Date().toISOString()}};
  next.v3Transactions=updated;
  validateV3SceneDocument(next);
  atomic('scene.json',next);
  atomic(receiptPath,updated);
  for(const name of ['preview.png','preview-capture.json','project.shiyeproject.json','manifest.json'])rmSync('output/'+name,{force:true});
  process.stdout.write(JSON.stringify({ok:true,...updated[input.transactionId]})+'\n');return;
 }
 const info=inspectWebScene(doc,assets);
 if(command==='inspect'){const result={...info,sceneRevision:current,ledger:buildMaterialLedger(doc.page,assets)};save('output/scene-summary.json',result);process.stdout.write(JSON.stringify(result)+'\n');return;}
 if(!['preview','pack'].includes(command))throw fail('UNKNOWN_COMMAND','支持 info/self-test/apply/preview/inspect/pack');
 const draft=validateWebScene(doc.page,source,assets),sceneHash=craftSceneHash(draft);
 if(command==='preview'){
  const images=verifiedImages(task);
  const {png,report}=await renderOfflinePNG(draft,source,images,await loadOfflineCanvas());
  const dimensions=pngSize(png);
  if(report.sceneHash!==sceneHash||dimensions.width!==Math.round(draft.canvas.width)||dimensions.height!==Math.round(draft.canvas.height))throw fail('RENDER_MISMATCH','渲染摘要或尺寸与当前 Scene 不符');
  writeFileSync('output/preview.png',png);
  const capture={sceneRevision:current,sceneHash,pngHash:sha(png),renderer:report.rendererVersion,fonts:'environment-dependent',assets:Object.fromEntries(task.materials.map(m=>[m.alias,m.sha256])),...dimensions,renderedAt:new Date().toISOString(),visualReview:'pending'};
  atomic('output/preview-capture.json',capture);
  process.stdout.write(JSON.stringify({ok:true,...capture,durationMs:Math.round(performance.now()-started)})+'\n');return;
 }
 verifiedImages(task);
 validateMaterialDecisions(doc.materialDecisions,draft,source);
 const capture=existsSync('output/preview-capture.json')?load('output/preview-capture.json'):null;
 const png=existsSync('output/preview.png')?readFileSync('output/preview.png'):null;
 if(!capture||!png||capture.sceneRevision!==current||capture.sceneHash!==sceneHash||capture.pngHash!==sha(png)||capture.renderer!=='shiye-scene-v2')throw fail('PREVIEW_STALE','当前 Scene 缺少同源 PNG；先运行 preview');
 const dimensions=pngSize(png);
 if(dimensions.width!==capture.width||dimensions.height!==capture.height)throw fail('PREVIEW_STALE','PNG 尺寸与预览记录不一致');
 const verified=await renderOfflinePNG(draft,source,verifiedImages(task),await loadOfflineCanvas());
 if(verified.report.rendererVersion!==capture.renderer||sha(verified.png)!==capture.pngHash)throw fail('PREVIEW_STALE','PNG 与当前 Scene 的实际 Canvas 渲染不一致；请重新运行 preview');
 const result=webSceneDocument(source,draft,doc.title,doc.materialDecisions),bytes=JSON.stringify(result);
 writeFileSync('output/project.shiyeproject.json',bytes);
 const manifest={format:'shiye-v3-delivery',version:3,sceneRevision:current,sceneHash,sceneJsonHash:sha(readFileSync('scene.json')),projectHash:sha(bytes),previewHash:capture.pngHash,renderer:capture.renderer,fonts:capture.fonts,assets:capture.assets,physical:'passed',reading:info.quality.reading,visualReview:capture.visualReview,materialDecisions:doc.materialDecisions,createdAt:new Date().toISOString()};
 atomic('output/manifest.json',manifest);
 process.stdout.write(JSON.stringify({ok:true,...manifest,durationMs:Math.round(performance.now()-started)})+'\n');
}
