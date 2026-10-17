// Actual Chromium: exported runtime -> final JSON -> app importer -> same Canvas.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join,dirname} from 'node:path';import {tmpdir} from 'node:os';import {spawnSync} from 'node:child_process';
import {createServer} from 'node:http';import {unzipSync,strFromU8} from 'fflate';
import {project} from '../src/domain.js';import {createOfflineHandoff} from '../src/offline-creation.js';
import {browserHarness} from './browser-harness.mjs';
const url=process.env.SHIYE_TEST_URL||'http://127.0.0.1:5192';
const b=await browserHarness('shiye-web-workbench',url+'/tests/fixtures/fabric-preview.html');
const dir=await mkdtemp(join(tmpdir(),'shiye-web-browser-'));let server;
try{
 await b.wait('.upper-canvas');
 const image=await b.evaluate(`(()=>{const c=document.createElement('canvas');c.width=240;c.height=320;const x=c.getContext('2d');x.fillStyle='#90ab96';x.fillRect(15,10,210,300);x.fillStyle='#f9efdb';x.fillRect(35,32,170,256);x.fillStyle='#ce9d67';x.beginPath();x.arc(120,130,58,0,7);x.fill();return c.toDataURL().split(',')[1];})()`);
 const assets=[{id:'web-browser-paper',title:'合成日记纸',kind:'paper',physicalWidthMM:65,physicalHeightMM:86,blobId:'synthetic-fixed-version'}];
 const p=project('春日片刻');p.processing='自由拆解';p.requiredAssetIDs=[assets[0].id];
 const handoff=await createOfflineHandoff({project:p,assets,aliases:{m1:assets[0].id},previews:[{alias:'m1',bytes:new Uint8Array(Buffer.from(image,'base64'))}]});
 const files=unzipSync(new Uint8Array(await handoff.blob.arrayBuffer()));
 for(const [name,data] of Object.entries(files)){await mkdir(dirname(join(dir,name)),{recursive:true});await writeFile(join(dir,name),data);}
 const doc=JSON.parse(strFromU8(files['examples/project.shiyeproject.json']));
 const mat=doc.page.layers.find(n=>n.type==='material');Object.assign(mat,{x:245,y:380,rotation:-6});
 const title=doc.page.layers.find(n=>n.type==='text');Object.assign(title,{content:'春日片刻',x:380,y:190,width:440,height:100,fontSize:42,curveHeight:-20,style:'serif',color:'#30463d'});
 doc.page.paperColor='#fbf7eb';doc.page.layers.push({type:'group',id:'notes',autoInkGroup:false,opacity:.9,children:[
 {type:'text',id:'body',content:'留一点空白，\n记下今天看见的颜色。',fontName:null,fixedLineHeight:null,fontSize:25,style:'sans',color:'#4f5f54',x:430,y:615,width:350,height:130},
 {type:'shape',id:'leaf',kind:'vector',x:500,y:400,width:95,height:150,fill:'#789079',stroke:null,vectorLayers:[{fill:'#789079',paths:[[[0,.5],[.5,0],[1,.4],[.5,1]]]},{fill:'#b8c6a1',paths:[[[.2,.5],[.5,.2],[.7,.5],[.5,.8]]]}]},
 {type:'ink',id:'ink',penStyle:'pressure',points:[{x:370,y:740,p:.15},{x:425,y:748,p:.6},{x:520,y:735,p:.25}],width:7,color:'#b69667'}]});
 doc.page.layers.push({type:'shape',id:'stamp-1',kind:'vector',x:115,y:190,width:38,height:38,
   fill:'#b36f67',stroke:null,vectorPaths:[[[.5,0],[1,.5],[.5,1],[0,.5]]]});
 doc.page.layers.push({...structuredClone(doc.page.layers.at(-1)),id:'stamp-2',x:150,rotation:25});
 await writeFile(join(dir,'scene.json'),JSON.stringify(doc));
 for(const name of ['preview']){const r=spawnSync(process.execPath,['runtime/'+name+'.cjs'],{cwd:dir,encoding:'utf8'});assert.equal(r.status,0,r.stderr);}
 const html=await readFile(join(dir,'output/画面预览.html'));
 server=createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 await b.command('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/preview`});await b.wait('body[data-render-state="ready"]');
 const preview=await b.evaluate('({report:SHIYE_RENDER_REPORT,...SHIYE_EXPORT_PREVIEW()})');
 await writeFile(join(dir,'output/canvas-capture.json'),JSON.stringify(preview));
 for(const name of ['save-preview','pack']){const r=spawnSync(process.execPath,['runtime/'+name+'.cjs'],{cwd:dir,encoding:'utf8'});assert.equal(r.status,0,r.stderr);}
 const final=JSON.parse(await readFile(join(dir,'output/project.shiyeproject.json'),'utf8'));
 assert.deepEqual(await readFile(join(dir,'output/preview.png')),Buffer.from(preview.png.split(',')[1],'base64'));
 const delivery=JSON.parse(await readFile(join(dir,'output/delivery-manifest.json'),'utf8'));
 assert.deepEqual(delivery.deliverables,['project.shiyeproject.json','preview.png']);
 assert.equal(preview.report.visibleSourceCount,1);assert.equal(preview.report.decodedSourceCount,1);
 await writeFile(join(dir,'preview.png'),Buffer.from(preview.png.split(',')[1],'base64'));
 await b.command('Page.navigate',{url:url+'/tests/fixtures/fabric-preview.html'});await b.wait('.upper-canvas');
 const result=await b.evaluate(`(async()=>{const {importEditableWork}=await import('/src/offline-creation.js');const {renderSceneCanvas,decodeSceneImage}=await import('/src/scene-renderer.js');const {craftSceneHash}=await import('/src/craft-fingerprint.js');const p=importEditableWork(${JSON.stringify(JSON.stringify(final))},${JSON.stringify(assets)});const d=p.drafts[0];const c=(await renderSceneCanvas(d,{loadMaterialImage:async()=>decodeSceneImage('data:image/png;base64,${image}')})).canvas;document.body.replaceChildren(c);c.style.cssText='width:min(100%,707px);height:auto;display:block;margin:auto';return {png:c.toDataURL(),hash:craftSceneHash(d),text:d.textBlocks.map(t=>t.content),layers:d.layers.length};})()`);
 assert.equal(result.png,preview.png,'offline preview and app imported render must have identical pixels');
 for(const [width,height] of [[390,844],[768,1024],[1024,768],[1440,900]]){await b.command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<700});const shot=await b.command('Page.captureScreenshot',{format:'png'});await writeFile(join(dir,`${width}x${height}.png`),Buffer.from(shot.data,'base64'));assert.equal(await b.evaluate('document.documentElement.scrollWidth<=innerWidth'),true);}
 assert.deepEqual(b.errors,[]);await writeFile(join(dir,'report.json'),JSON.stringify({preview:preview.report,sceneHash:result.hash,pixelParity:'exact',viewports:4},null,2));
 console.log('Web workbench browser passed. Synthetic evidence: '+dir);
}finally{await b.close();if(server)await new Promise(r=>server.close(r));}
