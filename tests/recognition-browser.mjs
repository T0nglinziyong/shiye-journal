import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {browserHarness} from './browser-harness.mjs';
const photo=process.env.SHIYE_IMPORT_PHOTO?(await readFile(process.env.SHIYE_IMPORT_PHOTO)).toString('base64'):null;
const b=await browserHarness('shiye-recognition-profiles',process.env.SHIYE_TEST_URL||'http://localhost:5175',async({command})=>{
 await command('Page.addScriptToEvaluateOnNewDocument',{source:`globalThis.__vision=[];const Native=Worker;globalThis.Worker=class extends Native{postMessage(message,transfer){globalThis.__vision.push({operation:message.operation,width:message.parameters.width,height:message.parameters.height});return super.postMessage(message,transfer);}};`});
});
const {click,evaluate,wait,sleep}=b;
try{
 await wait('.series-grid');
 for(const [profile,size] of [['fast',600],['standard',1000],['detail',1600]]){
  await click('#top-settings','.settings-page');await click('[data-val="导入与识别"]','#setting-recognition');await evaluate(`document.querySelector('#setting-recognition').value='${profile}'`);await click('[data-act="settings-save"]');assert.equal(await evaluate('JSON.parse(localStorage.getItem("shiye-ui-preferences-v1")).recognition'),profile);
  await click('[data-route="library"]','.series-grid');await click('.swift-tabs button:nth-child(2)','.asset-grid');await click('[data-act="import"]','.import-nav');
  await evaluate(`(async()=>{${photo?'const blob=new Blob([Uint8Array.from(atob('+JSON.stringify(photo)+'),c=>c.charCodeAt(0))],{type:"image/jpeg"});':'const c=document.createElement("canvas");c.width=1800;c.height=2400;const x=c.getContext("2d");x.fillStyle="#555";x.fillRect(0,0,1800,2400);x.fillStyle="#eeeded";x.fillRect(100,100,1600,2200);x.fillStyle="#5789c3";x.fillRect(300,400,450,600);const blob=await new Promise(r=>c.toBlob(r));'}const input=document.querySelector('#file-input'),dt=new DataTransfer();dt.items.add(new File([blob],'local-test.jpg',{type:blob.type}));input.files=dt.files;input.dispatchEvent(new Event('change'));})()`);
  await wait('.import-inspect[aria-busy="true"]');await wait('.import-inspect[aria-busy="false"]');const results=await evaluate('({analysis:globalThis.__vision.filter(x=>x.operation==="instances").at(-1),candidates:document.querySelectorAll(".import-candidate-tile").length})');assert.ok(Math.max(results.analysis.width,results.analysis.height)<=size);assert.ok(results.candidates>0);console.log(profile,JSON.stringify(results));if(photo&&profile==='fast'){const images=await evaluate('Promise.all([...document.querySelectorAll(".candidate-thumb img")].map(async im=>{await im.decode();const c=document.createElement("canvas");c.width=im.naturalWidth;c.height=im.naturalHeight;c.getContext("2d").drawImage(im,0,0);return c.toDataURL().split(",")[1];}))');for(let i=0;i<images.length;i++)await writeFile('/tmp/shiye-profile-fast-'+i+'.png',Buffer.from(images[i],'base64'));}await evaluate('globalThis.confirm=()=>true');await click('[data-act="import-exit"]');await sleep(50);
 }
 assert.deepEqual(b.errors,[]);
}finally{await b.close();}
