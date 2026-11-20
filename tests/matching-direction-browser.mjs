import assert from 'node:assert/strict';
import {installUiCloudBase} from './fixtures/ui-cloudbase-harness.mjs';
import {browserHarness} from './browser-harness.mjs';

const assets=[['travel-ticket','paper','旅行车票','旅途'],['travel-photo','photo','旅途照片','旅行'],
  ['todo-paper','paper','清单便签','计划'],['flower-sticker','sticker','花朵贴纸','植物']]
  .map(([id,kind,title,tag])=>({id,blobId:id,staticPath:'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2240%22 height=%2250%22%3E%3Crect width=%2240%22 height=%2250%22 fill=%22%2387ae7d%22/%3E%3C/svg%3E',
    title,kind,role:'focal',tags:[tag],reviewStatus:'ready',physicalWidthMM:30,physicalHeightMM:40,
    supply:{quantity:1},createdAt:new Date().toISOString()}));
const browser=await browserHarness('shiye-matching-direction',process.env.SHIYE_TEST_URL||'http://localhost:5175',async({command})=>{
  await command('Page.addScriptToEvaluateOnNewDocument',{source:`{const assert={equal(a,b){if(a!==b)throw Error('fixture assertion failed')}};(${installUiCloudBase.toString()})(window,{assets:${JSON.stringify(assets)}});}`});
});
const {command,evaluate,wait,click,sleep,errors}=browser;
try{
  await wait('.series-grid');
  await click('[data-route="matching"]','.match-recommendations');
  await click('.match-direction summary','.match-direction[open]');
  await evaluate(`(()=>{const choice=document.querySelector('[data-direction="purpose"][data-group="page"]');choice.value='清单计划';choice.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  for(let attempt=0;attempt<30&&await evaluate('document.querySelector(".match-rec strong")?.textContent')!=='清单便签';attempt++)await sleep(100);
  assert.equal(await evaluate('document.querySelector(".match-rec strong")?.textContent'),'清单便签');
  await click('.match-rec [data-act="match-skip"]');
  await click('[data-act="match-filter"][data-val="不使用"]');
  await sleep(200);
  assert.ok(await evaluate('document.querySelector(".match-recommendations").textContent.includes("清单便签")'),await evaluate('document.querySelector(".match-recommendations")?.textContent'));
  await click('[data-route="works"]','.works-page');
  await click('[data-route="matching"]','.match-recommendations');
  await click('[data-act="match-filter"][data-val="不使用"]');
  assert.ok(await evaluate('document.querySelector(".match-recommendations").textContent.includes("清单便签")'));
  await click('[data-act="match-filter"][data-val="全部"]');
  await click('.match-rec [data-act="basket"]','.match-stage-item');
  assert.ok(await evaluate('document.querySelector(".match-stage-section summary small").textContent.includes("1 件")'));
  for(const [width,height] of [[390,844],[768,1024],[1024,768],[1440,900]]){
    await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<700});
    await sleep(100);
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),`横向溢出 ${width}×${height}`);
  }
  await click('[data-act="create-from-basket"]','.manual-layout-dialog');
  assert.ok(await evaluate('document.querySelectorAll("[data-manual-template]").length>=3'));
  await click('[data-manual-template]:not([data-manual-template="stage"]):not([data-manual-template=""])','#canvas-page');
  assert.deepEqual(errors,[]);
  console.log('Matching direction, exclusion persistence and manual template creation passed');
}finally{await browser.close();}
