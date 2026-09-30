import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';

const b=await browserHarness('shiye-import-entry',process.env.SHIYE_TEST_URL||'http://127.0.0.1:5173');
const {command,evaluate,click,wait}=b;
try{
  await wait('.series-grid');
  await evaluate('window.__galleryOpens=0;document.querySelector("#file-input").click=()=>window.__galleryOpens++');
  for(const [width,height] of [[390,844],[768,1024],[1024,768],[1440,900]]){
    await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<700});
    await click('[data-route="library"]','.series-grid');await click('.swift-tabs button:nth-child(2)','.asset-grid');
    const before=await evaluate('window.__galleryOpens');await click('[data-act="import"]','.import-nav');
    assert.equal(await evaluate('window.__galleryOpens'),before+1,'素材入口应直接打开图库');
    await click('[data-act="import-exit"]','.asset-grid');
    await click('[data-route="works"]','.works-grid');
    const prior=await evaluate('window.__galleryOpens');await evaluate('[...document.querySelectorAll(".work-entry")].find(e=>e.textContent.includes("导入作品")).click()');await wait('.import-nav');
    assert.equal(await evaluate('window.__galleryOpens'),prior+1,'作品入口应直接打开图库');
    await click('[data-act="import-exit"]','.works-grid');
  }
  assert.deepEqual(b.errors,[]);
  console.log('Material and work import tiles open the gallery directly in four Chromium viewports');
}finally{await b.close();}
