import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';
import {installUiCloudBase} from './fixtures/ui-cloudbase-harness.mjs';
import {project} from '../src/domain.js';

const work=project('模板库验收作品');
work.isDraft=false;
work.coverStaticPath='data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"/>';
work.coverBaselineUpdatedAt=work.updatedAt;
const browser=await browserHarness('shiye-react-template',
  process.env.SHIYE_TEST_URL||'http://127.0.0.1:5173',async({command})=>{
    await command('Page.addScriptToEvaluateOnNewDocument',
      {source:`(${installUiCloudBase.toString()})(window,{projects:${JSON.stringify([work])}});`});
  });
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
  await wait('[data-template-id="D143"] .card-image img');
  assert.ok(await evaluate('document.querySelector("[data-template-id=D143] .card-image img").getAttribute("src").includes("/template-defaults/D143.jpg")'));
  await click('[data-template-id="D143"]','.journal-template-detail-card');
  assert.ok(await evaluate('document.querySelector(".detail-category").textContent==="新模板"'));
  assert.ok(await evaluate('document.querySelector(".journal-template-detail-card h1").textContent.includes("蓝色分段问答")'));
  assert.ok(await evaluate('!!document.querySelector("[data-template-side=case]")'));
  await wait('.journal-template-detail-image img');
  await evaluate(`(async()=>{
    const canvas=document.createElement('canvas');canvas.width=2;canvas.height=2;
    canvas.getContext('2d').fillRect(0,0,2,2);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg'));
    window.__SHIYE_UI_CLOUD__.state.objects.set('journal-presets/template-cases/v1/case-01.jpg',blob);
  })()`);
  await click('[data-template-side="case"]','.journal-template-detail-image img[alt*="真实案例"]');
  assert.ok(await evaluate('document.querySelector(".journal-template-detail-image img").alt.includes("真实案例")'));
  await click('[data-template-side="template"]','.journal-template-basic');
  assert.ok(await evaluate('!!document.querySelector(".journal-template-basic-stage img")'));
  assert.equal(await evaluate('!!document.querySelector(".journal-template-basic-inspector")'),false);
  await click('.journal-template-basic-hit[data-slot-id="dark-stripe"]','.journal-template-basic-inspector');
  assert.equal(await evaluate('document.querySelector("[data-inspected-slot]").dataset.inspectedSlot'),'dark-stripe');
  assert.ok(await evaluate('document.querySelector(".journal-template-basic-inspector").textContent.includes("替换条件")'));
  assert.ok(await evaluate('document.querySelector(".journal-template-basic-inspector").textContent.includes("按得分从高到低排列")'));
  assert.ok(await evaluate('document.querySelector(".journal-template-basic-inspector").textContent.includes("评分方式")'));
  assert.ok(await evaluate('document.querySelector(".journal-template-basic-operations").textContent.includes("material.add")'));
  assert.ok(await evaluate('(()=>{const view=document.querySelector(".journal-template-detail-card"),details=document.querySelector(".journal-template-basic-inspector");return details.getBoundingClientRect().bottom<=view.getBoundingClientRect().bottom+1})()'));
  for(const [width,height] of [[390,844],[768,1024],[1440,900]]){
    await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<700});
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),`New template detail overflow at ${width}×${height}`);
    assert.ok(await evaluate('(()=>{const view=document.querySelector(".journal-template-detail-card"),details=document.querySelector(".journal-template-basic-inspector");return details.getBoundingClientRect().bottom<=view.getBoundingClientRect().bottom+1})()'));
  }
  await click('[data-template-back]','.journal-template-card');
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
  assert.equal(await evaluate('!!document.querySelector(".journal-template-basic-inspector")'),false);
  assert.equal(await evaluate('!!document.querySelector("[data-template-side=case]")'),false);
  assert.equal(await evaluate('!!document.querySelector(".journal-template-filters")'),false);
  await click('[data-template-back]','.journal-template-card');
  await click('[data-filter-heading="类型"]','.swift-popover');
  await evaluate('[...document.querySelectorAll(".swift-popover [role=menuitemradio]")].find(button=>button.textContent==="旧模板").click()');
  await evaluate('window.scrollTo(0,500);document.querySelector("[data-template-id=center-1]").click()');
  await wait('.journal-template-detail-card');
  assert.equal(await evaluate('window.scrollY'),0);
  assert.ok(await evaluate('document.querySelector("[data-template-back] svg path")?.getAttribute("d")==="m15 18-6-6 6-6"'));
  assert.equal(await evaluate('!!document.querySelector("[data-template-side=case]")'),false);
  assert.ok(await evaluate('!!document.querySelector(".journal-template-detail-image img")'));
  assert.equal(await evaluate('!!document.querySelector(".journal-template-basic-inspector")'),false);
  await evaluate('window.scrollTo(0,500)');
  await click('[data-route="matching"]','.match-recommendations');
  await click('[data-route="works"]','.journal-template-detail-card');
  assert.equal(await evaluate('window.scrollY'),0);
  for(const [width,height] of [[390,844],[768,1024],[1024,768],[1440,900]]){
    await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<700});
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),`Template detail overflow at ${width}×${height}`);
  }
  await click('[data-template-back]','.journal-template-card');
  await click('[data-filter-heading="类型"]','.swift-popover');
  assert.ok(await evaluate('!!document.querySelector(".swift-popover .popover-content")'));
  await evaluate('[...document.querySelectorAll(".swift-popover [role=menuitemradio]")].find(button=>button.textContent==="旧模板").click()');
  assert.ok(await evaluate('!!document.querySelector("[data-template-id=centered-writing-sheet]")'));
  await click('[data-template-id="centered-writing-sheet"]','.journal-template-detail-card');
  assert.ok(await evaluate('!!document.querySelector("[data-template-side=case]")'));
  await click('[data-template-side="case"]','.journal-template-detail-image');
  assert.ok(await evaluate('document.querySelector("[data-template-side=case]").getAttribute("aria-selected")==="true"'));
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
  assert.equal(await evaluate('!!document.querySelector(".match-direction .match-panel-title small")'),false);
  assert.deepEqual(await evaluate('([...document.querySelectorAll(".match-direction,.match-stage-section,.match-recommendations")].map(node=>node.querySelector(".match-panel-state .when-closed").textContent))'),['展开','展开','展开']);
  const folded=await evaluate('([...document.querySelectorAll(".match-direction>.match-panel-head,.match-stage-section>.match-panel-head,.match-recommendations>.match-panel-head")].map(node=>node.getBoundingClientRect().height))');
  assert.equal(new Set(folded).size,1,`Matching fold headers differ: ${folded}`);
  assert.ok(folded[0]<=50,`Matching fold headers too tall: ${folded}`);
  await click('.match-direction>.match-panel-head','.match-direction[open]');
  assert.equal(await evaluate('document.querySelector(".match-direction>.match-panel-head").getBoundingClientRect().height'),folded[0]);
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".match-direction .when-open")).display!=="none"'),true);
  assert.deepEqual(errors,[]);
  console.log('React template import, filter and detail verified in isolated Chromium');
}finally{await browser.close();}
