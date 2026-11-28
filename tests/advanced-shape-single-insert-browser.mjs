import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';

const browser=await browserHarness('shiye-advanced-shape-single-insert',
  (process.env.SHIYE_TEST_URL||'http://127.0.0.1:5173')+'/',async({command})=>{
    await command('Emulation.setDeviceMetricsOverride',
      {width:390,height:844,deviceScaleFactor:3,mobile:true});
    await command('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
  });
const {click,command,evaluate,wait,sleep}=browser;
const count=()=>evaluate(`(async()=>{
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('shiye-pwa-full-v1',1);
    r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
  return await new Promise((resolve,reject)=>{const r=db.transaction('projects').objectStore('projects').getAll();
    r.onsuccess=()=>{db.close();resolve(r.result[0].drafts[0].layers.filter(x=>x.type==='shape').length)};
    r.onerror=()=>reject(r.error)});
})()`);
const touch=async selector=>{
  const point=await evaluate(`(()=>{const element=document.querySelector(${JSON.stringify(selector)});
    element.scrollIntoView({block:'nearest'});const rect=element.getBoundingClientRect();
    return {x:rect.left+rect.width/2,y:rect.top+rect.height/2}})()`);
  await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,id:1,force:1}]});
  await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await sleep(160);
};
try{
  await wait('.series-grid');await click('[data-route="works"]','.works-grid');
  await click('#work-create','#blank-create-confirm');
  await click('#blank-create-confirm','#canvas-page');await wait('.upper-canvas');
  for(const [index,kind] of ['weeklyTable','paperclip','postageFrame'].entries()){
    await touch('[data-val="shape"]');await wait('.swift-shape-picker');
    await touch('.swift-shape-picker .swift-segments button:nth-child(3)');
    await touch(`[data-shape-kind="${kind}"]`);
    for(let attempt=0;attempt<30&&await count()<index+1;attempt++)await sleep(100);
    assert.equal(await count(),index+1,`One mobile tap on ${kind} adds one Scene layer`);
    await wait('.fabric-selected-actions');
  }
  assert.deepEqual(browser.errors,[]);
  console.log('Advanced graphic taps each insert exactly one editable Scene object on mobile');
}finally{await browser.close();}
