// Real Chromium integration using synthetic images only. No user account or
// model API. Exercises one submitted plan, actual editor and portable Canvas.
import assert from 'node:assert/strict';
import {mkdir,writeFile,rm} from 'node:fs/promises';
import {browserHarness} from './browser-harness.mjs';
import {offlineBrowserPage} from '../src/offline-browser-page.js';
import {offlineBrowserSource} from '../src/generated/offline-browser-source.js';
const directory=process.env.SHIYE_CRAFT_SCREENSHOTS||'/tmp/shiye-craft-browser';
const url=process.env.SHIYE_TEST_URL||'http://127.0.0.1:5192';
await mkdir(directory,{recursive:true});
const b=await browserHarness('shiye-multimodal-craft',url);
const report={synthetic:true,providerCalls:0,physicalDevice:false,viewports:[]};
const file=new URL('./.portable-craft-test.html',import.meta.url);
async function pointerSelect(id){
  const selector='[data-object="'+id+'"]';await b.wait(selector);
  const point=await b.evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});n.scrollIntoView({block:'nearest'});const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  await b.command('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x,y:point.y});
  await b.command('Input.dispatchMouseEvent',{type:'mousePressed',x:point.x,y:point.y,button:'left',buttons:1,clickCount:1});
  await b.command('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x,y:point.y,button:'left',buttons:0,clickCount:1});
  await b.wait('[data-selection-for="'+id+'"]');return point;
}
try{
 await b.wait('.series-grid');
 const fixture=await b.evaluate(`(async()=>{
  const {project}=await import('/src/domain.js'),{applyToolCalls}=await import('/src/creative.js'),{craftSceneHash}=await import('/src/craft-fingerprint.js'),{assetSourceRevision}=await import('/src/material-anatomy.js'),{renderSceneCanvas}=await import('/src/scene-renderer.js');
  const assets=[['words',100,80,'#dd88aa'],['frame',90,70,'#aa7744'],['strip',115,6,'#3366cc']].map(([name,w,h,color])=>({id:'multi-'+name,blobId:'multi-image-'+name,title:'Synthetic '+name,kind:'paper',physicalWidthMM:w,physicalHeightMM:h,supply:{quantity:1},tags:[],reviewStatus:'ready',createdAt:'2026-01-01T00:00:00Z',color}));
  const p=project('Synthetic single-delivery GPT plan',{ratio:'a4'}),d=p.drafts[0],source={materials:assets.map((a,i)=>({alias:'m'+(i+1),assetID:a.id}))},aliases=Object.fromEntries(source.materials.map(m=>[m.alias,m.assetID]));
  const plan={format:'shiye-craft-plan',version:2,commandId:'multimodal-test',baseSceneHash:craftSceneHash(d),observations:[{id:'printed-word',asset:'m1',sourceRevision:assetSourceRevision(assets[0]),kind:'text',label:'KEEP THIS WORD',boundsRatio:[.1,.1,.4,.3]}],pieces:[
   {id:'words',asset:'m1',sourceRevision:assetSourceRevision(assets[0]),extraction:{type:'observed_region',observationId:'printed-word'},centerMM:[105,60]},
   {id:'frame',asset:'m2',sourceRevision:assetSourceRevision(assets[1]),extraction:{type:'whole'},treatments:[{op:'window',shape:'rectangle',box:[.2,.38,.1,.24]},{op:'window',shape:'rectangle',box:[.7,.38,.1,.24]}],centerMM:[100,180],z:10},
   {id:'strip',asset:'m3',sourceRevision:assetSourceRevision(assets[2]),extraction:{type:'whole'},centerMM:[100,180],z:9}],weaves:[{piece:'strip',target:'frame',holes:[0,1],front:'between'}]};
  const before=JSON.stringify(assets),result=applyToolCalls(plan,d,assets,aliases,{processing:'自由拆解',allowNoText:true,visualAssetIDs:assets.map(a=>a.id)});
  if(!result.committed||result.results.some(r=>!r.ok))throw Error(JSON.stringify(result.results));
  if(before!==JSON.stringify(assets))throw Error('Source assets were changed');
  p.id='multi-browser-project';p.drafts=[result.draft];p.activeDraftID=result.draft.id;p.isDraft=false;p.isTemplate=false;
  const blobs=[],images={},previews={};
  for(const [i,a] of assets.entries()){
   const canvas=document.createElement('canvas');canvas.width=a.physicalWidthMM*4;canvas.height=a.physicalHeightMM*4;const ctx=canvas.getContext('2d');ctx.fillStyle=a.color;ctx.fillRect(0,0,canvas.width,canvas.height);
   if(i===0){ctx.fillStyle='#333333';ctx.font='18px sans-serif';ctx.fillText('KEEP THIS WORD',45,75);}
   const data=await new Promise(r=>canvas.toBlob(r,'image/png'));blobs.push({id:a.blobId,data});const image=new Image();image.src=canvas.toDataURL();await image.decode();images[a.id]=image;previews['m'+(i+1)]=image.src.split(',')[1];
  }
  const rendered=await renderSceneCanvas(result.draft,{loadMaterialImage:id=>images[id]});const px=rendered.canvas.getContext('2d'),scale=d.canvas.height/d.physicalPageHeightMM;
  const samples=[100,65,45].map(x=>[...px.getImageData(Math.round(x*scale),Math.round(180*scale),1,1).data]);
  const db=await new Promise((r,j)=>{const q=indexedDB.open('shiye-pwa-full-v1');q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error);});
  await new Promise((r,j)=>{const tx=db.transaction(['assets','blobs','projects'],'readwrite');assets.forEach(a=>tx.objectStore('assets').put(a));blobs.forEach(x=>tx.objectStore('blobs').put(x));tx.objectStore('projects').put(p);tx.oncomplete=r;tx.onerror=()=>j(tx.error);});db.close();
  return {project:p,assets,source,previews,samples,renderReport:rendered.report,ids:Object.fromEntries(result.draft.items.map(i=>[i.creativePieceID,i.id]))};
 })()`);
 assert.deepEqual(fixture.samples,[[51,102,204,255],[170,119,68,255],[51,102,204,255]]);
 assert.equal(fixture.project.drafts[0].items.length,3);
 await b.command('Page.reload');await b.wait('.series-grid');
 for(const [width,height] of [[390,844],[768,1024],[1024,768],[1440,900]]){
  await b.command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<700});
  await b.click('[data-route="works"]','.works-grid');
  await b.click('[data-act="open-project"][data-id="multi-browser-project"]','#canvas-page');
  await b.evaluate(`(async()=>{for(let n=0;n<240;n++){const images=[...document.querySelectorAll('#canvas-page .material img')];if(images.length===5&&images.every(i=>i.complete&&i.naturalWidth&&!i.src.includes('#shiye-image=')))return;await new Promise(r=>setTimeout(r,25));}throw Error('Five material render projections did not load');})()`);
  for(let n=0;n<3;n++)await pointerSelect(fixture.ids.strip);
  const check=await b.evaluate(`(()=>{const nodes=[...document.querySelectorAll('#canvas-page .material')];return {views:nodes.length,owners:new Set(nodes.map(n=>n.dataset.object)).size,keys:new Set(nodes.map(n=>n.dataset.renderKey)).size,overflow:document.documentElement.scrollWidth>innerWidth+1};})()`);
  assert.deepEqual(check,{views:5,owners:3,keys:5,overflow:false});
  await pointerSelect(fixture.ids.words);
  await b.click('[aria-label="编辑对象"]','#object-settings-fields');
  await b.evaluate('[...document.querySelectorAll("#object-settings-fields button")].find(b=>b.textContent.includes("打开统一素材加工面板")).click()');await b.wait('#processing-action');
  assert.equal(await b.evaluate('document.querySelector("#processing-action").value'),'crop','observed rectangular words keep their existing crop');
  await b.evaluate('(()=>{const select=document.querySelector("#processing-mask");select.value="region";select.dispatchEvent(new Event("change",{bubbles:true}));})()');
  assert.equal(await b.evaluate('!!document.querySelector("#processing-composite-geometry")'),true);
  assert.equal(await b.evaluate('document.querySelector("#processing-error").textContent'),'');
  await b.click('#processing-cancel');
  const shot=await b.command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile(`${directory}/${width}x${height}-multimodal.png`,Buffer.from(shot.data,'base64'));
  report.viewports.push({width,height,...check,realPointerSelection:true,compositeEditorOpened:true});
  await b.click('[data-act="back-works"]','.works-grid');
 }
 await b.command('Page.reload');await b.wait('.series-grid');
 const saved=await b.evaluate(`(async()=>{const db=await new Promise(r=>{const q=indexedDB.open('shiye-pwa-full-v1');q.onsuccess=()=>r(q.result);});const get=(store,id)=>new Promise(r=>{const q=db.transaction(store).objectStore(store).get(id);q.onsuccess=()=>r(q.result);});const p=await get('projects','multi-browser-project'),a=await get('assets','multi-words');db.close();return {pieces:p.drafts[0].items.length,slices:p.drafts[0].items.find(i=>i.creativePieceID==='strip').craftDisplaySlices.length,anatomy:a.anatomy||null};})()`);
 assert.deepEqual(saved,{pieces:3,slices:1,anatomy:null});
 const previews=Object.fromEntries(Object.entries(fixture.previews).map(([id,s])=>[id,Buffer.from(s,'base64')]));
 await writeFile(file,offlineBrowserPage(fixture.project.drafts[0],fixture.source,previews,offlineBrowserSource));
 await b.command('Page.navigate',{url:url+'/tests/.portable-craft-test.html'});
 await b.evaluate(`(async()=>{for(let n=0;n<300;n++){if(window.SHIYE_RENDER_ERROR)throw Error(window.SHIYE_RENDER_ERROR);if(window.SHIYE_RENDER_READY)return;await new Promise(r=>setTimeout(r,20));}throw Error('Portable renderer not ready');})()`);
 const portable=await b.evaluate(`(()=>{const canvas=document.querySelector('#page canvas'),ctx=canvas.getContext('2d'),scale=canvas.height/297;return {report:window.SHIYE_RENDER_REPORT,samples:[100,65,45].map(x=>[...ctx.getImageData(Math.round(x*scale),Math.round(180*scale),1,1).data])};})()`);
 assert.equal(portable.report.sceneHash,fixture.renderReport.sceneHash);assert.deepEqual(portable.samples,fixture.samples);
 assert.deepEqual(b.errors,[]);
 report.passed=true;report.logicalPieces=3;report.derivedViews=5;report.sourceUnmodified=true;report.reopened=true;report.portableCanvasMatches=true;report.samples=portable.samples;report.sceneHash=portable.report.sceneHash;
 await writeFile(directory+'/multimodal-report.json',JSON.stringify(report,null,2));console.log('MULTIMODAL_CRAFT_BROWSER_PASS',JSON.stringify(report));
}catch(error){try{const shot=await b.command('Page.captureScreenshot',{format:'png'});await writeFile(directory+'/multimodal-failure.png',Buffer.from(shot.data,'base64'));}catch{}report.passed=false;report.error=error.message;await writeFile(directory+'/multimodal-report.json',JSON.stringify(report,null,2));throw error;}
finally{await rm(file,{force:true});await b.close();}
