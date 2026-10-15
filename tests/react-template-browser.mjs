import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';

const browser=await browserHarness('shiye-react-template',
  process.env.SHIYE_TEST_URL||'http://127.0.0.1:5173');
const {click,evaluate,wait,sleep,errors}=browser;
try{
  await wait('.series-grid');
  await click('[data-route="works"]','.works-grid');
  await click('.swift-tabs button:nth-child(4)','.journal-template-grid');
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
  assert.ok(await evaluate('document.querySelector(".journal-template-detail-card h2").textContent.includes("React 模板导入验收")'));
  await click('[data-template-back]','.journal-template-card');
  await click('[data-filter-heading="类型"]','.swift-popover');
  await evaluate('[...document.querySelectorAll(".swift-popover [role=menuitemradio]")].find(button=>button.textContent==="我的模板").click()');
  await sleep(100);
  assert.equal(await evaluate('document.querySelectorAll(".journal-template-card").length'),1);
  assert.ok(await evaluate('document.querySelector(".journal-template-card h3").textContent.includes("React 模板导入验收")'));
  await click('.journal-template-card','.journal-template-detail-card');
  assert.deepEqual(errors,[]);
  console.log('React template import, filter and detail verified in isolated Chromium');
}finally{await browser.close();}
