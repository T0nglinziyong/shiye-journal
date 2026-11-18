import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';

const b=await browserHarness('shiye-material-rotation',
  process.env.SHIYE_TEST_URL||'http://127.0.0.1:5173');
const {command,evaluate,click,wait,sleep}=b;
try{
  await command('Emulation.setDeviceMetricsOverride',
    {width:390,height:844,deviceScaleFactor:1,mobile:true});
  await wait('.series-grid');
  await evaluate(`(async()=>{
    const db=await new Promise(resolve=>{const request=indexedDB.open('shiye-pwa-full-v1');
      request.onsuccess=()=>resolve(request.result)});
    const canvas=document.createElement('canvas');canvas.width=30;canvas.height=20;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#e27c52';ctx.fillRect(0,0,30,20);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    const {encodeAlphaMask}=await import('/src/alpha-mask-blob.js');
    const mask=encodeAlphaMask(new Uint8Array(30*20).fill(255),30,20);
    const at=new Date().toISOString();
    await new Promise(resolve=>{const tx=db.transaction(['assets','blobs'],'readwrite');
      tx.objectStore('blobs').put({id:'orientation-blob',data:blob});
      tx.objectStore('blobs').put({id:'orientation-modern-blob',data:blob});
      tx.objectStore('blobs').put({id:'orientation-modern-frame',data:blob});
      tx.objectStore('blobs').put({id:'orientation-modern-mask',data:mask});
      tx.objectStore('assets').put({id:'orientation-asset',title:'方向测试素材',blobId:'orientation-blob',
        kind:'paper',role:'background',reviewStatus:'ready',usageStatus:'unused',tags:[],
        physicalWidthMM:30,physicalHeightMM:20,createdAt:at,updatedAt:at});
      tx.objectStore('assets').put({id:'orientation-modern-asset',title:'新蒙版方向素材',
        blobId:'orientation-modern-blob',candidateFrameBlobId:'orientation-modern-frame',
        finalMaskBlobId:'orientation-modern-mask',kind:'paper',role:'background',
        reviewStatus:'ready',usageStatus:'unused',tags:[],physicalWidthMM:30,physicalHeightMM:20,
        processingRecord:{sourceWidthMM:30,sourceHeightMM:20,
          candidateFramePlacement:{x:0,y:0,width:30,height:20,frameWidth:30,frameHeight:20}},
        createdAt:at,updatedAt:at});
      tx.oncomplete=resolve;});db.close();
  })()`);
  await command('Page.reload');await wait('.series-grid');
  await click('.swift-tabs button:nth-child(2)','.asset-grid');
  await click('[data-act="detail"][data-id="orientation-asset"]','.detail-columns');
  await click('[data-act="detail-edit"]','#asset-title');
  await click('.asset-editor-tabs button:nth-child(2)');await wait('#asset-rotation');
  assert.equal(await evaluate('document.querySelector("#asset-rotation").value'),'0');
  await evaluate(`(()=>{const input=document.querySelector('#asset-rotation');
    const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
    setter.call(input,'90');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await click('#save-asset');await sleep(180);
  const result=await evaluate(`(async()=>{
    const db=await new Promise(resolve=>{const request=indexedDB.open('shiye-pwa-full-v1');
      request.onsuccess=()=>resolve(request.result)});
    const read=(store,id)=>new Promise(resolve=>{const request=db.transaction(store).objectStore(store).get(id);
      request.onsuccess=()=>resolve(request.result)});
    const asset=await read('assets','orientation-asset'),row=await read('blobs','orientation-blob');
    const bitmap=await createImageBitmap(row.data);db.close();
    const value={angle:asset.processingRecord.displayRotationDegrees,
      source:asset.processingRecord.displayRotationSource,width:asset.physicalWidthMM,
      height:asset.physicalHeightMM,pixels:[bitmap.width,bitmap.height]};
    bitmap.close();return value;})()`);
  assert.deepEqual(result,{angle:90,source:'user',width:20,height:30,pixels:[20,30]});
  await click('[data-act="detail-back"]','.asset-grid');
  await click('[data-act="detail"][data-id="orientation-modern-asset"]','.detail-columns');
  await click('[data-act="detail-edit"]','#asset-title');
  await click('.asset-editor-tabs button:nth-child(2)');
  await evaluate(`(()=>{const input=document.querySelector('#asset-rotation');
    const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
    setter.call(input,'90');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await click('#save-asset');await sleep(180);
  const modern=await evaluate(`(async()=>{
    const db=await new Promise(resolve=>{const request=indexedDB.open('shiye-pwa-full-v1');
      request.onsuccess=()=>resolve(request.result)});
    const read=(store,id)=>new Promise(resolve=>{const request=db.transaction(store).objectStore(store).get(id);
      request.onsuccess=()=>resolve(request.result)});
    const asset=await read('assets','orientation-modern-asset');
    const row=await read('blobs','orientation-modern-blob');
    const bitmap=await createImageBitmap(row.data);db.close();
    const value={angle:asset.processingRecord.displayRotationDegrees,
      source:asset.processingRecord.displayRotationSource,
      pixels:[bitmap.width,bitmap.height]};bitmap.close();return value;})()`);
  assert.deepEqual(modern,{angle:90,source:'user',pixels:[20,30]});
  assert.deepEqual(b.errors,[]);
  console.log('Material rotation updates the UI, stored PNG and physical dimensions');
}finally{await b.close();}
