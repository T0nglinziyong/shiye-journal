import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';

const b=await browserHarness('shiye-cutout-inspection',process.env.SHIYE_TEST_URL||'http://127.0.0.1:5194');
const {evaluate,wait,click}=b;
try{
  await wait('.series-grid');
  await evaluate(`(async()=>{
    const db=await new Promise(r=>{const q=indexedDB.open('shiye-pwa-full-v1');q.onsuccess=()=>r(q.result)}),
      now=new Date().toISOString(),make=async(kind)=>{
        const c=document.createElement('canvas');c.width=180;c.height=140;const x=c.getContext('2d');
        x.fillStyle='#f5f0e7';x.fillRect(0,0,180,140);
        x.fillStyle='#7da56d';x.fillRect(30,25,120,90);
        x.fillStyle='#fff';x.fillRect(65,48,50,44);
        if(kind==='cutout'){x.globalCompositeOperation='destination-in';x.fillStyle='#000';x.beginPath();x.roundRect(28,23,124,94,8);x.fill();}
        return await new Promise(r=>c.toBlob(r,'image/png'));
      },
      frame=await make('frame'),cut=await make('cutout'),
      asset={id:'cutout-flow-asset',title:'检查抠图流程测试',blobId:'cutout-flow-cut',originalBlobId:'cutout-flow-source',originalCutoutBlobId:'cutout-flow-recognition',candidateFrameBlobId:'cutout-flow-frame',kind:'paper',role:'support',reviewStatus:'ready',createdAt:now,physicalWidthMM:40,physicalHeightMM:30,supply:{quantity:1},processingRecord:{candidateFramePlacement:{x:0,y:0,width:180,height:140,frameWidth:180,frameHeight:140}}};
    await new Promise((r,j)=>{const tx=db.transaction(['assets','blobs'],'readwrite');tx.objectStore('assets').put(asset);for(const [id,data] of [['cutout-flow-cut',cut],['cutout-flow-source',frame],['cutout-flow-recognition',cut],['cutout-flow-frame',frame]])tx.objectStore('blobs').put({id,data});tx.oncomplete=r;tx.onerror=()=>j(tx.error);});db.close();
  })()`);
  await b.command('Page.reload');await wait('.series-grid');
  await click('.swift-tabs button:nth-child(2)','.asset-grid');
  await click('[data-id="cutout-flow-asset"]','.detail-page');
  await click('[data-act="detail-check"]','.cutout-modal');

  assert.equal(await evaluate('document.querySelectorAll(".cutout-steps span").length'),3);
  assert.equal(await evaluate('document.querySelector(".cutout-steps .current")?.textContent.includes("粗轮廓")'),true);
  assert.ok(await evaluate('!!document.querySelector("#cutout-method")'));
  assert.ok(await evaluate('!!document.querySelector("#cutout-strength")'));
  assert.equal(await evaluate('!!document.querySelector("#cutout-post-edge")'),false);
  assert.equal(await evaluate('document.querySelector("#cutout-apply").disabled'),true);

  await click('#cutout-next');
  assert.equal(await evaluate('document.querySelector(".cutout-steps .current")?.textContent.includes("识别结果")'),true);
  assert.ok(await evaluate('!!document.querySelector("#cutout-strength")'));
  assert.ok(await evaluate('!!document.querySelector("#cutout-post-edge")'));
  assert.ok(await evaluate('!!document.querySelector("#cutout-post-shapes")'));
  assert.equal(await evaluate('!!document.querySelector("#cutout-method")'),false);
  assert.equal(await evaluate('!!document.querySelector("#cutout-auto-straighten")'),false);

  await click('#cutout-next');
  assert.equal(await evaluate('document.querySelector(".cutout-steps .current")?.textContent.includes("最终调整")'),true);
  assert.ok(await evaluate('!!document.querySelector("#cutout-strength")'));
  assert.ok(await evaluate('!!document.querySelector("#cutout-auto-straighten")'));
  assert.ok(await evaluate('!!document.querySelector("[data-appearance=\"original\"]")'));
  assert.equal(await evaluate('!!document.querySelector("#cutout-post-edge")'),false);
  assert.equal(await evaluate('document.querySelector("#cutout-apply").disabled'),false);
  assert.equal(await evaluate('document.querySelector("#cutout-auto-straighten").checked'),true);
  assert.deepEqual(b.errors,[]);
}finally{await b.close();}
