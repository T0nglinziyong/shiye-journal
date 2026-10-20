import {statSync,readFileSync,writeFileSync,renameSync,mkdirSync,rmSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {compileWebSceneInput,applyWebSceneCommands,validateWebScene,webSceneDocument,inspectWebScene} from './web-scene-workbench.js';
import {assetFromSourceSnapshot} from './material-anatomy.js';
import {craftSceneHash} from './craft-fingerprint.js';
import {loadOfflineCanvas,renderOfflinePNG} from './offline-node-preview.mjs';
import {renderOfflinePreviewSVG} from './offline-preview-svg.js';
import {buildMaterialLedger} from './material-ledger.js';
import {canonicalTaskSource} from './task-source.js';
import {validateMaterialDecisions} from './creation-material-decisions.js';
const load=(file,limit=8_000_000)=>{if(statSync(file).size>limit)throw Error('工作数据不能超过 '+limit/1_000_000+' MB');return JSON.parse(readFileSync(file,'utf8'));};
const save=(file,value)=>writeFileSync(file,JSON.stringify(value,null,2)+'\n');
const hash=value=>'sha256:'+createHash('sha256').update(value).digest('hex');
const pngSize=bytes=>{
  if(bytes.length<24||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||bytes.toString('ascii',12,16)!=='IHDR')throw Error('PNG 预览文件无效，请重新运行 preview');
  return {width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};
};
const commit=doc=>{save('scene.json.tmp',doc);renameSync('scene.json.tmp','scene.json');};
export async function runWebWorkbench(context,command){
  const started=performance.now();
  mkdirSync('output',{recursive:true});
  const source=context.source,assets=source.sourceSnapshots.map(s=>assetFromSourceSnapshot(s,{frozenRevision:true}));
  const report={version:1,structure:'failed',physical:'not-run',visual:'unavailable',reading:'pending',command};
  try{
    if(['compile','apply','preview'].includes(command))for(const name of ['project.shiyeproject.json','delivery-manifest.json','构图预览.svg','preview.png','preview-capture.json'])rmSync('output/'+name,{force:true});
    if(command==='self-test'){
      await loadOfflineCanvas();
      const result={node:process.version,runtime:'node-canvas',browser:'not-required',font:'environment-dependent',sceneVersion:2};
      validateWebScene(webSceneDocument(source,source.baseDraft).page,source,assets,{final:false});
      save('output/self-test.json',result);process.stdout.write(JSON.stringify(result)+'\n');return;
    }
    let doc=load('scene.json');
    if(canonicalTaskSource(doc.source)!==canonicalTaskSource(source))throw Error('工作文件 source 与原始任务不一致');
    if(doc.format!=='shiye-editable-project'||doc.version!==1||doc.tools!==undefined||doc.plan!==undefined)throw Error('工作文件只接受完整 page Scene');
    if(['compile','apply'].includes(command)){
      const input=load(process.argv[3]||(command==='compile'?'instructions.json':'commands.json'));
      if(command==='apply')doc=applyWebSceneCommands(doc,input,assets);
      else doc=compileWebSceneInput(doc,input,assets);
      commit(doc);
      // Old pictures and final files may never masquerade as a new result.
      for(const name of ['构图预览.svg','preview.png','preview-capture.json','project.shiyeproject.json','delivery-manifest.json'])rmSync('output/'+name,{force:true});
      const info=inspectWebScene(doc,assets);save('output/scene-summary.json',info);
      process.stdout.write(JSON.stringify({ok:true,sceneHash:info.sceneHash})+'\n');return;
    }
    // A compact design can be compiled and rendered in one invocation. Commit the
    // generated Scene before rendering so the preview and subsequent pack use
    // the same editable snapshot. Without an input path, preview keeps the
    // existing Scene (including any precise edits made with apply).
    if(command==='preview'&&process.argv[3]){
      doc=compileWebSceneInput(doc,load(process.argv[3]),assets);
      commit(doc);
    }
    if(command==='inspect'){const info=inspectWebScene(doc,assets);save('output/scene-summary.json',info);process.stdout.write(JSON.stringify(info,null,2)+'\n');return;}
    if(!['preview','validate','pack',undefined].includes(command))throw Error('未知工作台命令');
    for(const name of ['project.shiyeproject.json','delivery-manifest.json'])rmSync('output/'+name,{force:true});
    const draft=validateWebScene(doc.page,source,assets),sceneHash=craftSceneHash(draft);
    Object.assign(report,{structure:'passed',physical:'current-rules-passed',sceneHash,compiledSceneHash:sceneHash,taskId:source.bundleId,renderer:'node-canvas/shiye-scene-v2'});
    const info=inspectWebScene(doc,assets);save('output/scene-summary.json',info);save('output/material-ledger.json',buildMaterialLedger(draft,assets));
    if(command==='preview'){
      const previews=Object.fromEntries(context.materials.map(m=>[m.alias,m.preview&&/^materials\/[A-Za-z0-9_-]+\.(png|webp)$/.test(m.preview)&&existsSync(m.preview)?readFileSync(m.preview):null]));
      const renderStarted=performance.now(),{png,report:renderReport}=await renderOfflinePNG(draft,source,previews,await loadOfflineCanvas());
      report.renderMs=Math.round(performance.now()-renderStarted);
      if(png.length>16_000_000)throw Error('PNG 预览超过 16 MB');
      const dimensions=pngSize(png);
      if(dimensions.width!==renderReport.width||dimensions.height!==renderReport.height||renderReport.sceneHash!==sceneHash)throw Error('PNG 与当前 Scene 的尺寸或摘要不一致');
      writeFileSync('output/preview.png',png);
      writeFileSync('output/构图预览.svg',renderOfflinePreviewSVG(draft,source,previews));
      report.visual='manual-review-required';report.previewSceneHash=sceneHash;
      save('output/preview-capture.json',{sceneHash,pngHash:hash(png),renderer:renderReport.rendererVersion,...dimensions,visualReview:'manual-required',renderReport});
    }
    if(command==='pack'){
      validateMaterialDecisions(doc.materialDecisions,draft,source);
      const capture=existsSync('output/preview-capture.json')?load('output/preview-capture.json'):null;
      const png=existsSync('output/preview.png')?readFileSync('output/preview.png'):null;
      if(!capture||capture.sceneHash!==sceneHash||!png||capture.pngHash!==hash(png)||capture.renderer!=='shiye-scene-v2')throw Error('缺少最终 Scene 的 PNG 预览，请运行 preview 后再 pack');
      const dimensions=pngSize(png);
      if(dimensions.width!==capture.width||dimensions.height!==capture.height||dimensions.width!==Math.round(draft.canvas.width)||dimensions.height!==Math.round(draft.canvas.height))throw Error('PNG 预览尺寸与最终 Scene 不一致，请重新运行 preview');
      const result=webSceneDocument(source,draft,doc.title,doc.materialDecisions),bytes=JSON.stringify(result);
      writeFileSync('output/project.shiyeproject.json',bytes);
      save('output/delivery-manifest.json',{format:'shiye-scene-delivery',version:1,sceneHash,jsonHash:hash(bytes),pngHash:capture.pngHash,renderer:capture.renderer,reading:info.quality.reading,deliverables:['project.shiyeproject.json','preview.png'],visualReview:'manual-required',fontReview:'device-dependent'});
    }
    report.durationMs=Math.round(performance.now()-started);
    save('output/validation-report.json',report);process.stdout.write(JSON.stringify({ok:true,...report})+'\n');
  }catch(error){
    Object.assign(report,{structure:'failed',code:error.code||'SCENE_INVALID',issue:error.message,repair:'查看问题字段与 inspect，修改 commands 或 page 后重新 validate/preview；未改动工作文件',durationMs:Math.round(performance.now()-started)});
    save('output/validation-report.json',report);process.stderr.write(JSON.stringify(report)+'\n');process.exitCode=1;
  }
}
