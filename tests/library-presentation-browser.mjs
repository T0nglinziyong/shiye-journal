// Synthetic account in real Chromium. No private materials or network AI calls.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {browserHarness} from './browser-harness.mjs';
const out=process.env.SHIYE_LIBRARY_SCREENSHOTS||'/tmp/shiye-library-presentation';await mkdir(out,{recursive:true});
const b=await browserHarness('shiye-library-presentation',process.env.SHIYE_TEST_URL||'http://127.0.0.1:5193'),{command,evaluate,wait,click,sleep}=b;
const records=table=>evaluate(`(async()=>{const d=await new Promise(r=>{const q=indexedDB.open('shiye-pwa-full-v1');q.onsuccess=()=>r(q.result)});const result=await new Promise(r=>{const q=d.transaction('${table}').objectStore('${table}').getAll();q.onsuccess=()=>r(q.result)});d.close();return result})()`);
const set=async(selector,value)=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});const setter=Object.getOwnPropertyDescriptor(e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set;setter.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('change',{bubbles:true}));e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
const cover=n=>`[data-act="series-detail"][data-id="presentation-${n}"] .series-cover`;
const capture=async(name)=>{await sleep(100);const image=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(`${out}/${name}.png`,Buffer.from(image.data,'base64'));assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));};
try{
 await wait('.series-grid');
 await evaluate(`(async()=>{const db=await new Promise(r=>{const q=indexedDB.open('shiye-pwa-full-v1');q.onsuccess=()=>r(q.result)}),now=new Date().toISOString(),assets=[],blobs=[],series=[];
 for(let n=0;n<=6;n++){const id='presentation-'+n;series.push({id,title:'封面 '+n+' 件',createdAt:now,updatedAt:now});for(let i=0;i<n;i++){
 const c=document.createElement('canvas');c.width=i%3===0?160:360;c.height=i%3===1?110:260;const x=c.getContext('2d');x.fillStyle=['#e9d8b8','#a6bbba','#b0b58a','#8998af','#d4a292'][i%5];x.fillRect(0,0,c.width,c.height);x.strokeStyle='#576752';x.lineWidth=4;x.strokeRect(8,8,c.width-16,c.height-16);x.fillStyle='#334536';x.font='bold 28px serif';x.fillText('PAPER '+(i+1),14,48);x.fillStyle='#ba6651';x.fillRect(0,0,12,12);x.fillStyle='#436e9a';x.fillRect(c.width-12,c.height-12,12,12);
 const key=id+'-'+i;blobs.push({id:key+'-blob',data:await new Promise(r=>c.toBlob(r,'image/png'))});assets.push({id:key,blobId:key+'-blob',originalBlobId:key+'-blob',title:'合成纸片 '+i,seriesID:id,kind:n===2&&i===1?'tape':'paper',tapeAxis:'x',physicalWidthMM:c.width/10,physicalHeightMM:c.height/10,texture:n===1?'照片':'纸张',role:'background',reviewStatus:'ready',usageStatus:'unused',tags:[],createdAt:now,updatedAt:now});
 }}await new Promise(r=>{const tx=db.transaction(['series','assets','blobs'],'readwrite');series.forEach(s=>tx.objectStore('series').put(s));assets.forEach(a=>tx.objectStore('assets').put(a));blobs.forEach(b=>tx.objectStore('blobs').put(b));tx.oncomplete=r;});db.close()})()`);
 await command('Page.reload');await wait(cover(3));
 assert.equal(await evaluate(`document.querySelector(${JSON.stringify(cover(3))}).dataset.coverLayout`),'fan');
 assert.equal(await evaluate(`document.querySelector(${JSON.stringify(cover(4))}).dataset.coverLayout`),'grid');
 assert.equal(await evaluate(`document.querySelectorAll(${JSON.stringify(cover(6)+' [data-series-cover-item]')}).length`),4);
 // Cached images must use the same layout, contain fitting and 480px budget.
 for(const n of [1,2,3,4]){await evaluate(`document.querySelector(${JSON.stringify(cover(n))}).scrollIntoView({block:'center'})`);await wait(cover(n)+' .series-cover-snapshot');}
 assert.equal(await evaluate(`getComputedStyle(document.querySelector(${JSON.stringify(cover(3)+' .series-cover-snapshot')})).objectFit`),'contain');
 const beforeAssets=await records('assets');
 await click('[data-act="series-detail"][data-id="presentation-5"]','.series-contents');await click('#series-edit-title','#series-cover-layout');
 await set('#series-cover-layout','fan');assert.equal(await evaluate('document.querySelector(".series-editor-cover-preview .series-cover").dataset.coverLayout'),'fan');await click('#series-cancel');
 assert.equal((await records('series')).find(s=>s.id==='presentation-5').coverLayout,undefined,'cancel must not save preference');
 await click('#series-edit-title','#series-cover-layout');await set('#series-cover-layout','fan');await click('#series-save');await sleep(100);
 assert.equal((await records('series')).find(s=>s.id==='presentation-5').coverLayout,'fan');
 assert.equal(await evaluate('document.querySelector(".series-detail-cover .series-cover").dataset.coverLayout'),'fan');
 await command('Page.reload');await wait('.series-grid');assert.equal(await evaluate(`document.querySelector(${JSON.stringify(cover(5))}).dataset.coverLayout`),'fan');
 assert.deepEqual(await records('assets'),beforeAssets,'cover layouts must not mutate sources or membership');
 for(const [width,height] of [[390,844],[768,1024],[1024,768],[1440,900]]){
  await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<700});await evaluate('window.scrollTo(0,0)');await capture('series-'+width+'x'+height);
  const boxes=await evaluate('[...document.querySelectorAll(".series-cover-composed")].map(e=>{const r=e.getBoundingClientRect();return {w:r.width,h:r.height,layout:e.dataset.coverLayout}})');assert.ok(boxes.every(r=>r.w>0&&Math.abs(r.w/r.h-1.2)<.03),JSON.stringify(boxes));
 }
 // Full asset edit surface exposes one current choice per group, and preserves
 // descriptive metadata until the user selects a canonical material explicitly.
 await click('[data-act="series-detail"][data-id="presentation-1"]','.series-contents');await click('[data-act="detail"][data-id="presentation-1-0"]','.detail-page');await click('[data-act="detail-edit"]','#asset-texture');
 assert.ok(await evaluate('document.querySelectorAll("#asset-kind optgroup").length>1&&document.querySelectorAll("#asset-role optgroup").length>1&&document.querySelectorAll("#asset-texture optgroup").length>1'));
 assert.equal(await evaluate('document.querySelector("#asset-texture").value'),'照片');await set('#asset-texture','相纸');
 await capture('taxonomy-editor');await click('#save-asset');await sleep(100);assert.equal((await records('assets')).find(a=>a.id==='presentation-1-0').texture,'相纸');
 await click('[data-route="matching"]','.match-creative-controls');
 for(const [width,height] of [[390,844],[768,1024],[1024,768],[1440,900]]){
  await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<700});await evaluate('window.scrollTo(0,0)');await sleep(80);
  const fields=await evaluate('[...document.querySelectorAll(".match-creative-controls select")].map(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {w:r.width,h:r.height,x:r.x,y:r.y,font:s.fontSize}})');assert.equal(fields.length,6);assert.ok(fields.every(f=>f.font==='14px'&&f.h>=44),JSON.stringify(fields));
  const columns=width<=680?2:3;assert.ok(fields.slice(0,columns).every(f=>Math.abs(f.y-fields[0].y)<1)&&fields[columns].y>fields[0].y);
  await set('.match-direction-choice[data-group="mood"]','杂志排版');assert.equal(await evaluate('document.querySelector(".match-direction-choice[data-group=mood]").value'),'杂志排版');
  await capture('matching-'+width+'x'+height);
 }
 assert.deepEqual(b.errors,[]);console.log('LIBRARY_PRESENTATION_PASS: adaptive+persisted covers, cache/tape path, original records unchanged, taxonomy edit, 14px/44px matching controls; 4 viewport simulations');
}finally{await b.close();}
