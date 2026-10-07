import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';

const b=await browserHarness('shiye-recognition-settings',process.env.SHIYE_TEST_URL||'http://localhost:5175');
const {click,evaluate,wait}=b;
const switches=[
  'setting-preprocess-light','setting-preprocess-denoise','setting-preprocess-contrast','setting-preprocess-chroma',
  'setting-postprocess-edge','setting-postprocess-shapes','setting-postprocess-curves','setting-postprocess-apertures'
];
try{
  await wait('.series-grid');
  await click('#top-settings','.settings-page');
  await click('[data-val="导入与识别"]','#setting-recognition');
  assert.ok(await evaluate('!!document.querySelector("#setting-recognition-pixels")'));
  for(const id of switches)assert.equal(await evaluate(`document.querySelector("#${id}").checked`),true,id+' defaults on');

  await evaluate(`(()=>{
    document.querySelector('#setting-recognition').value='grabcut';
    document.querySelector('#setting-recognition-pixels').value='1600';
    document.querySelector('#setting-preprocess-denoise').checked=false;
    document.querySelector('#setting-postprocess-shapes').checked=false;
    document.querySelector('#setting-postprocess-apertures').checked=false;
  })()`);
  await click('[data-act="settings-save"]');
  const prefs=await evaluate('JSON.parse(localStorage.getItem("shiye-ui-preferences-v1"))');
  assert.equal(prefs.recognition,'grabcut');
  assert.equal(prefs.recognitionPixels,1600);
  assert.equal(prefs.recognitionDenoise,false);
  assert.equal(prefs.recognitionShapeRegularization,false);
  assert.equal(prefs.recognitionApertures,false);
  assert.equal(prefs.recognitionEdgePolish,true);
  assert.equal(prefs.recognitionCurveSmooth,true);
  assert.deepEqual(b.errors,[]);
}finally{await b.close();}
