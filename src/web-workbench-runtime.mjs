import {statSync,readFileSync,writeFileSync,renameSync,mkdirSync,rmSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {compileWebSceneInput,applyWebSceneCommands,validateWebScene,webSceneDocument,inspectWebScene} from './web-scene-workbench.js';
import {assetFromSourceSnapshot} from './material-anatomy.js';
import {craftSceneHash} from './craft-fingerprint.js';
import {offlineBrowserPage} from './offline-browser-page.js';
import {offlineBrowserSource} from './generated/offline-browser-source.js';
import {renderOfflinePreviewSVG} from './offline-preview-svg.js';
import {buildMaterialLedger} from './material-ledger.js';
import {canonicalTaskSource} from './task-source.js';
const load=(file,limit=8_000_000)=>{if(statSync(file).size>limit)throw Error('工作数据不能超过 '+limit/1_000_000+' MB');return JSON.parse(readFileSync(file,'utf8'));};
const save=(file,value)=>writeFileSync(file,JSON.stringify(value,null,2)+'\n');
const hash=value=>'sha256:'+createHash('sha256').update(value).digest('hex');
const commit=doc=>{save('scene.json.tmp',doc);renameSync('scene.json.tmp','scene.json');};
export async function runWebWorkbench(context,command){
  mkdirSync('output',{recursive:true});
  const source=context.source,assets=source.sourceSnapshots.map(s=>assetFromSourceSnapshot(s,{frozenRevision:true}));
  const report={version:1,structure:'failed',physical:'not-run',visual:'unavailable',reading:'pending',command};
  try{
    if(['compile','apply','preview','pack'].includes(command))for(const name of ['project.shiyeproject.json','delivery-manifest.json','画面预览.html','构图预览.svg'].filter(n=>command!=='pack'||!n.endsWith('.html')&&!n.endsWith('.svg')))rmSync('output/'+name,{force:true});
    if(['compile','apply','preview','save-preview'].includes(command))for(const name of ['preview.png','preview-capture.json'])rmSync('output/'+name,{force:true});
    if(command==='self-test'){
      const result={node:process.version,runtime:'self-contained',browser:'not-tested',font:'not-tested',sceneVersion:2};
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
      for(const name of ['画面预览.html','构图预览.svg','project.shiyeproject.json','delivery-manifest.json'])rmSync('output/'+name,{force:true});
      const info=inspectWebScene(doc,assets);save('output/scene-summary.json',info);
      process.stdout.write(JSON.stringify({ok:true,sceneHash:info.sceneHash})+'\n');return;
    }
    if(command==='inspect'){const info=inspectWebScene(doc,assets);save('output/scene-summary.json',info);process.stdout.write(JSON.stringify(info,null,2)+'\n');return;}
    if(!['preview','save-preview','validate','pack',undefined].includes(command))throw Error('未知工作台命令');
    for(const name of ['project.shiyeproject.json','delivery-manifest.json'])rmSync('output/'+name,{force:true});
    if(command==='preview')for(const name of ['画面预览.html','构图预览.svg'])rmSync('output/'+name,{force:true});
    const draft=validateWebScene(doc.page,source,assets),sceneHash=craftSceneHash(draft);
    Object.assign(report,{structure:'passed',physical:'current-rules-passed',sceneHash,compiledSceneHash:sceneHash,taskId:source.bundleId,browserRenderer:'shiye-canvas-v2'});
    const info=inspectWebScene(doc,assets);save('output/scene-summary.json',info);save('output/material-ledger.json',buildMaterialLedger(draft,assets));
    if(command==='preview'){
      const previews=Object.fromEntries(context.materials.map(m=>[m.alias,m.preview&&/^materials\/[A-Za-z0-9_-]+\.(png|webp)$/.test(m.preview)&&existsSync(m.preview)?readFileSync(m.preview):null]));
      writeFileSync('output/构图预览.svg',renderOfflinePreviewSVG(draft,source,previews));
      writeFileSync('output/画面预览.html',offlineBrowserPage(draft,source,previews,offlineBrowserSource));
      report.visual='browser-review-required';report.previewSceneHash=sceneHash;
      save('output/preview-manifest.json',{sceneHash,htmlHash:hash(readFileSync('output/画面预览.html')),visualReview:'not-verified'});
    }
    if(command==='save-preview'){
      const capture=load(process.argv[3]||'output/canvas-capture.json',24_000_000);
      if(capture.sceneHash!==sceneHash)throw Error('PNG 来自旧 Scene，请重新渲染并导出');
      if(typeof capture.png!=='string'||!/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(capture.png))throw Error('预览必须为实际 Canvas 导出的 PNG');
      const png=Buffer.from(capture.png.split(',')[1],'base64');
      if(png.length<33||png.length>16_000_000||png.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||png.toString('ascii',12,16)!=='IHDR')throw Error('PNG 数据无效或超过 16 MB');
      if(png.readUInt32BE(16)!==Math.round(draft.canvas.width)||png.readUInt32BE(20)!==Math.round(draft.canvas.height))throw Error('PNG 尺寸与当前画布不一致');
      writeFileSync('output/preview.png',png);
      save('output/preview-capture.json',{sceneHash,pngHash:hash(png),visualReview:'model-must-inspect-actual-image'});
    }
    if(command==='pack'){
      const preview=existsSync('output/preview-manifest.json')?load('output/preview-manifest.json'):null;
      if(!preview||preview.sceneHash!==sceneHash||!existsSync('output/画面预览.html')||preview.htmlHash!==hash(readFileSync('output/画面预览.html')))throw Error('最终 Scene 尚未生成对应预览，请运行 preview 后再 pack');
      const capture=existsSync('output/preview-capture.json')?load('output/preview-capture.json'):null;
      if(!capture||capture.sceneHash!==sceneHash||!existsSync('output/preview.png')||capture.pngHash!==hash(readFileSync('output/preview.png')))throw Error('缺少最终 Scene 的 PNG 预览，请从真实 Canvas 导出后运行 save-preview');
      const result=webSceneDocument(source,draft,doc.title),bytes=JSON.stringify(result,null,2)+'\n';
      writeFileSync('output/project.shiyeproject.json',bytes);
      save('output/delivery-manifest.json',{format:'shiye-scene-delivery',version:1,sceneHash,jsonHash:hash(bytes),previewHtmlHash:preview.htmlHash,pngHash:capture.pngHash,deliverables:['project.shiyeproject.json','preview.png'],visualReview:'model-must-inspect-actual-image',fontReview:'device-dependent'});
    }
    save('output/validation-report.json',report);process.stdout.write(JSON.stringify({ok:true,...report})+'\n');
  }catch(error){
    Object.assign(report,{structure:'failed',code:error.code||'SCENE_INVALID',issue:error.message,repair:'查看问题字段与 inspect，修改 commands 或 page 后重新 validate/preview；未改动工作文件'});
    save('output/validation-report.json',report);process.stderr.write(JSON.stringify(report)+'\n');process.exitCode=1;
  }
}
