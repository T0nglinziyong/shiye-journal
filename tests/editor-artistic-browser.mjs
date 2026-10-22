import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {browserHarness} from './browser-harness.mjs';
const base=process.env.SHIYE_TEST_URL||'http://127.0.0.1:5193',out='/tmp/shiye-editor-artistic';
const b=await browserHarness('shiye-editor-artistic',base+'/tests/fixtures/processed-material-preview.html',async({command})=>command('Emulation.setDeviceMetricsOverride',{width:1200,height:900,deviceScaleFactor:1,mobile:false}));
const {evaluate,command,wait,sleep,click}=b;
const poll=async fn=>{for(let i=0;i<200;i++){if(await fn())return;await sleep(25);}throw Error('Condition timeout');};
const pixels=()=>evaluate(`(()=>{const c=document.querySelector('.material-piece-thumbnail'),x=c.getContext('2d'),p=(u,v)=>[...x.getImageData(Math.round(c.width*u),Math.round(c.height*v),1,1).data];return {center:p(.5,.5),left:p(.25,.5),right:p(.8,.5),id:c.dataset.pieceId};})()`);
const set=async(selector,value)=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('change',{bubbles:true}));e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
const projects=()=>evaluate(`(async()=>{const db=await new Promise(r=>{const q=indexedDB.open('shiye-pwa-full-v1');q.onsuccess=()=>r(q.result)});const rows=await new Promise(r=>{const q=db.transaction('projects').objectStore('projects').getAll();q.onsuccess=()=>r(q.result)});db.close();return rows;})()`);
const texts=async()=>{const rows=await projects();return rows[0]?.drafts[0].layers.filter(n=>n.type==='text')||[];};
try{
 await poll(()=>evaluate('window.__previewReady===true'));
 await wait('.material-piece-thumbnail[data-preview-state="ready"]');
 assert.deepEqual((await pixels()).center,[0,0,255,255]);assert.equal((await pixels()).id,'ai-piece');
 assert.deepEqual(await evaluate('window.__previewFixture.reads'),['pinned']);
 assert.equal(await evaluate('window.__fontEvidence.different'),true);assert.ok(await evaluate('window.__fontEvidence.families.some(f=>f.family.includes("Ma Shan Zheng")&&f.status==="loaded")'));
 await evaluate(`window.__previewFixture.setItem({materialMask:{shape:'region',outer:[[0,0],[1,0],[1,1],[0,1]],holes:[[[.4,.4],[.6,.4],[.6,.6],[.4,.6]]]},vectorMask:{outer:[[0,0],[.7,0],[.7,1],[0,1]],holes:[]}})`);
 await poll(async()=>{try{return (await pixels()).center[3]===0;}catch{return false;}});const masked=await pixels();assert.equal(masked.right[3],0);assert.deepEqual(masked.left,[0,0,255,255]);
 await mkdir(out,{recursive:true});let shot=await command('Page.captureScreenshot',{format:'png'});await writeFile(out+'/processed-and-fonts.png',Buffer.from(shot.data,'base64'));
 await evaluate('window.__previewFixture.setUsed(false)');await poll(()=>evaluate('!document.querySelector(".material-piece-thumbnail")&&document.querySelector(".sample img").naturalWidth===300'));
 assert.ok((await evaluate('window.__previewFixture.reads')).includes('latest'));assert.equal(await evaluate('window.__previewError||null'),null);
 // Actual application controls, not just a synthetic renderer.
 await command('Page.navigate',{url:base+'/'});await wait('.series-grid');await click('[data-route="works"]','.works-grid');await click('#work-create','#blank-create-confirm');await click('#blank-create-confirm','.upper-canvas');
 await click('[data-val="text"]');assert.equal(await evaluate('document.querySelector("select[aria-label=字体]").value'),'hand');
 await evaluate('document.querySelector(".upper-canvas").scrollIntoView({block:"center"})');
 const point=await evaluate('(()=>{const r=document.querySelector(".upper-canvas").getBoundingClientRect();return {x:r.left+r.width*.4,y:r.top+r.height*.4}})()');
 await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...point});await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,...point});
 await poll(()=>evaluate('!!document.activeElement?.matches("textarea")'));await command('Input.insertText',{text:'艺术手帐'});
 await poll(async()=>(await texts())[0]?.content==='艺术手帐');assert.equal((await texts())[0].style,'hand');
 await click('[aria-label="文字样式"]','select[aria-label="艺术字效果"]');await set('select[aria-label="艺术字效果"]','gradient-outline');
 await poll(async()=>(await texts())[0]?.textOutline&&(await texts())[0]?.textGradient);
 await click('[data-act="back-works"]','.works-grid');await click('[data-act="open-project"]','.upper-canvas');
 const saved=(await texts())[0];assert.ok(saved.textOutline&&saved.textGradient);assert.equal(saved.content,'艺术手帐');assert.equal(saved.style,'hand');
 for(const [width,height] of [[390,844],[768,1024],[1024,768],[1440,900]]){await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<700});await sleep(80);assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);shot=await command('Page.captureScreenshot',{format:'png'});await writeFile(out+`/editor-${width}x${height}.png`,Buffer.from(shot.data,'base64'));}
 assert.deepEqual(b.errors,[]);console.log('EDITOR_ARTISTIC_PREVIEW_PASS: pinned lazy source + crop/masks, real loaded artistic font, manual effect controls, saved editable text, four viewport simulations');
}finally{await b.close();}
