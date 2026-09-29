// A real Chromium renderer, isolated from every existing browser data source.
// Start Vite separately, then run: npm run test:browser
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const base=process.env.SHIYE_TEST_URL||'http://127.0.0.1:5173';
const directory=process.env.SHIYE_SCREENSHOT_DIR||'/tmp/shiye-browser-acceptance';
await mkdir(directory,{recursive:true});
const cli=args=>execFileSync('npx',['--yes','agent-browser','--session','shiye-browser-test',...args],{encoding:'utf8',timeout:60000});
cli(['--args','--no-sandbox','open','about:blank']);
const url=cli(['get','cdp-url']).trim();
const ws=new WebSocket(url);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
let id=0,session,context;const pending=new Map(),errors=[],report=[];
ws.onmessage=event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);};
function command(method,params={},target=session){return new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>{pending.delete(n);reject(Error('CDP timed out: '+method));},60000);pending.set(n,{resolve,reject,timer});ws.send(JSON.stringify({id:n,method,params,...(target?{sessionId:target}:{})}));});}
async function evaluate(source){const r=await command('Runtime.evaluate',{expression:source,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function wait(selector){const attempts=Math.ceil(Number(process.env.SHIYE_WAIT_MS||5000)/20);for(let i=0;i<attempts;i++){if(await evaluate('!!document.querySelector('+JSON.stringify(selector)+')'))return;await sleep(20);}throw Error('Timed out: '+selector);}
async function click(selector,next){await wait(selector);await evaluate('document.querySelector('+JSON.stringify(selector)+').click()');if(next)await wait(next);}
async function fill(selector,value){await evaluate('(()=>{const e=document.querySelector('+JSON.stringify(selector)+');e.value='+JSON.stringify(value)+';e.dispatchEvent(new Event("input",{bubbles:true}));e.dispatchEvent(new Event("change",{bubbles:true}));})()');}
async function mouseDrag(start,end){await command('Input.dispatchMouseEvent',{type:'mouseMoved',x:start.x,y:start.y});await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,x:start.x,y:start.y});await command('Input.dispatchMouseEvent',{type:'mouseMoved',buttons:1,button:'left',x:end.x,y:end.y});await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:end.x,y:end.y});}
async function touchPath(points){await command('Emulation.setTouchEmulationEnabled',{enabled:true});const touch=p=>[{x:p.x,y:p.y,id:1,radiusX:1,radiusY:1,force:1}];await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:touch(points[0])});for(const p of points.slice(1))await command('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:touch(p)});await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await command('Emulation.setTouchEmulationEnabled',{enabled:false});}
async function capture(name,width,height){
  await evaluate('Promise.race([Promise.all([...document.querySelectorAll("img")].filter(i=>i.getBoundingClientRect().top<innerHeight).map(i=>i.decode().catch(()=>{}))),new Promise(r=>setTimeout(r,10000))])');
  const layout=await evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth,body:document.body.scrollWidth,overlay:!!document.querySelector("vite-error-overlay"),text:document.querySelector("#view").innerText.length})');
  const screenshot=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile(directory+'/'+width+'x'+height+'-'+name+'.png',Buffer.from(screenshot.data,'base64'));
  assert.ok(layout.text>0,name+' blank');assert.ok(!layout.overlay,name+' error overlay');
  assert.ok(layout.scroll<=width+1,name+' document overflow '+JSON.stringify(layout));
  const images=await evaluate('(()=>{const visible=[...document.images].filter(i=>i.getBoundingClientRect().top<innerHeight);return {visible:visible.length,loaded:visible.filter(i=>i.complete&&i.naturalWidth).length,pending:visible.filter(i=>!i.complete).length,failed:visible.filter(i=>i.complete&&!i.naturalWidth).length};})()');
  report.push({viewport:width+'x'+height,page:name,overflow:layout.scroll-width,images});
}
async function storeRecords(name){return evaluate('(async()=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open("shiye-pwa-full-v1",1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});return await new Promise((resolve,reject)=>{const r=db.transaction('+JSON.stringify(name)+').objectStore('+JSON.stringify(name)+').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});})()');}
try {
  context=(await command('Target.createBrowserContext',{},null)).browserContextId;
  const target=(await command('Target.createTarget',{url:'about:blank',browserContextId:context},null)).targetId;
  session=(await command('Target.attachToTarget',{targetId:target,flatten:true},null)).sessionId;
  await command('Target.activateTarget',{targetId:target},null);
  await command('Page.enable');await command('Runtime.enable');
  await command('Page.navigate',{url:base});await wait('.series-grid');
  // An overseas network may time out optional bundled work samples. Exercise
  // the actual create UI in that case, using only this isolated test context.
  if(!(await storeRecords('projects')).length){
    await click('[data-route="works"]','.works-grid');await click('#work-create','#canvas-page');
    await evaluate('(()=>{const e=document.querySelector("#project-title");e.textContent="浏览器验收作品";e.dispatchEvent(new Event("blur"));})()');
    await click('.swift-editor-head [data-act="back-works"]','.works-grid');
  }
  for(const [width,height] of [[320,640],[390,844],[700,1024],[768,1024],[1024,768],[1440,900],[2560,1440]]) {
    await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<700});
    await click('[data-route="library"]','.series-grid');await capture('series',width,height);
    assert.equal(await evaluate('document.querySelectorAll(".series-card-edit").length'),0);
    await click('[data-act="series-detail"]','.series-contents');await capture('series-contents',width,height);
    await click('#all-series','.series-grid');
    await click('.swift-tabs button:nth-child(2)','.asset-grid');await capture('assets',width,height);
    await click('[data-act="detail"]','.detail-columns');await capture('asset-detail',width,height);
    await click('[data-act="detail-edit"]','#asset-title');await capture('asset-editor',width,height);await click('#asset-dialog-close');
    await click('[data-act="detail-add"]');
    await click('[data-route="matching"]','.matching-page');await capture('matching',width,height);
    const rows=await evaluate('(()=>{const y=id=>document.querySelector("#"+id).closest("label").getBoundingClientRect().top;return {style:y("match-style"),purpose:y("match-purpose"),processing:y("match-processing"),mode:y("match-mode"),paper:y("match-ratio")};})()');
    assert.ok(Math.abs(rows.style-rows.purpose)<2,'style and purpose share a row');assert.ok(Math.abs(rows.processing-rows.mode)<2&&Math.abs(rows.mode-rows.paper)<2,'processing, mode and paper share a row');assert.ok(rows.processing>rows.style);
    await evaluate('document.querySelector(".match-direction").scrollIntoView({block:"start"})');await capture('matching-controls',width,height);await evaluate('scrollTo(0,0)');
    await click('[data-route="works"]','.works-grid');await capture('works',width,height);
    await click('.work-card-detail','.project-preview-cover');await capture('work-preview',width,height);
    await click('[data-act="preview-back"]','.works-grid');await click('[data-act="open-project"]','#canvas-page');await sleep(150);await capture('editor',width,height);
    await click('.swift-editor-head [data-act="back-works"]','.works-grid');
    await click('.work-entry','.import-nav');await capture('import',width,height);await click('[data-act="import-exit"]','.works-grid');
    await click('#top-settings','.settings-list');
    for(const section of ['AI 与创作','导入与识别','界面与素材库','数据与诊断']){await click('[data-act="settings-open"][data-val="'+section+'"]','.settings-detail');await capture('settings-'+section,width,height);await click('[data-act="settings-back"]','.settings-list');}
    await click('[data-act="settings-back"]','.works-grid');
  }
  // Settings draft crosses subsections, returns to its caller, and persists.
  await click('#top-settings','.settings-list');await click('[data-val="AI 与创作"]','#setting-ai-temperature');await fill('#setting-ai-temperature','1.15');
  await click('[data-act="settings-back"]','.settings-list');await click('[data-val="界面与素材库"]','#setting-display');await fill('#setting-display','list');
  await click('[data-act="settings-back"]','.settings-list');await click('[data-val="AI 与创作"]','#setting-ai-temperature');
  assert.equal(await evaluate('document.querySelector("#setting-ai-temperature").value'),'1.15');
  await click('[data-act="settings-back"]','.settings-list');await click('[data-act="settings-save"]','.works-grid');
  assert.equal(await evaluate('JSON.parse(localStorage.getItem("shiye-ai-settings-v1")).temperature'),1.15);
  await click('#top-settings','.settings-list');await click('[data-val="AI 与创作"]','#setting-ai-temperature');await fill('#setting-ai-temperature','.3');await click('[data-act="settings-back"]','.settings-list');await click('[data-act="settings-back"]','.works-grid');
  assert.equal(await evaluate('JSON.parse(localStorage.getItem("shiye-ai-settings-v1")).temperature'),1.15);
  // Custom covers and tags survive reload; cancellation does not save.
  await click('[data-route="library"]','.series-grid');await click('[data-act="series-detail"]','.series-contents');await click('#series-edit-title','#series-name');await fill('#series-style-tags','浏览器验收，植物、植物');
  const originalTitle=await evaluate('document.querySelector("#series-name").value');
  await click('#series-auto-cover');await click('.cover-picker [data-cover]');await click('#series-save');await sleep(100);
  const saved=(await storeRecords('series')).find(s=>s.title===originalTitle);assert.deepEqual(saved.styleTags,['浏览器验收','植物']);assert.equal(saved.coverAssetIDs.length,2);
  await command('Page.reload');await wait('.series-grid');await fill('[aria-label="搜索系列"]','浏览器验收');assert.equal(await evaluate('[...document.querySelectorAll("[data-act=series-detail]")].filter(e=>!e.hidden).length'),1);
  await click('[data-act="series-detail"]','.series-contents');await click('#series-edit-title','#series-name');await fill('#series-name','不应保存');await click('#series-cancel');assert.ok(!(await storeRecords('series')).some(s=>s.title==='不应保存'));
  const allMembers=await evaluate('document.querySelectorAll("[data-act=detail]:not([hidden])").length');
  await fill('#series-search','找不到的验收名称');assert.equal(await evaluate('document.querySelectorAll("[data-act=detail]:not([hidden])").length'),0);
  await fill('#series-search','');assert.equal(await evaluate('document.querySelectorAll("[data-act=detail]:not([hidden])").length'),allMembers);
  await click('#series-add-assets','.asset-grid');assert.ok(await evaluate('document.querySelector(".view-head h1").textContent.includes("添加素材")'));
  await evaluate('[...document.querySelectorAll(".view-head .actions button")].find(b=>b.textContent==="取消").click()');await wait('.series-contents');
  await click('#all-series','.series-grid');await click('.series-entry','#series-name');await fill('#series-name','浏览器验收临时系列');await click('#series-save');
  const temporarySeries=(await storeRecords('series')).find(s=>s.title==='浏览器验收临时系列');const beforeAssets=await storeRecords('assets');
  await click('[data-act="series-detail"][data-id="'+temporarySeries.id+'"]','.series-contents');await click('#series-add-assets','.asset-grid');
  const picked=beforeAssets.find(a=>!a.isProjectInternal&&a.seriesID!==saved.id);
  await click('[data-act="detail"][data-id="'+picked.id+'"]');await evaluate('[...document.querySelectorAll(".swift-tray button")].find(b=>b.textContent==="加入系列并返回").click()');await wait('.series-contents');
  assert.equal((await storeRecords('assets')).find(a=>a.id===picked.id).seriesID,temporarySeries.id);assert.equal((await storeRecords('assets')).length,beforeAssets.length);
  await click('[data-act="detail"]','.detail-columns');await click('[data-act="detail-series"]','.series-contents');await click('#series-return','.detail-columns');await click('[data-act="detail-back"]','.series-contents');
  await evaluate('[...document.querySelectorAll("#series-actions button")].find(b=>b.textContent==="批量").click()');await wait('#series-batch-menu');
  await evaluate('window.confirm=()=>true;[...document.querySelectorAll("#series-batch-menu button")].find(b=>b.textContent==="删除系列").click()');await wait('.series-grid');
  assert.equal((await storeRecords('assets')).find(a=>a.id===picked.id).seriesID,null);assert.equal((await storeRecords('assets')).length,beforeAssets.length);assert.ok(!(await storeRecords('series')).some(s=>s.id===temporarySeries.id));
  // Real touch events select two editable objects; moving the set is one edit
  // and preserves sizes. No synthetic PointerEvent bypasses capture semantics.
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await click('[data-route="works"]','.works-grid');await click('#work-create','#canvas-page');
  for(let i=0;i<2;i++){await click('[data-act="tool"][data-val="shape"]','[data-shape-kind="roundedRectangle"]');await click('[data-shape-kind="roundedRectangle"]');}
  await click('[aria-label="套索对象"]');
  await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  const canvas=await evaluate('(()=>{const r=document.querySelector("#canvas-page").getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};})()');
  const center={x:canvas.x+canvas.w/2,y:canvas.y+canvas.h/2};
  await touchPath([{x:center.x-70,y:center.y-70},{x:center.x+70,y:center.y-70},{x:center.x+70,y:center.y+70},{x:center.x-70,y:center.y+70},{x:center.x-70,y:center.y-70}]);
  await capture('lasso-touch',390,844);
  assert.equal(await evaluate('document.querySelector(".multi-selection-toolbar span").textContent'),'已选 2 个对象');
  await click('[data-val="select"]');
  const beforeMove=(await storeRecords('projects')).find(p=>p.title==='未命名手账').drafts[0].primitives;
  await mouseDrag(center,{x:center.x+30,y:center.y+15});await sleep(250);
  const afterMove=(await storeRecords('projects')).find(p=>p.title==='未命名手账').drafts[0].primitives;
  assert.ok(afterMove.every((o,i)=>o.x>beforeMove[i].x&&o.y>beforeMove[i].y&&o.width===beforeMove[i].width&&o.height===beforeMove[i].height));
  await click('.swift-editor-head [data-act="back-works"]','.works-grid');
  await command('Emulation.setDeviceMetricsOverride',{width:2560,height:1440,deviceScaleFactor:1,mobile:false});
  await click('[data-route="library"]','.series-grid');
  // Synthetic image import, multi-photo confirmation, metadata, backup roundtrip.
  await click('.swift-tabs button:nth-child(2)','.asset-grid');await click('[data-act="import"]','.import-nav');
  await evaluate('(async()=>{const canvas=document.createElement("canvas");canvas.width=600;canvas.height=850;const ctx=canvas.getContext("2d");ctx.fillStyle="white";ctx.fillRect(0,0,600,850);ctx.fillStyle="#a45842";ctx.fillRect(80,100,150,200);ctx.fillStyle="#537c62";ctx.fillRect(330,420,120,160);const blob=await new Promise(r=>canvas.toBlob(r,"image/png"));const dt=new DataTransfer();dt.items.add(new File([blob],"验收1.png",{type:"image/png"}));dt.items.add(new File([blob],"验收2.png",{type:"image/png"}));const input=document.querySelector("#file-input");input.files=dt.files;input.dispatchEvent(new Event("change"));})()');
  await wait('.import-candidate-tile');await capture('import-inspect',2560,1440);
  const photoLayout=await evaluate('(()=>{const base=document.querySelector("#crop-preview").getBoundingClientRect(),im=document.querySelector("#crop-preview>img").getBoundingClientRect(),corners=document.querySelector(".paper-corner-overlay").getBoundingClientRect();return {base:{w:base.width,h:base.height},image:{w:im.width,h:im.height},corners:{w:corners.width,h:corners.height}};})()');
  assert.ok(photoLayout.image.h<=photoLayout.base.h+1&&photoLayout.image.w<=photoLayout.base.w+1,'Import photo must not be cropped by its preview');
  assert.ok(Math.abs(photoLayout.corners.w/photoLayout.corners.h-600/850)<.01,'Corner overlay must match fitted photo ratio');
  await click('[data-act="manual-import-box"]','.multi-box-editor');
  const overlay=await evaluate('(()=>{const r=document.querySelector(".multi-box-editor").getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};})()');
  await mouseDrag({x:overlay.x+.1*overlay.w,y:overlay.y+.75*overlay.h},{x:overlay.x+.3*overlay.w,y:overlay.y+.9*overlay.h});
  await capture('manual-box',2560,1440);
  assert.equal(await evaluate('document.querySelectorAll(".import-region").length'),3,JSON.stringify(overlay));
  await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent==="完成标记").click()');
  for(let i=0;i<250&&await evaluate('!!document.querySelector(".multi-box-editor")');i++)await sleep(20);
  assert.equal(await evaluate('!!document.querySelector(".multi-box-editor")'),false,'Manual extraction must finish');
  assert.equal(await evaluate('document.querySelectorAll(".import-candidate-tile").length'),3);
  await click('[data-act="import-confirm-photo"]');await wait('.queue-item.active[data-id="1"]');await wait('.import-candidate-tile.selected');await click('[data-act="import-confirm-photo"]','.review-candidates');
  await evaluate('document.querySelector(".review-candidate").dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,cancelable:true}))');
  await wait('#candidate-menu');await evaluate('[...document.querySelectorAll("#candidate-menu button")].find(b=>b.textContent==="编辑素材信息").click()');await wait('#candidate-edit-name');
  await fill('#candidate-edit-name','合成素材验收');await fill('#candidate-edit-quantity','3');await fill('#candidate-edit-status','ready');await click('#candidate-edit-save');await fill('.record-series','__none__');
  await capture('import-review',2560,1440);await click('[data-act="confirm-import"]','.import-done');
  const imported=(await storeRecords('assets')).find(a=>a.title==='合成素材验收');assert.equal(imported.supply.quantity,3);assert.equal(imported.reviewStatus,'ready');assert.equal(imported.seriesID,null);assert.ok(imported.physicalWidthMM>0);
  // Imported work elements are visible layers. Their matching alpha is removed
  // from the base, so dragging a layer cannot reveal a duplicate underneath.
  await click('[data-act="import-exit"]','.asset-grid');await click('[data-route="works"]','.works-grid');await click('.work-entry','.import-nav');
  await evaluate('(async()=>{const canvas=document.createElement("canvas");canvas.width=600;canvas.height=850;const ctx=canvas.getContext("2d");ctx.fillStyle="white";ctx.fillRect(0,0,600,850);ctx.fillStyle="#a45842";ctx.fillRect(80,100,150,200);ctx.fillStyle="#537c62";ctx.fillRect(330,420,120,160);const blob=await new Promise(r=>canvas.toBlob(r,"image/png"));const dt=new DataTransfer();dt.items.add(new File([blob],"合成作品.png",{type:"image/png"}));const input=document.querySelector("#file-input");input.files=dt.files;input.dispatchEvent(new Event("change"));})()');
  await wait('.import-candidate-tile');await click('[data-act="import-confirm-photo"]','.review-candidates');await fill('.record-work-title','合成作品验收');await fill('.import-work-tags','植物，票据');await fill('.import-used','used');
  await click('[data-act="confirm-import"]','.import-done');
  const work=(await storeRecords('projects')).find(p=>p.title==='合成作品验收');assert.equal(work.isUsed,true);assert.deepEqual(work.styleTags,['植物','票据']);assert.equal(work.drafts[0].items.length,3);assert.ok(work.drafts[0].items.every(i=>!i.isParked));
  const baseAsset=(await storeRecords('assets')).find(a=>a.id===work.drafts[0].items[0].assetID);
  const backgroundSample=await evaluate('(async()=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open("shiye-pwa-full-v1",1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);}),blob=await new Promise((resolve,reject)=>{const r=db.transaction("blobs").objectStore("blobs").get('+JSON.stringify(baseAsset.blobId)+');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});db.close();const bitmap=await createImageBitmap(blob.data),c=document.createElement("canvas");c.width=bitmap.width;c.height=bitmap.height;const ctx=c.getContext("2d");ctx.drawImage(bitmap,0,0);const sample=[...ctx.getImageData(150,200,1,1).data];bitmap.close();return sample;})()');
  assert.deepEqual(backgroundSample,[255,255,255,255]);
  // Exercise the deployed UI too: a production bundle has no /src/store.js.
  // Capture only this isolated context's synthetic export, never a user file.
  await click('[data-act="import-exit"]','.works-grid');await click('#top-settings','.settings-list');await click('[data-val="数据与诊断"]','.settings-detail');
  await evaluate('(()=>{const original=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download.endsWith(".shiyepwa")){window.__testBackup=fetch(this.href).then(r=>r.blob());return;}return original.call(this);};})()');
  const beforeRestore=(await storeRecords('assets')).length;
  await click('[data-act="backup"]');
  for(let i=0;i<250&&!(await evaluate('!!window.__testBackup'));i++)await sleep(20);
  assert.ok(await evaluate('!!window.__testBackup'),'Backup export must use the real UI');
  await evaluate('(async()=>{const blob=await window.__testBackup;const saved=JSON.parse(await blob.text());if(saved.format!=="shiye-pwa"||!saved.stores.blobs.length)throw Error("Incomplete backup export");const dt=new DataTransfer();dt.items.add(new File([blob],"synthetic-roundtrip.shiyepwa",{type:"application/json"}));const input=document.querySelector("#backup-input");input.files=dt.files;window.confirm=()=>true;input.dispatchEvent(new Event("change"));})()');
  for(let i=0;i<250&&!(await evaluate('document.querySelector("#toast").textContent.includes("完整备份已恢复")'));i++)await sleep(20);
  assert.ok(await evaluate('document.querySelector("#toast").textContent.includes("完整备份已恢复")'),'Restore must complete through the deployed UI');
  const restored=await storeRecords('assets');assert.equal(restored.length,beforeRestore);assert.equal(restored.find(a=>a.title==='合成素材验收').supply.quantity,3);
  assert.deepEqual(errors,[],'Uncaught browser errors');
  await writeFile(directory+'/report.json',JSON.stringify({base,browser:'Chrome via CDP (not physical Safari)',report,checks:['settings draft/save/cancel','series cover/tags/reload','touch lasso and multiselect drag','manual import box','two-photo import metadata','work editable elements and background removal','complete backup restore'],errors},null,2));
  console.log('Real browser acceptance: '+report.length+' screens, 7 viewports, workflows and backup roundtrip passed. '+directory);
}finally{if(context)await command('Target.disposeBrowserContext',{browserContextId:context},null);ws.close();cli(['close']);}
