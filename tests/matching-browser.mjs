import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {browserHarness} from './browser-harness.mjs';
const out='/tmp/shiye-matching-flow';await mkdir(out,{recursive:true});
const b=await browserHarness('shiye-matching-flow',process.env.SHIYE_TEST_URL||'http://localhost:5175',async({command})=>{
 await command('Page.addScriptToEvaluateOnNewDocument',{source:`
 localStorage.setItem('shiye-ai-settings-v2',JSON.stringify({provider:'custom',endpoint:'https://mock.invalid/chat',model:'test',key:'synthetic-key',includeThumbnails:false,deliveryMode:'tools',transport:'native'}));`});
});
const {command,evaluate,wait,click,sleep}=b;
const tool=(id,name,args)=>({id,type:'function',function:{name,arguments:JSON.stringify(args)}});
const calls=[tool('a','place_materials',{items:[1,2,3,4].map(i=>({asset:'asset_'+Buffer.from('match-test-material-'+i).toString('base64').replace(/=+$/,''),piece:'p'+i,x:.14+i*.18,y:.3}))}),
  tool('b','upsert_text',{items:[{key:'title',content:'春日收藏',x:.5,y:.1,width:.7,font_size:34}]}),tool('c','finish_design',{})];
const mockSSE=': keep-alive\n\n'+'data: '+JSON.stringify({choices:[{delta:{tool_calls:calls.map((item,index)=>({...item,index}))},finish_reason:'tool_calls'}]})+'\n\ndata: [DONE]\n\n';
const records=store=>evaluate(`(async()=>{const db=await new Promise(r=>{const q=indexedDB.open('shiye-pwa-full-v1');q.onsuccess=()=>r(q.result)});return await new Promise(r=>{const q=db.transaction('${store}').objectStore('${store}').getAll();q.onsuccess=()=>r(q.result)})})()`);
try{
 await wait('.series-grid');
 await evaluate(`(async()=>{const db=await new Promise(r=>{const q=indexedDB.open('shiye-pwa-full-v1');q.onsuccess=()=>r(q.result)});await new Promise(r=>{const tx=db.transaction(['assets'],'readwrite');for(let i=1;i<=4;i++)tx.objectStore('assets').put({id:'match-test-material-'+i,blobId:'match-test-material-'+i,staticPath:'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2220%22 height=%2230%22%3E%3Crect width=%2220%22 height=%2230%22 fill=%22%2387ae7d%22/%3E%3C/svg%3E',title:'春日贴纸 '+i,kind:'sticker',tags:[],physicalWidthMM:20,physicalHeightMM:30,supply:{quantity:1},usageStatus:'unused',createdAt:new Date().toISOString()});tx.oncomplete=r;});const local=await new Promise((resolve,reject)=>{const q=indexedDB.open('shiye-device-session-v1',1);q.onupgradeneeded=()=>{if(!q.result.objectStoreNames.contains('records'))q.result.createObjectStore('records',{keyPath:'key'});};q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});await new Promise((resolve,reject)=>{const tx=local.transaction('records','readwrite');tx.objectStore('records').put({key:JSON.stringify(['browser','matching-session-v1']),record:{id:'matching-session-v1',context:{basket:[1,2,3,4].map(i=>'match-test-material-'+i),coreIDs:[],matchRatio:'a5',matchPurpose:'日常记录',matchPurposes:['日常记录']},variants:[]}});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});local.close(); })()`);
 await command('Page.reload');await wait('.series-grid');await click('[data-route="matching"]','.match-previews');
 // A star/unstar is a local card mutation, NOT a full #view repaint.
 // The title, form inputs, scroller and decoded material images must all
 // survive with identical DOM identity and unchanged scroll offsets.
 await evaluate('(()=>{globalThis.__matchHead=document.querySelector(".matching-page .view-head");globalThis.__matchTextarea=document.querySelector("#match-intent");globalThis.__matchBasket=document.querySelector(".match-basket-scroll");globalThis.__matchImg=__matchBasket.querySelector("img");globalThis.__matchRec=document.querySelector(".match-recommendations");__matchBasket.scrollTop=95;__matchTextarea.value="检查不刷新输入框";})()');
 await click('[data-act="match-core"]');
 assert.ok(await evaluate('__matchHead===document.querySelector(".matching-page .view-head")&&__matchTextarea===document.querySelector("#match-intent")&&__matchBasket===document.querySelector(".match-basket-scroll")&&__matchImg===__matchBasket.querySelector("img")&&__matchRec===document.querySelector(".match-recommendations")'),
  'Starring a material must not remount the entire matching page or material photos');
 assert.equal(await evaluate('document.querySelector("#match-intent").value'),'检查不刷新输入框');
 await click('[data-act="match-core"]'); // restore initial optional priority
 assert.ok(await evaluate('__matchHead===document.querySelector(".matching-page .view-head")'));
 // Reset test-only unsaved prompt content without remounting Matching.
 await evaluate('document.querySelector("#match-intent").value=""');
 assert.equal(await evaluate('document.querySelector("[data-act=match-generate]").textContent.trim()'),'进行AI创作');
 assert.equal(await evaluate('document.querySelectorAll(".match-direction-choice[data-direction=style]").length'),3);
 await evaluate('(()=>{const fields=[...document.querySelectorAll(".match-direction-choice[data-direction=style]")];fields[0].value="韩系清新";fields[0].dispatchEvent(new Event("change",{bubbles:true}));fields[1].value="密集拼贴";fields[1].dispatchEvent(new Event("change",{bubbles:true}));})()');
 assert.equal(await evaluate('document.querySelector("#match-style").selectedOptions.length'),2);
 const before=(await records('projects')).filter(p=>p.title==='新的手账').length;
 const preflight=await evaluate(`({capture:localStorage.getItem('shiye-ai-context-capture-v1'),
   settings:JSON.parse(localStorage.getItem('shiye-ai-settings-v2')),
   fetch:String(globalThis.fetch).slice(0,90),serviceWorker:!!navigator.serviceWorker?.controller,
   variants:[...document.querySelectorAll('.match-variant')].map(item=>({status:item.dataset.variantStatus,text:item.querySelector('.match-progress')?.textContent}))})`);
 assert.equal(preflight.variants.length,0,'Fresh matching fixture must start without an older variant');
 await command('Network.enable');
 await command('Fetch.enable',{patterns:[{urlPattern:'https://mock.invalid/chat*',requestStage:'Request'}]});
 await click('[data-act="match-generate"]');await wait('.match-progress');assert.ok(await evaluate('!!document.querySelector(".matching-page")&&!document.querySelector("#canvas-page")'));
 let intercepted=0;const methods=[];
 for(let i=0;i<300;i++){
   for(const request of b.pausedRequests.splice(0)){
     intercepted++;methods.push(request.request?.method);
     await command('Fetch.fulfillRequest',{requestId:request.requestId,
       responseCode:request.request?.method==='OPTIONS'?204:200,
       responseHeaders:[{name:'Content-Type',value:'text/event-stream'},
         {name:'Access-Control-Allow-Origin',value:'*'},
         {name:'Access-Control-Allow-Methods',value:'POST, OPTIONS'},
         {name:'Access-Control-Allow-Headers',value:'authorization, content-type'}],
       body:request.request?.method==='OPTIONS'?'':Buffer.from(mockSSE).toString('base64')});
   }
   if(await evaluate('/结构已完成|创作完成/.test(document.querySelector(".match-progress").textContent)'))break;
   await sleep(100);
 }
 assert.ok(intercepted>0,'The synthetic model request must reach the browser network boundary. '+
   JSON.stringify({preflight,variant:await evaluate(`({status:document.querySelector('.match-variant')?.dataset.variantStatus,
       text:document.querySelector('.match-progress')?.textContent})`),errors:b.errors,
     requests:b.networkRequests.slice(-12).map(item=>({url:item.request?.url,method:item.request?.method}))}));
 assert.match(await evaluate('document.querySelector(".match-progress").textContent'),/结构已完成|创作完成/,
   'Preflight: '+JSON.stringify(preflight)+' Intercepted methods: '+JSON.stringify(methods));
 assert.ok(await evaluate('!!document.querySelector(".match-cover-fallback .thumb-sheet, .match-raster-preview")'),
   'A generated variant must show an immediate or completed cover');
 assert.equal((await records('projects')).filter(p=>p.title==='新的手账').length,before+1);
 for(const [w,h] of [[390,844],[768,1024],[1024,768],[1440,900]]){await command('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:w<700});await sleep(100);await evaluate('document.querySelector(".match-previews").scrollIntoView({block:"center"})');const png=await command('Page.captureScreenshot',{format:'png'});await writeFile(out+'/'+w+'x'+h+'.png',Buffer.from(png.data,'base64'));assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));}
 await command('Page.reload');await wait('.series-grid');await click('[data-route="matching"]','.match-result');assert.match(await evaluate('document.querySelector(".match-progress").textContent'),/结构已完成|创作完成/);
 await click('[data-act="match-open-result"]','#canvas-page');let projects=await records('projects');const p=projects.find(x=>x.title==='新的手账');assert.ok(p?.isDraft);assert.equal(p.drafts[0].layers.filter(layer=>layer.type==='material').length,4);assert.equal(p.drafts[0].layers.filter(layer=>layer.type==='text').length,1);
 for(const [w,h] of [[390,844],[768,1024],[1024,768],[1440,900]]){await command('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:w<700});await sleep(80);const png=await command('Page.captureScreenshot',{format:'png'});await writeFile(out+'/editor-'+w+'x'+h+'.png',Buffer.from(png.data,'base64'));assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));}
 await click('[data-act="back-works"]','.works-grid');await click('[data-route="matching"]','.matching-page');await click('[data-act="match-open-result"]','#canvas-page');
 await evaluate('[...document.querySelectorAll(".swift-editor-head .actions button")].find(b=>b.textContent.trim()==="完成").click()');await wait('.works-grid');await sleep(200);projects=await records('projects');assert.equal(projects.find(x=>x.id===p.id).isDraft,false);
 await click('[data-route="matching"]','.match-previews');await evaluate('globalThis.confirm=()=>true');await click('[data-act="reset-match"]');await sleep(200);assert.equal(await evaluate('(async()=>{const d=await new Promise(r=>{const q=indexedDB.open("shiye-device-session-v1");q.onsuccess=()=>r(q.result)});return await new Promise(r=>{const q=d.transaction("records").objectStore("records").get(JSON.stringify(["browser","matching-session-v1"]));q.onsuccess=()=>r(q.result.record.variants.length);})})()'),0);assert.ok((await records('projects')).find(x=>x.id===p.id));assert.deepEqual(b.errors,[]);
 console.log('Matching flow passed: streamed progress, no navigation, automatic draft persistence, draft promotion, reset preserves work, 4 viewport screenshots. Synthetic model response only.');
}finally{await b.close();}
