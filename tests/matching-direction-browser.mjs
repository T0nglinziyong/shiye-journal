import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {installUiCloudBase} from './fixtures/ui-cloudbase-harness.mjs';
import {browserHarness} from './browser-harness.mjs';
const out='/tmp/shiye-matching-direction';await mkdir(out,{recursive:true});
const fixtureAssets=[['travel-ticket','paper','旅行车票','旅途'],['travel-photo','photo','旅途照片','旅行'],['todo-paper','paper','清单便签','计划'],['flower-sticker','sticker','花朵贴纸','植物']].map(([id,kind,title,tag])=>({id,blobId:id,staticPath:'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2240%22 height=%2250%22%3E%3Crect width=%2240%22 height=%2250%22 fill=%22%2387ae7d%22/%3E%3C/svg%3E',title,kind,role:'focal',tags:[tag],reviewStatus:'ready',physicalWidthMM:30,physicalHeightMM:40,supply:{quantity:1},createdAt:new Date().toISOString()}));
const b=await browserHarness('shiye-matching-direction',process.env.SHIYE_TEST_URL||'http://localhost:5175',async({command})=>{
 await command('Page.addScriptToEvaluateOnNewDocument',{source:`{const assert={equal(a,b){if(a!==b)throw Error('fixture assertion failed')}};(${installUiCloudBase.toString()})(window,{assets:${JSON.stringify(fixtureAssets)}});}`});
});
const {command,evaluate,wait,click,sleep}=b;
try{
 await wait('.series-grid');
 await click('[data-route="matching"]','.match-recommendations');
 assert.ok(await evaluate('document.querySelector(".match-direction").compareDocumentPosition(document.querySelector(".match-recommendations")) & Node.DOCUMENT_POSITION_FOLLOWING'));
 assert.equal(await evaluate(`document.querySelector('[data-group="mood"]').value`),'随材而定');
 assert.equal(await evaluate('document.querySelector("#match-content-policy").value'),'original');
 await evaluate(`(()=>{const page=document.querySelector('[data-direction="purpose"][data-group="page"]');page.value='清单计划';page.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 for(let attempt=0;attempt<30&&await evaluate('document.querySelector(".match-rec strong")?.textContent')!=='清单便签';attempt++)await sleep(100);
 assert.equal(await evaluate('document.querySelector(".match-rec strong")?.textContent'),'清单便签');
 await evaluate(`(()=>{const control=document.querySelector('#match-content-policy');control.value='documentary';control.dispatchEvent(new Event('change',{bubbles:true}));})()`);await sleep(50);
 assert.match(await evaluate('document.querySelector("#match-intent").placeholder'),/几个词/);
 await click('.match-rec [data-act="match-skip"]','.match-recommendations');
 assert.ok(await evaluate('document.querySelector(".match-recommendations").textContent.includes("已排除 1 件")'));
 await click('#top-settings','.settings-list');await click('[data-act="settings-open"][data-val="AI 与创作"]','#setting-ai-auto-recommendations');
 assert.equal(await evaluate('document.querySelector("#setting-ai-require-all").checked'),true);
 await evaluate('document.querySelector("#setting-ai-auto-recommendations").checked=true');await click('[data-act="settings-save"]','.match-recommendations');
 assert.ok(await evaluate('document.querySelector(".basket>.muted").textContent.includes("AI 备选")'));
 assert.equal(await evaluate('document.querySelector("[data-act=match-generate]").disabled'),false);
 await click('[data-route="works"]','.works-page');await click('[data-route="matching"]','.match-recommendations');
 assert.ok(await evaluate('document.querySelector(".match-recommendations").textContent.includes("已排除 1 件")'));
 await click('.match-rec [data-act="basket"]','.match-basket-item');
 assert.match(await evaluate('document.querySelector(".match-basket-item .match-type")?.textContent||""'),/^(纸张|照片|贴纸) · 主角$/);
 assert.equal(await evaluate('document.querySelector("[data-act=match-core]").disabled'),false);
 await click('[data-act="match-core"]','.match-basket-item [aria-pressed="true"]');
 assert.deepEqual(await evaluate('[...document.querySelectorAll(".match-generate button")].map(button=>button.textContent.trim())'),['进行AI创作','导出给网页版 AI','导入 AI 结果','不使用 AI，手动创作']);
 const basketGeometry=await evaluate('(()=>{const card=document.querySelector(".match-basket-item"),recommended=document.querySelector(".match-rec button"),buttons=[...document.querySelectorAll(".match-basket-actions button")];return {card:card&&{border:getComputedStyle(card).borderTopWidth,radius:getComputedStyle(card).borderTopLeftRadius},recommended:recommended&&{height:recommended.getBoundingClientRect().height,radius:getComputedStyle(recommended).borderRadius,padding:getComputedStyle(recommended).padding,font:getComputedStyle(recommended).fontSize},buttons:buttons.map(button=>({height:button.getBoundingClientRect().height,radius:getComputedStyle(button).borderRadius,padding:getComputedStyle(button).padding,font:getComputedStyle(button).fontSize}))};})()');
 assert.ok(basketGeometry.card&&parseFloat(basketGeometry.card.border)>0&&parseFloat(basketGeometry.card.radius)>=10&&basketGeometry.buttons.length===2&&basketGeometry.buttons.every(button=>button.height>=26&&button.height<=29&&button.radius===basketGeometry.recommended.radius&&button.padding===basketGeometry.recommended.padding&&button.font===basketGeometry.recommended.font),JSON.stringify(basketGeometry));
 for(const [w,h] of [[390,844],[768,1024],[1024,768],[1440,900]]){await command('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:w<700});await sleep(120);const boxes=await evaluate('[...document.querySelectorAll(".match-creative-controls select")].map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})');assert.equal(boxes.length,4);assert.ok(Math.abs(boxes[0].w-boxes[1].w)<1&&boxes[0].y===boxes[1].y&&boxes[2].y===boxes[3].y&&boxes[2].y>boxes[0].y,JSON.stringify(boxes));await evaluate('scrollTo(0,0)');const png=await command('Page.captureScreenshot',{format:'png'});await writeFile(out+'/'+w+'x'+h+'.png',Buffer.from(png.data,'base64'));if(w===390){await evaluate('document.querySelector(".basket").scrollIntoView({block:"center"})');const basket=await command('Page.captureScreenshot',{format:'png'});await writeFile(out+'/390x844-basket.png',Buffer.from(basket.data,'base64'));}assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));}
 await click('[data-act="create-from-basket"]');await sleep(200);assert.ok(await evaluate('!!document.querySelector("[role=dialog].manual-layout-dialog")'),JSON.stringify({errors:b.errors,diagnostic:await evaluate('({buttons:[...document.querySelectorAll("[data-act=create-from-basket]")].map(x=>({disabled:x.disabled,html:x.outerHTML.slice(0,300)})),modal:document.querySelector("#modal")?.open,body:document.querySelector("#modal-body")?.innerHTML.slice(0,150),route:document.querySelector("#view")?.firstElementChild?.className,toast:document.querySelector("#toast")?.textContent})')}));assert.equal(await evaluate('document.querySelectorAll("[data-manual-template]").length'),5);assert.ok(await evaluate('document.querySelector("[data-manual-template]").textContent.includes("推荐")'));await click('[data-manual-template]','#canvas-page');
 assert.deepEqual(b.errors,[]);console.log('Direction-first matching passed: recommendation changes on purpose, exclusion persists, and four viewport layouts do not overflow.');
}finally{await b.close();}
