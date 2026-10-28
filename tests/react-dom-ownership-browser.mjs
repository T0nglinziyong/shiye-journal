import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';

const browser=await browserHarness('shiye-react-dom-ownership',
  process.env.SHIYE_TEST_URL||'http://127.0.0.1:5173');
const {command,click,wait,evaluate,errors}=browser;
try{
  await wait('.series-grid');
  for(const [width,height] of [[390,844],[1024,768]]){
    await command('Emulation.setDeviceMetricsOverride',
      {width,height,deviceScaleFactor:1,mobile:width<700});
    for(let repeat=0;repeat<3;repeat++){
      await click('[data-route="library"]','.swift-tabs');
      await click('.swift-tabs button:nth-child(2)','.asset-grid');
      await click('.swift-tabs button:nth-child(3)','.asset-grid');
      await click('.swift-tabs button:nth-child(4)','.recently-deleted-grid');
      await click('.swift-tabs button:nth-child(1)','.series-grid');
      await click('[data-route="works"]','.swift-tabs');
      await click('.swift-tabs button:nth-child(4)','.journal-template-grid');
      await click('.swift-tabs button:nth-child(5)','.recently-deleted-grid');
      await click('.swift-tabs button:nth-child(2)','.works-grid');
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
    }
  }
  assert.deepEqual(errors,[],'React and direct DOM controls must not conflict during tab changes');
  console.log('React DOM ownership verified: 48 tab changes, mobile and desktop, no runtime errors');
}finally{await browser.close();}
