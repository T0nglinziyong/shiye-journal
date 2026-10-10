import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';

const b=await browserHarness('shiye-recognition-settings',process.env.SHIYE_TEST_URL||'http://localhost:5175');
const {click,evaluate,wait}=b;
const switches=['setting-postprocess-shapes','setting-postprocess-apertures'];
try{
  await wait('.series-grid');
  await click('#top-settings','.settings-page');
  await click('[data-val="导入与识别"]','#setting-recognition');
  assert.ok(await evaluate('!!document.querySelector("#setting-recognition-pixels")'));
  const defaults=await evaluate('({method:document.querySelector("#setting-recognition").value,pixels:Number(document.querySelector("#setting-recognition-pixels").value),light:document.querySelector("#setting-preprocess-light").checked,denoise:document.querySelector("#setting-preprocess-denoise").checked,contrast:document.querySelector("#setting-preprocess-contrast").checked,chroma:document.querySelector("#setting-preprocess-chroma").checked,oldEdge:!!document.querySelector("#setting-postprocess-edge"),oldCurve:!!document.querySelector("#setting-postprocess-curves"),methods:[...document.querySelector("#setting-recognition").options].map(x=>x.value)})');
  assert.deepEqual(defaults.methods,['auto','morphgac','grabcut','hybrid']);
  assert.equal(defaults.method,'auto');assert.equal(defaults.pixels,1200);
  assert.equal(defaults.light,false);assert.equal(defaults.denoise,false);assert.equal(defaults.contrast,false);assert.equal(defaults.chroma,true);
  assert.equal(defaults.oldEdge,false);assert.equal(defaults.oldCurve,false);
  for(const id of switches)assert.equal(await evaluate(`document.querySelector("#${id}").checked`),true,id+' defaults on');

  await evaluate(`(()=>{
    document.querySelector('#setting-recognition').value='grabcut';
    document.querySelector('#setting-recognition-pixels').value='1600';
    document.querySelector('#setting-preprocess-light').checked=true;
    document.querySelector('#setting-preprocess-denoise').checked=true;
    document.querySelector('#setting-postprocess-shapes').checked=false;
    document.querySelector('#setting-postprocess-apertures').checked=false;
  })()`);
  await click('[data-act="settings-save"]');
  const prefs=await evaluate('JSON.parse(localStorage.getItem("shiye-ui-preferences-v1"))');
  assert.equal(prefs.recognition,'grabcut');
  assert.equal(prefs.recognitionPixels,1600);
  assert.equal(prefs.balanceLight,true);
  assert.equal(prefs.recognitionDenoise,true);
  assert.equal(prefs.recognitionShapeRegularization,false);
  assert.equal(prefs.recognitionApertures,false);
  assert.equal('recognitionEdgePolish' in prefs,false);
  assert.equal('recognitionCurveSmooth' in prefs,false);
  assert.deepEqual(b.errors,[]);
}finally{await b.close();}
