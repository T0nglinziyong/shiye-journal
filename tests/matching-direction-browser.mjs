import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {browserHarness} from './browser-harness.mjs';
const out='/tmp/shiye-matching-direction';await mkdir(out,{recursive:true});
const b=await browserHarness('shiye-matching-direction',process.env.SHIYE_TEST_URL||'http://localhost:5175');
const {command,evaluate,wait,click,sleep}=b;
try{
 await wait('.series-grid');
 await evaluate(`(async()=>{const db=await new Promise(r=>{const q=indexedDB.open('shiye-pwa-full-v1');q.onsuccess=()=>r(q.result)});const tx=db.transaction(['assets','meta'],'readwrite');const assets=[['travel-ticket','paper','旅行车票','旅途'],['travel-photo','photo','旅途照片','旅行'],['todo-paper','paper','清单便签','计划'],['flower-sticker','sticker','花朵贴纸','植物']];for(const [id,kind,title,tag] of assets)tx.objectStore('assets').put({id,blobId:id,staticPath:'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2240%22 height=%2250%22%3E%3Crect width=%2240%22 height=%2250%22 fill=%22%2387ae7d%22/%3E%3C/svg%3E',title,kind,tags:[tag],reviewStatus:'ready',physicalWidthMM:30,physicalHeightMM:40,supply:{quantity:1},createdAt:new Date().toISOString()});tx.objectStore('meta').put({id:'matching-session-v1',context:{basket:[],coreIDs:[],excludedAssetIDs:[],matchStyle:'旅行票据',matchStyles:['旅行票据'],matchPurpose:'旅途记录',matchPurposes:['旅途记录']},variants:[]});await new Promise(r=>tx.oncomplete=r)})()`);
 await command('Page.reload');await wait('.series-grid');await click('[data-route="matching"]','.match-recommendations');
 assert.ok(await evaluate('document.querySelector(".match-direction").compareDocumentPosition(document.querySelector(".match-recommendations")) & Node.DOCUMENT_POSITION_FOLLOWING'));
 const first=await evaluate('document.querySelector(".match-rec strong")?.textContent');assert.match(first,/旅途|车票/);
 await evaluate(`(()=>{const el=document.querySelector('#match-purpose');for(const option of el.options)option.selected=option.value==='清单计划';el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 await sleep(100);assert.equal(await evaluate('document.querySelector(".match-rec strong")?.textContent'),'清单便签');
 await click('.match-rec [data-act="match-skip"]','.match-recommendations');
 assert.ok(await evaluate('document.querySelector(".match-recommendations").textContent.includes("已排除 1 件")'));
 await click('#top-settings','.settings-list');await click('[data-act="settings-open"][data-val="AI 与创作"]','#setting-ai-auto-recommendations');
 assert.equal(await evaluate('document.querySelector("#setting-ai-require-all").checked'),true);
 await evaluate('document.querySelector("#setting-ai-auto-recommendations").checked=true');await click('[data-act="settings-save"]','.match-recommendations');
 assert.ok(await evaluate('document.querySelector(".basket>.muted").textContent.includes("AI 备选")'));
 assert.equal(await evaluate('document.querySelector("[data-act=match-generate]").disabled'),false);
 await command('Page.reload');await wait('.series-grid');await click('[data-route="matching"]','.match-recommendations');
 assert.ok(await evaluate('document.querySelector(".match-recommendations").textContent.includes("已排除 1 件")'));
 await click('.match-rec [data-act="basket"]','.match-basket-item');
 assert.equal(await evaluate('document.querySelector("[data-act=match-core]").disabled'),false);
 await click('[data-act="match-core"]','.match-basket-item [aria-pressed="true"]');
 assert.deepEqual(await evaluate('[...document.querySelectorAll(".match-generate button")].map(button=>button.textContent.trim())'),['进行AI创作','导出给网页版 AI','导入 AI 结果','不使用 AI，手动创作']);
 assert.ok(await evaluate('(()=>{const sizes=[...document.querySelectorAll(".match-basket-actions button")].map(button=>{const r=button.getBoundingClientRect();return [r.width,r.height];});return sizes.length===3&&sizes.every(([w,h])=>w===sizes[0][0]&&h===sizes[0][1]&&h<=28);})()'));
 for(const [w,h] of [[390,844],[768,1024],[1024,768],[1440,900]]){await command('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:w<700});await sleep(120);await evaluate('scrollTo(0,0)');const png=await command('Page.captureScreenshot',{format:'png'});await writeFile(out+'/'+w+'x'+h+'.png',Buffer.from(png.data,'base64'));if(w===390){await evaluate('document.querySelector(".basket").scrollIntoView({block:"center"})');const basket=await command('Page.captureScreenshot',{format:'png'});await writeFile(out+'/390x844-basket.png',Buffer.from(basket.data,'base64'));}assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));}
 await click('[data-act="create-from-basket"]','#modal .manual-layout-dialog');assert.equal(await evaluate('document.querySelectorAll("[data-manual-template]").length'),5);assert.ok(await evaluate('document.querySelector("[data-manual-template]").textContent.includes("推荐")'));await click('[data-manual-template]','#canvas-page');
 assert.deepEqual(b.errors,[]);console.log('Direction-first matching passed: recommendation changes on purpose, exclusion persists, and four viewport layouts do not overflow.');
}finally{await b.close();}
