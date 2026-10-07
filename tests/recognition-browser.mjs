import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';

const b=await browserHarness('shiye-recognition-settings',process.env.SHIYE_TEST_URL||'http://localhost:5175');
const {click,evaluate,wait}=b;
try{
  await wait('.series-grid');
  await click('#top-settings','.settings-page');
  await click('[data-val="导入与识别"]','#setting-recognition');
  assert.ok(await evaluate('!!document.querySelector("#setting-recognition-pixels")'));
  assert.equal(await evaluate('document.querySelector("#setting-recognition-postprocess").checked'),true);
  for(const pixels of [900,1200,1600]){
    await evaluate(`document.querySelector('#setting-recognition').value='grabcut';document.querySelector('#setting-recognition-pixels').value='${pixels}';document.querySelector('#setting-recognition-postprocess').checked=${pixels===1200?false:true};`);
    await click('[data-act="settings-save"]');
    const prefs=await evaluate('JSON.parse(localStorage.getItem("shiye-ui-preferences-v1"))');
    assert.equal(prefs.recognition,'grabcut');
    assert.equal(prefs.recognitionPixels,pixels);
    assert.equal(prefs.recognitionPostprocess,pixels===1200?false:true);
    await click('#top-settings','.settings-page');
    await click('[data-val="导入与识别"]','#setting-recognition');
  }
  assert.deepEqual(b.errors,[]);
}finally{await b.close();}
