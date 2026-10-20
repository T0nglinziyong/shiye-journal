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
import {compileCompositionSketch,validateCompositionOptions} from './web-composition-sketch.js';
import {sceneLayerEntries} from './scene-v2.js';
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
    if(command==='compare'){
      for(const name of ['composition-options.png','composition-options.json'])rmSync('output/'+name,{force:true});
      const base=load('scene.json'),options=validateCompositionOptions(load(process.argv[3]||'composition-options.json',250_000));
      if(canonicalTaskSource(base.source)!==canonicalTaskSource(source))throw Error('候选构图的 source 与原始任务不一致');
      const baseHash=craftSceneHash(validateWebScene(base.page,source,assets,{final:false}));
      const canvas=await loadOfflineCanvas(),previews=Object.fromEntries(context.materials.map(m=>[m.alias,m.preview&&/^materials\/[A-Za-z0-9_-]+\.(png|webp)$/.test(m.preview)&&existsSync(m.preview)?readFileSync(m.preview):null]));
      const width=640,pad=18,label=72,thumbHeight=Math.round(width*base.page.canvas.height/base.page.canvas.width),cardHeight=label+thumbHeight+pad;
      const sheet=canvas.createCanvas(width*options.length+pad*(options.length+1),cardHeight+pad*2),ctx=sheet.getContext('2d');
      ctx.fillStyle='#f5f5f0';ctx.fillRect(0,0,sheet.width,sheet.height);
      const results=[],decodedCache=new Map();
      for(const [index,option] of options.entries()){
        const optionStarted=performance.now(),{doc,writingAreas}=compileCompositionSketch(base,option,assets);
        const draft=validateWebScene(doc.page,source,assets,{final:false}),sceneHash=craftSceneHash(draft);
        const {png}=await renderOfflinePNG(draft,source,previews,canvas,{decodedCache}),preview=await canvas.loadImage(png);
        const left=pad+index*(width+pad),top=pad+label;
        ctx.fillStyle='#ffffff';ctx.fillRect(left-pad/2,pad/2,width+pad,cardHeight+pad);
        ctx.drawImage(preview,left,top,width,thumbHeight);
        // Blue frames mark proposed writing space; they are comparison guides,
        // never persisted as fake paper or physical material layers.
        for(const area of writingAreas){
          ctx.strokeStyle='#246d9a';ctx.lineWidth=2;ctx.setLineDash([7,5]);
          ctx.strokeRect(left+area.x*width,top+area.y*thumbHeight,area.width*width,area.height*thumbHeight);
          ctx.setLineDash([]);
        }
        ctx.fillStyle='#30463d';ctx.font='bold 25px sans-serif';ctx.fillText(option.id.toUpperCase(),left+8,pad+30);
        ctx.font='18px sans-serif';ctx.fillText(option.idea.slice(0,25),left+8,pad+58);
        const visible=new Set(sceneLayerEntries(draft).filter(entry=>entry.kind==='material'&&!entry.value.isParked&&!entry.value.hidden&&(entry.value.opacity??1)>0&&entry.parents.every(parent=>!parent.hidden&&(parent.opacity??1)>0)).map(entry=>entry.value.assetID));
        results.push({id:option.id,idea:option.idea,sceneHash,materialCount:visible.size,textCount:draft.textBlocks.length,writingAreas:writingAreas.length,missingRequired:source.materials.filter(m=>(source.requiredAssetIDs||[]).includes(m.assetID)&&!visible.has(m.assetID)).map(m=>m.alias),renderMs:Math.round(performance.now()-optionStarted)});
      }
      const image=sheet.toBuffer('image/png');writeFileSync('output/composition-options.png',image);
      const comparison={version:1,baseSceneHash:baseHash,optionsHash:hash(readFileSync(process.argv[3]||'composition-options.json')),imageHash:hash(image),options:results,durationMs:Math.round(performance.now()-started),visualReview:'manual-required'};
      save('output/composition-options.json',comparison);process.stdout.write(JSON.stringify({ok:true,...comparison})+'\n');return;
    }
    if(command==='select'){
      const id=process.argv[3],base=load('scene.json'),comparison=load('output/composition-options.json'),path=process.argv[4]||'composition-options.json';
      if(canonicalTaskSource(base.source)!==canonicalTaskSource(source))throw Error('工作文件 source 与原始任务不一致');
      if(comparison.baseSceneHash!==craftSceneHash(validateWebScene(base.page,source,assets,{final:false}))||comparison.optionsHash!==hash(readFileSync(path)))throw Error('候选构图或工作场景已变化，请重新运行 compare');
      const option=validateCompositionOptions(load(path,250_000)).find(item=>item.id===id),record=comparison.options.find(item=>item.id===id);
      if(!option||!record)throw Error('找不到已预览的候选构图：'+id);
      const {doc}=compileCompositionSketch(base,option,assets);
      if(craftSceneHash(validateWebScene(doc.page,source,assets,{final:false}))!==record.sceneHash)throw Error('候选画面摘要已变化，请重新运行 compare');
      commit(doc);
      for(const name of ['构图预览.svg','preview.png','preview-capture.json','project.shiyeproject.json','delivery-manifest.json'])rmSync('output/'+name,{force:true});
      save('output/composition-selection.json',{optionId:id,sceneHash:record.sceneHash,idea:record.idea,selectedAt:new Date().toISOString()});
      process.stdout.write(JSON.stringify({ok:true,selected:id,sceneHash:record.sceneHash,durationMs:Math.round(performance.now()-started)})+'\n');return;
    }
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
