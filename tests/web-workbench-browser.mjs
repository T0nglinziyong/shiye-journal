// Actual Chromium: exported current runtime -> final JSON -> importer -> shared Canvas.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';import {tmpdir} from 'node:os';import {spawnSync} from 'node:child_process';
import {unzipSync} from 'fflate';
import {project} from '../src/domain.js';import {createOfflineHandoff} from '../src/offline-creation.js';
import {browserHarness} from './browser-harness.mjs';
import {linkTestCanvas} from './offline-canvas-test-support.mjs';
const url=process.env.SHIYE_TEST_URL||'http://127.0.0.1:5192';
const b=await browserHarness('shiye-web-workbench',url+'/tests/fixtures/fabric-preview.html');
const dir=await mkdtemp(join(tmpdir(),'shiye-web-browser-'));
const mm=(x,y,rotationDeg=0)=>({reference:'page',at:[x,y],unit:'mm',rotationDeg});
try{
 await b.wait('.upper-canvas');
 const image=await b.evaluate(`(()=>{const c=document.createElement('canvas');c.width=240;c.height=320;const x=c.getContext('2d');x.fillStyle='#90ab96';x.fillRect(15,10,210,300);x.fillStyle='#f9efdb';x.fillRect(35,32,170,256);x.fillStyle='#ce9d67';x.beginPath();x.arc(120,130,58,0,7);x.fill();return c.toDataURL().split(',')[1];})()`);
 const assets=[{id:'web-browser-paper',title:'合成日记纸',kind:'paper',physicalWidthMM:65,physicalHeightMM:86,blobId:'synthetic-fixed-version'}];
 const p=project('春日片刻');p.processing='自由拆解';p.requiredAssetIDs=[assets[0].id];
 const handoff=await createOfflineHandoff({project:p,assets,aliases:{m1:assets[0].id},previews:[{alias:'m1',bytes:new Uint8Array(Buffer.from(image,'base64'))}]});
 const files=unzipSync(new Uint8Array(await handoff.blob.arrayBuffer()));
 for(const [name,data] of Object.entries(files)){await mkdir(dirname(join(dir,name)),{recursive:true});await writeFile(join(dir,name),data);}
 await linkTestCanvas(dir);
 const run=(name,arg)=>spawnSync(process.execPath,['runtime/shiye.cjs',name,...(arg?[arg]:[])],{cwd:dir,encoding:'utf8',timeout:60000,env:{...process.env,SHIYE_RENDERER:'node'}});
 const revision=JSON.parse(run('info').stdout).sceneRevision;
 const commands={protocolVersion:2,transactionId:'browser-scene',baseSceneRevision:revision,operations:[
  {op:'page.update',paperColor:'#fbf7eb'},
  {op:'material.add',id:'paper',asset:'m1',place:mm(62,91,-6)},
  {op:'text.add',id:'title',content:'春日片刻',place:mm(95,42),size:{width:110,unit:'mm'},style:{fontSizePt:32,color:'#30463d'}},
  {op:'text.add',id:'body',content:'留一点空白，\n记下今天看见的颜色。',place:mm(108,150),size:{width:88,unit:'mm'},style:{fontSizePt:18,color:'#4f5f54'}},
  {op:'graphic.add',id:'stamp',geometry:{kind:'ellipse'},place:mm(29,45),size:{width:11,height:11,unit:'mm'},style:{fill:'#b36f67'}},
  {op:'graphic.add',id:'highlight',geometry:{kind:'stroke',points:[{x:0,y:1},{x:37,y:3},{x:62,y:0}],unit:'mm'},place:mm(124,176.5),style:{strokeWidthMm:2,stroke:'#b69667',penStyle:'marker'}},
  {op:'material.decision',asset:'m1',choice:'intact',reason:'保留纸张的完整边界，用作日记内容载体'}
 ]};
 await writeFile(join(dir,'work/commands.json'),JSON.stringify(commands));
 for(const [name,arg] of [['check','work/commands.json'],['apply','work/commands.json'],['preview'],['pack']]){const r=run(name,arg);assert.equal(r.status,0,r.stderr||r.stdout);}
 const preview=JSON.parse(await readFile(join(dir,'output/preview-capture.json'),'utf8'));
 const final=JSON.parse(await readFile(join(dir,'output/project.shiyeproject.json'),'utf8'));
 assert.deepEqual([...await readFile(join(dir,'output/preview.png'))].slice(0,8),[137,80,78,71,13,10,26,10]);
 const delivery=JSON.parse(await readFile(join(dir,'output/manifest.json'),'utf8'));
 assert.equal(delivery.format,'shiye-v3-delivery');assert.equal(delivery.previewHash,preview.pngHash);assert.equal(preview.renderer,'shiye-scene-v2');assert.ok(preview.assets.m1);
 await b.wait('.upper-canvas');
 const result=await b.evaluate(`(async()=>{const {importEditableWork}=await import('/src/offline-creation.js');const {renderSceneCanvas,decodeSceneImage}=await import('/src/scene-renderer.js');const {craftSceneHash}=await import('/src/craft-fingerprint.js');const p=importEditableWork(${JSON.stringify(JSON.stringify(final))},${JSON.stringify(assets)});const d=p.drafts[0];const c=(await renderSceneCanvas(d,{loadMaterialImage:async()=>decodeSceneImage('data:image/png;base64,${image}')})).canvas;document.body.replaceChildren(c);c.style.cssText='width:min(100%,707px);height:auto;display:block;margin:auto';return {png:c.toDataURL(),hash:craftSceneHash(d),text:d.textBlocks.map(t=>t.content),layers:d.layers.length};})()`);
 assert.equal(result.hash,preview.sceneHash,'offline preview and app render must use the same Scene');
 for(const [width,height] of [[390,844],[768,1024],[1024,768],[1440,900]]){await b.command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<700});const shot=await b.command('Page.captureScreenshot',{format:'png'});await writeFile(join(dir,`${width}x${height}.png`),Buffer.from(shot.data,'base64'));assert.equal(await b.evaluate('document.documentElement.scrollWidth<=innerWidth'),true);}
 assert.deepEqual(b.errors,[]);await writeFile(join(dir,'report.json'),JSON.stringify({preview,sceneHash:result.hash,renderers:'Node Canvas and browser Canvas',viewports:4},null,2));
 console.log('Web workbench browser passed. Synthetic evidence: '+dir);
}finally{await b.close();}
