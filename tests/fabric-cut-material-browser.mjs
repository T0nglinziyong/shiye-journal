import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';

const base=process.env.SHIYE_TEST_URL||'http://127.0.0.1:5173';
const browser=await browserHarness('shiye-cut-material',base+'/');
const {click,command,evaluate,wait,sleep}=browser;
try{
  await wait('.series-grid');
  await evaluate(`(async()=>{
    const canvas=document.createElement('canvas');canvas.width=160;canvas.height=120;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#377ab7';
    ctx.beginPath();ctx.roundRect(12,8,136,104,12);ctx.fill();
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    const request=indexedDB.open('shiye-pwa-full-v1');
    const db=await new Promise(resolve=>request.onsuccess=()=>resolve(request.result));
    await new Promise((resolve,reject)=>{const tx=db.transaction(['assets','blobs'],'readwrite');
      tx.objectStore('assets').put({id:'cut-material',blobId:'cut-material',title:'裁剪测试素材',
        kind:'sticker',physicalWidthMM:70,physicalHeightMM:50,createdAt:new Date().toISOString()});
      tx.objectStore('blobs').put({id:'cut-material',data:blob});
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
    });db.close();
  })()`);
  await command('Page.reload');await wait('.series-grid');
  await click('[data-route="works"]','.works-grid');
  await click('#work-create','#blank-create-confirm');
  await click('#blank-create-confirm','#canvas-page');
  await wait('.upper-canvas');
  await click('[data-val="material"]','.swift-material-picker');
  await click('[data-material-id="cut-material"]','.fabric-selected-actions');
  await click('.fabric-selected-actions [aria-label="剪切选中对象"]','.fabric-cut-panel');
  await click('.fabric-cut-presets button:first-child');
  await sleep(250);
  const previewState=await evaluate(`({status:document.querySelector('.fabric-cut-preview-status')?.textContent,
    toast:document.querySelector('#toast')?.textContent})`);
  assert.ok(previewState.status,JSON.stringify({previewState,console:browser.consoleMessages}));
  assert.match(await evaluate('document.querySelector(".fabric-cut-preview-status")?.textContent'),/2 片/);
  await click('.fabric-cut-row button.primary');
  await sleep(100);
  assert.doesNotMatch(await evaluate('document.querySelector("#toast")?.textContent||""'),/程序错误|无法完成/);
  await click('.fabric-cut-panel .floating-scene-panel-actions button.primary');
  await sleep(300);
  assert.deepEqual(browser.errors,[]);
  console.log('Transparent material cuts, previews and saves using stable rectangular bounds');
}finally{await browser.close();}
