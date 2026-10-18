import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';

const base=process.env.SHIYE_TEST_URL||'http://127.0.0.1:5173';
const browser=await browserHarness('shiye-material-picker',base+'/');
const {click,command,evaluate,wait,sleep}=browser;
try{
  await wait('.series-grid');
  await evaluate(`(async()=>{
    const db=await new Promise(resolve=>{const q=indexedDB.open('shiye-pwa-full-v1');q.onsuccess=()=>resolve(q.result)});
    const tall='<svg xmlns="http://www.w3.org/2000/svg" width="100" height="300"><rect width="100" height="300" fill="white"/><circle cx="50" cy="45" r="35" fill="red"/><circle cx="50" cy="150" r="35" fill="green"/><circle cx="50" cy="255" r="35" fill="blue"/></svg>';
    const square='<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="orange"/></svg>';
    await new Promise((resolve,reject)=>{const tx=db.transaction(['assets','blobs'],'readwrite');
      for(const [id,title,svg,width,height] of [
        ['picker-tall','纵向完整封面',tall,30,90],['picker-used','已使用测试素材',square,30,30]]){
        tx.objectStore('assets').put({id,blobId:id,title,kind:'sticker',physicalWidthMM:width,
          physicalHeightMM:height,createdAt:new Date().toISOString()});
        tx.objectStore('blobs').put({id,data:new Blob([svg],{type:'image/svg+xml'})});
      }
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
    });db.close();
  })()`);
  await command('Page.reload');await wait('.series-grid');
  await click('[data-route="works"]','.works-grid');
  await click('#work-create','#blank-create-confirm');
  await click('#blank-create-confirm','#canvas-page');
  await wait('.upper-canvas');
  await command('Emulation.setDeviceMetricsOverride',{
    width:390,height:844,deviceScaleFactor:2,mobile:true});
  await click('[data-val="material"]','.swift-material-picker');
  await wait('[data-material-id="picker-tall"]');
  for(let attempt=0;attempt<80;attempt++){
    if(await evaluate('document.querySelector("[data-material-id=picker-tall] img")?.naturalHeight===300'))break;
    await sleep(50);
  }
  const preview=await evaluate(`(()=>{
    const card=document.querySelector('[data-material-id=picker-tall]');
    const frame=card.querySelector('.material-piece-image');const img=frame.querySelector('img');
    return {natural:[img.naturalWidth,img.naturalHeight],fit:getComputedStyle(img).objectFit,
      image:img.getBoundingClientRect().toJSON(),frame:frame.getBoundingClientRect().toJSON(),
      card:card.getBoundingClientRect().toJSON()};
  })()`);
  assert.deepEqual(preview.natural,[100,300],JSON.stringify(preview));
  assert.equal(preview.fit,'contain');
  assert.ok(Math.abs(preview.image.width/preview.image.height-1/3)<.015,
    'The picker image box must preserve the same intrinsic ratio as the asset cover: '+JSON.stringify(preview));
  assert.ok(preview.frame.height>=120&&preview.image.top>=preview.card.top&&
    preview.image.bottom<=preview.card.bottom,
    'The full tall cover needs a large, contained preview: '+JSON.stringify(preview));
  await click('[data-material-id="picker-used"]','.fabric-selected-actions');
  await click('[data-val="material"]','.swift-material-picker');
  await click('.swift-material-picker .swift-segments button:last-child');
  assert.equal(await evaluate('!!document.querySelector("[data-material-id=picker-used]")'),true,
    'All materials must include assets already used in the draft');
  assert.equal(await evaluate('!!document.querySelector("[data-material-id=picker-tall]")'),true);
  await click('[data-val="material"]');
  await click('[data-act="park"]');
  await click('[data-val="layers"]','.scene-layer-tree');
  assert.equal(await evaluate('!!document.querySelector("[data-scene-node][data-material-id=picker-used]")'),false);
  assert.equal(await evaluate('document.querySelectorAll(".scene-layer-node").length'),0,
    'Parked materials must not be listed as editable layers');
  assert.equal(await evaluate('document.querySelectorAll(".scene-layer-parked button").length'),0,
    'Parked materials must not appear in the layer panel recovery section');
  await click('[data-val="layers"]');
  await click('[data-val="material"]','.swift-material-picker');
  await click('.swift-material-picker .swift-segments button:nth-child(2)');
  assert.equal(await evaluate('!!document.querySelector("[data-material-id=picker-used]")'),true,
    'The standby tab must still make parked materials recoverable');
  await click('.swift-material-picker .swift-segments button:last-child');
  assert.equal(await evaluate('!!document.querySelector("[data-material-id=picker-used]")'),true,
    'All materials must also include standby assets');
  assert.deepEqual(browser.errors,[]);
  console.log('Material picker: full tall cover, exclusive tabs, parked layer omission passed');
}finally{await browser.close();}
