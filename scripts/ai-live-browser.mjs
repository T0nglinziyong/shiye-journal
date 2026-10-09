// Opt-in, billable live acceptance. Credential comes only from non-echoing
// stdin and is removed with the isolated browser context. Never log settings.
import {createInterface} from 'node:readline';
import {mkdir,writeFile} from 'node:fs/promises';
import {browserHarness} from '../tests/browser-harness.mjs';
console.log('Awaiting live test credential on stdin (not logged).');
let key;const input=createInterface({input:process.stdin,terminal:false});for await(const line of input){key=line.trim();break;}input.close();if(!key)throw Error('Missing credential');
const endpoint='https://api.deepseek.com/chat/completions',out='/tmp/shiye-ai-live';await mkdir(out,{recursive:true});
let mode='agent';const report={url:process.env.SHIYE_TEST_URL||'https://shiye-journal-test.vercel.app',model:'deepseek-flash',timeout:75,maxTokens:6000,maxTurns:5,phases:[]};
const phases=(process.env.SHIYE_LIVE_PHASES||'recognition,agent,direct').split(',');
const b=await browserHarness('shiye-ai-live',report.url,async({command})=>{
 await command('Page.addScriptToEvaluateOnNewDocument',{source:`
  if(!localStorage.getItem('shiye-ai-settings-v2'))localStorage.setItem('shiye-ai-settings-v2',JSON.stringify(${JSON.stringify({provider:'deepseek',endpoint,model:'deepseek-flash',key,includeThumbnails:true,requestTimeout:75,maxTokens:6000,maxTurns:5,deliveryMode:'tools'})}));
  globalThis.__liveRequests=[];const originalFetch=fetch;
  globalThis.fetch=async(url,options)=>{if(url!==${JSON.stringify(endpoint)})return originalFetch(url,options);
   const payload=JSON.parse(options.body),started=performance.now(),record={model:payload.model,stream:payload.stream,toolCount:payload.tools?.length||0,maxTokens:payload.max_tokens,started,bytes:0,chunks:0,maxSilence:0};__liveRequests.push(record);let last=started,tail='';
   try{const response=await originalFetch(url,options);record.status=response.status;record.headersSeconds=(performance.now()-started)/1000;
    if(!response.ok){try{const data=await response.clone().json();record.providerError=String(data.error?.message||'').replace(/sk-[A-Za-z0-9_-]+/g,'[REDACTED]');}catch{}}
    if(!response.body)return response;
    const body=response.body.pipeThrough(new TransformStream({transform(chunk,c){const now=performance.now();record.maxSilence=Math.max(record.maxSilence,(now-last)/1000);last=now;if(!record.firstByteSeconds)record.firstByteSeconds=(now-started)/1000;record.bytes+=chunk.length;record.chunks++;tail=(tail+new TextDecoder().decode(chunk)).slice(-150);if(tail.includes('[DONE]'))record.totalSeconds=(now-started)/1000;c.enqueue(chunk);},flush(){record.totalSeconds=(performance.now()-started)/1000;}}));
    return new Response(body,{status:response.status,headers:response.headers});
   }catch(error){record.error=error.name;record.totalSeconds=(performance.now()-started)/1000;throw error;}
  };`});
});
key=null;
const {command,evaluate,wait,click,sleep}=b;
const matchingLocal=()=>evaluate('(async()=>{const d=await new Promise(r=>{const q=indexedDB.open("shiye-device-session-v1");q.onsuccess=()=>r(q.result)});return await new Promise(r=>{const q=d.transaction("records").objectStore("records").get(JSON.stringify(["browser","matching-session-v1"]));q.onsuccess=()=>r(q.result?.record||null)})})()');
const records=store=>evaluate(`(async()=>{const db=await new Promise(r=>{const q=indexedDB.open('shiye-pwa-full-v1');q.onsuccess=()=>r(q.result)});return await new Promise(r=>{const q=db.transaction('${store}').objectStore('${store}').getAll();q.onsuccess=()=>r(q.result)})})()`);
async function named(scope,label){await evaluate(`[...document.querySelectorAll(${JSON.stringify(scope+' button')})].find(b=>b.textContent.trim()===${JSON.stringify(label)}).click()`);}
async function monitor(name,completed){let last='',start=Date.now();for(;;){const done=await completed();const text=await evaluate(`document.querySelector('.match-progress')?.textContent||document.querySelector('#toast')?.textContent||''`);if(text!==last&&Date.now()-start>1000){console.log(name+': '+text.slice(-180).replace(/sk-[A-Za-z0-9_-]+/g,'[REDACTED]'));last=text;}if(done)return done;if(Date.now()-start>660000)throw Error(name+' live acceptance exceeded 11 minutes');await sleep(1000);}}
try{
 await wait('.series-grid');
 await evaluate(`(async()=>{const db=await new Promise(r=>{const q=indexedDB.open('shiye-pwa-full-v1');q.onsuccess=()=>r(q.result)}),now=new Date().toISOString(),canvas=document.createElement('canvas');canvas.width=160;canvas.height=220;const x=canvas.getContext('2d');x.fillStyle='#fff4d6';x.fillRect(0,0,160,220);x.fillStyle='#48976b';x.beginPath();x.ellipse(80,100,28,60,.6,0,Math.PI*2);x.fill();x.strokeStyle='#305a40';x.lineWidth=3;x.beginPath();x.moveTo(45,160);x.lineTo(100,60);x.stroke();const blob=await new Promise(r=>canvas.toBlob(r));await new Promise(r=>{const tx=db.transaction(['assets','blobs'],'readwrite');tx.objectStore('blobs').put({id:'live-synthetic-blob',data:blob});tx.objectStore('assets').put({id:'live-synthetic-asset',blobId:'live-synthetic-blob',originalBlobId:'live-synthetic-blob',title:'绿色叶片测试贴纸',kind:'sticker',role:'focal',tags:['绿色','叶片'],physicalWidthMM:30,physicalHeightMM:40,supply:{quantity:1},reviewStatus:'pending',usageStatus:'unused',createdAt:now});tx.oncomplete=r;});const local=await new Promise((resolve,reject)=>{const q=indexedDB.open('shiye-device-session-v1',1);q.onupgradeneeded=()=>{if(!q.result.objectStoreNames.contains('records'))q.result.createObjectStore('records',{keyPath:'key'});};q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});await new Promise((resolve,reject)=>{const tx=local.transaction('records','readwrite');tx.objectStore('records').put({key:JSON.stringify(['browser','matching-session-v1']),record:{id:'matching-session-v1',context:{basket:['live-synthetic-asset'],coreIDs:['live-synthetic-asset'],matchPurpose:'主题封面',matchPurposes:['主题封面'],matchStyle:'韩系清新',matchStyles:['韩系清新'],matchIntent:'生成简洁的植物收藏主题封面：必须使用这一个绿色叶片贴纸，只写“绿意收藏”标题和一小句客观说明，不编造日记经历。标题和贴纸不要重叠。满足完成检查后立即结束。',matchRatio:'a4',matchMode:'single'},variants:[]}});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});local.close();})()
 await command('Page.reload');await wait('.series-grid');
 if(phases.includes('recognition')){
 await click('.swift-tabs button:nth-child(2)','.asset-grid');await click('.library-select-toggle');await click('.asset-grid [data-id="live-synthetic-asset"]');await named('.library-management-tray','更多操作');await wait('.selection-more-menu');const startCount=(await evaluate('__liveRequests')).length;await named('.selection-more-menu','重新识别');
 const recognized=await monitor('recognition',async()=>{const a=(await records('assets')).find(a=>a.id==='live-synthetic-asset');if(a.reviewStatus==='ready')return a;const calls=await evaluate('__liveRequests');if(calls.length>startCount){const last=calls.at(-1);if(last.status&&last.status!==200)throw Error('Recognition HTTP '+last.status);if(last.error)throw Error('Recognition connection failed after '+last.totalSeconds.toFixed(1)+' seconds ('+last.error+')');}return null;});
 report.phases.push({name:'recognition',result:{title:recognized.title,kind:recognized.kind,tags:recognized.tags},requests:await evaluate('__liveRequests')});console.log('Recognition saved valid structured metadata.');
 }
 await click('[data-route="matching"]','.match-previews');
 for(mode of ['agent','direct']){
  if(!phases.includes(mode))continue;
  if(mode==='direct'){await evaluate(`const config=JSON.parse(localStorage.getItem('shiye-ai-settings-v2'));config.deliveryMode='json';localStorage.setItem('shiye-ai-settings-v2',JSON.stringify(config));`);await command('Page.reload');await wait('.series-grid');await click('[data-route="matching"]','.match-previews');}
  const existing=(await matchingLocal()).variants.length;await click('[data-act="match-generate"]');await wait('.match-progress');const result=await monitor(mode,async()=>{const session=(await matchingLocal());return session.variants.length>existing&&session.variants[0].status!=='running'?session.variants[0]:null;});
  const d=result.project.drafts[0],requests=await evaluate('__liveRequests');report.phases.push({name:mode,status:result.status,progress:result.progress,layers:{materials:d.items.length,texts:d.textBlocks.length,graphics:d.primitives.length},requests});console.log(mode+' ended '+result.status+', editable layers '+(d.items.length+d.textBlocks.length+d.primitives.length));
  if(result.status==='completed'){await click('[data-act="match-open-result"]','#canvas-page');await b.evaluate('document.fonts.ready');const shot=await command('Page.captureScreenshot',{format:'png'});await writeFile(out+'/'+mode+'-editor.png',Buffer.from(shot.data,'base64'));await click('[data-act="editor-done"]');await sleep(250);const linked=(await matchingLocal()).variants.find(v=>v.id===result.id)?.linkedProjectID,p=(await records('projects')).find(x=>x.id===linked);report.phases.at(-1).savedWork=!!p&&!p.isDraft;await click('[data-route="matching"]','.match-previews');}
 }
 report.errors=b.errors;await writeFile(out+'/report.json',JSON.stringify(report,null,2));console.log('Live acceptance report: '+out+'/report.json');
}catch(error){report.failure=String(error.message).replace(/sk-[A-Za-z0-9_-]+/g,'[REDACTED]');report.requests=await evaluate('__liveRequests').catch(()=>[]);await writeFile(out+'/report.json',JSON.stringify(report,null,2));console.log('Live acceptance incomplete: '+report.failure);process.exitCode=1;}
finally{await evaluate(`localStorage.removeItem('shiye-ai-settings-v2')`).catch(()=>{});await b.close();}
