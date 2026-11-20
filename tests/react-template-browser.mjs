import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';

const browser=await browserHarness('shiye-react-template',
  process.env.SHIYE_TEST_URL||'http://127.0.0.1:5173');
const {click,evaluate,wait,sleep,command,errors}=browser;
try{
  await wait('.series-grid');
  await click('[data-route="works"]','.works-grid');
  const workCover=await evaluate('(()=>{const card=document.querySelector(".work-entry"),r=card.querySelector(".card-image").getBoundingClientRect();return {width:r.width,height:r.height,cardHeight:card.getBoundingClientRect().height}})()');
  await click('.swift-tabs button:nth-child(4)','.journal-template-grid');
  const templateCover=await evaluate('(()=>{const r=document.querySelector(".journal-template-import-card .card-image").getBoundingClientRect();return {width:r.width,height:r.height}})()');
  assert.ok(Math.abs(templateCover.height-workCover.height)<2,JSON.stringify({workCover,templateCover}));
  const presetSize=await evaluate('(()=>{const card=document.querySelector(".journal-template-card");return {cover:card.querySelector(".card-image").getBoundingClientRect().height,card:card.getBoundingClientRect().height}})()');
  assert.ok(Math.abs(presetSize.cover-workCover.height)<2&&Math.abs(presetSize.card-workCover.cardHeight)<8,JSON.stringify({workCover,presetSize}));
  await click('[data-template-import]','[data-template-save]');
  await evaluate(`(()=>{
    const bytes=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/NwAAAABJRU5ErkJggg=='),c=>c.charCodeAt(0));
    const image=new File([bytes],'template.png',{type:'image/png'});
    const transfer=new DataTransfer();transfer.items.add(image);
    document.querySelector('[name="templateImage"]').files=transfer.files;
    document.querySelector('[name="title"]').value='React 模板导入验收';
    document.querySelector('[name="structure"]').value='上方主图，下方文字。';
    document.querySelector('[name="tags"]').value='测试,双列';
    return true;
  })()`);
  await click('[data-template-save]');
  await wait('.journal-template-detail-card');
  assert.ok(await evaluate('document.querySelector(".journal-template-detail-card h1").textContent.includes("React 模板导入验收")'));
  assert.ok(await evaluate('document.querySelector("[data-template-side=elements]").disabled'));
  assert.equal(await evaluate('!!document.querySelector(".journal-template-filters")'),false);
  await click('[data-template-back]','.journal-template-card');
  await click('[data-template-id="center-1"]','.journal-template-detail-card');
  await click('[data-template-side="case"]','.journal-template-detail-image');
  assert.ok(await evaluate('document.querySelector(".journal-template-detail-image img")?.src.includes("/journal-cases/handwritten-observation.png")'));
  await click('[data-template-side="elements"]','.journal-template-elements-view');
  assert.equal(await evaluate('document.querySelector(".journal-template-elements-view").dataset.toolTemplateId'),'center-1');
  assert.ok(await evaluate('document.querySelectorAll(".journal-template-element[data-slot-id]").length>10'));
  for(const [width,height] of [[390,844],[768,1024],[1024,768],[1440,900]]){
    await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<700});
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),`Template detail overflow at ${width}×${height}`);
  }
  await click('[data-template-back]','.journal-template-card');
  await click('[data-filter-heading="类型"]','.swift-popover');
  await evaluate('[...document.querySelectorAll(".swift-popover [role=menuitemradio]")].find(button=>button.textContent==="参考案例").click()');
  assert.ok(await evaluate('!!document.querySelector("[data-template-id=centered-writing-sheet]")'));
  await click('[data-template-id="centered-writing-sheet"]','.journal-template-detail-card');
  assert.ok(await evaluate('!document.querySelector("[data-template-side=case]").disabled'));
  await click('[data-template-back]','.journal-template-card');
  assert.ok(await evaluate(`(()=>{const cover=document.querySelector('.journal-template-card .card-image').getBoundingClientRect(),entry=document.querySelector('.journal-template-import-card .card-image').getBoundingClientRect();return Math.abs(cover.height/cover.width-entry.height/entry.width)<.02})()`));
  await click('[data-filter-heading="类型"]','.swift-popover');
  await evaluate('[...document.querySelectorAll(".swift-popover [role=menuitemradio]")].find(button=>button.textContent==="我的模板").click()');
  await sleep(100);
  assert.equal(await evaluate('document.querySelectorAll(".journal-template-card").length'),1);
  assert.ok(await evaluate('document.querySelector(".journal-template-card h3").textContent.includes("React 模板导入验收")'));
  await click('.journal-template-card','.journal-template-detail-card');
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await click('[data-route="matching"]','.match-recommendations');
  const folded=await evaluate('([...document.querySelectorAll(".match-direction>.match-panel-head,.match-stage-section>.match-panel-head,.match-recommendations>.match-panel-head")].map(node=>node.getBoundingClientRect().height))');
  assert.equal(new Set(folded).size,1,`Matching fold headers differ: ${folded}`);
  await click('.match-direction>.match-panel-head','.match-direction[open]');
  assert.equal(await evaluate('document.querySelector(".match-direction>.match-panel-head").getBoundingClientRect().height'),folded[0]);
  assert.deepEqual(errors,[]);
  console.log('React template import, filter and detail verified in isolated Chromium');
}finally{await browser.close();}
