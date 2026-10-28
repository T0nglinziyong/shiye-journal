import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';
const b=await browserHarness('shiye-react-editor',process.env.SHIYE_TEST_URL||'http://127.0.0.1:5173');
const {command,evaluate,click,wait,sleep}=b;
try{
  await wait('.series-grid');
  await evaluate(`(async()=>{
    const db=await new Promise(resolve=>{const req=indexedDB.open('shiye-pwa-full-v1');req.onsuccess=()=>resolve(req.result);});
    const now=new Date().toISOString();
    const canvas=document.createElement('canvas');canvas.width=20;canvas.height=20;
    canvas.getContext('2d').fillRect(0,0,20,20);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    await new Promise(resolve=>{const tx=db.transaction(['series','assets','blobs'],'readwrite');
      tx.objectStore('series').put({id:'react-edit-series',title:'待编辑系列',createdAt:now,updatedAt:now});
      tx.objectStore('blobs').put({id:'react-edit-blob',data:blob});
        tx.objectStore('assets').put({id:'react-edit-asset',title:'待编辑素材',seriesID:'react-edit-series',blobId:'react-edit-blob',
          originalBlobId:'react-edit-blob',kind:'paper',role:'support',reviewStatus:'ready',tags:[],
          createdAt:now,updatedAt:now,physicalWidthMM:20,physicalHeightMM:20,supply:{quantity:1}});
      tx.oncomplete=resolve;
    });db.close();
  })()`);
  await command('Page.reload');await wait('[data-act="series-detail"][data-id="react-edit-series"]');
  await evaluate(`document.querySelector('[data-act="series-detail"][data-id="react-edit-series"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}))`);
  await wait('[aria-label="系列操作"]');
  await evaluate(`[...document.querySelectorAll('[aria-label="系列操作"] button')].find(button=>button.textContent==='编辑信息与标签').click()`);
  await wait('#series-name');
  await evaluate(`(()=>{const input=document.querySelector('#series-name');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(input,'React 系列');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await click('#series-save');await sleep(100);
  await click('[data-act="series-detail"][data-id="react-edit-series"]','.series-contents');
  assert.equal(await evaluate(`document.querySelector('#series-edit-title').textContent.includes('React 系列')`),true);
  await click('[data-act="detail"][data-id="react-edit-asset"]','.detail-page');
  await click('[data-act="detail-edit"]');await wait('#asset-title');
  await evaluate(`(()=>{const input=document.querySelector('#asset-title');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(input,'React 素材');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await click('#save-asset');await sleep(100);
  assert.equal(await evaluate(`document.querySelector('.detail-copy h1')?.textContent`),'React 素材');
  assert.deepEqual(b.errors,[]);
  console.log('React series and material editors verified in Chromium');
}finally{await b.close();}
