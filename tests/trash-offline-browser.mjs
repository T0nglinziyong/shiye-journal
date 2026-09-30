import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {browserHarness} from './browser-harness.mjs';

const directory=process.env.SHIYE_TRASH_SCREENSHOTS||'/tmp/shiye-trash-offline';
await mkdir(directory,{recursive:true});
const b=await browserHarness('shiye-trash-offline',process.env.SHIYE_TEST_URL||'http://localhost:5175');
const {command,evaluate,wait,click,sleep}=b;
const records=store=>evaluate(`(async()=>{const db=await new Promise(r=>{const q=indexedDB.open('shiye-pwa-full-v1');q.onsuccess=()=>r(q.result)});return new Promise(r=>{const q=db.transaction(${JSON.stringify(store)}).objectStore(${JSON.stringify(store)}).getAll();q.onsuccess=()=>r(q.result)})})()`);
const capture=async(name,width,height)=>{await sleep(100);const result=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(`${directory}/${width}x${height}-${name}.png`,Buffer.from(result.data,'base64'));assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));};
try{
  await wait('.series-grid');
  await evaluate(`(async()=>{const db=await new Promise(r=>{const q=indexedDB.open('shiye-pwa-full-v1');q.onsuccess=()=>r(q.result)}),canvas=document.createElement('canvas');canvas.width=90;canvas.height=140;canvas.getContext('2d').fillStyle='#89b4a2';canvas.getContext('2d').fillRect(0,0,90,140);const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));const date=new Date().toISOString(),old=new Date(Date.now()-8*86400000).toISOString(),asset={id:'trash-asset',blobId:'trash-blob',title:'合成删除素材',kind:'sticker',role:'focal',physicalWidthMM:30,physicalHeightMM:45,supply:{quantity:1},createdAt:date},work={id:'trash-work',title:'合成删除作品',isDraft:false,createdAt:date,updatedAt:date,activeDraftID:'d',drafts:[{id:'d',canvas:{width:700,height:1000},physicalPageHeightMM:297,paperColor:'#fff',paperPattern:'plain',items:[],primitives:[],textBlocks:[],strokes:[]}]};await new Promise(r=>{const tx=db.transaction(['blobs','trash'],'readwrite');tx.objectStore('blobs').put({id:'trash-blob',data:blob});for(const [id,kind,item,when] of [['ta1','asset',asset,date],['ta2','asset',{...asset,id:'trash-asset-2',title:'合成第二素材'},date],['tw1','project',work,date],['expired','asset',{...asset,id:'trash-expired'},old]])tx.objectStore('trash').put({id,kind,item,date:when});tx.oncomplete=r;});db.close();})()`);
  await command('Page.reload');await wait('.series-grid');
  for(const [width,height] of [[390,844],[768,1024],[1024,768],[1440,900]]){
    await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<700});
    await click('[data-route="library"]','.series-grid');await click('.swift-tabs button:nth-child(4)','.recently-deleted-grid');
    assert.equal(await evaluate('document.querySelectorAll(".deleted-row").length'),2,'expired entry should be auto-purged');
    await click('[data-trash-select]','.deleted-selection-tray:not([hidden])');
    await click('[data-trash-all]');assert.equal(await evaluate('document.querySelector(".deleted-selection-tray strong").textContent'),'已选 2 项');
    await capture('asset-bulk-selected',width,height);
    await click('[data-trash-select]');
    await click('[data-route="works"]','.swift-tabs');await click('.swift-tabs button:nth-child(4)','.recently-deleted-grid');
    assert.equal(await evaluate('document.querySelectorAll(".deleted-row").length'),1);
    await capture('work-recovery',width,height);
  }
  await click('[data-route="library"]','.series-grid');await click('.swift-tabs button:nth-child(4)','.recently-deleted-grid');await click('[data-trash-select]','.deleted-selection-tray:not([hidden])');await click('[data-trash-all]');await click('[data-trash-recover]');
  assert.equal((await records('trash')).filter(entry=>entry.kind==='asset').length,0);assert.ok((await records('assets')).some(asset=>asset.id==='trash-asset'));
  await click('[data-route="works"]','.swift-tabs');await click('.swift-tabs button:nth-child(4)','.recently-deleted-grid');await evaluate('window.confirm=()=>true');await click('[data-remove="tw1"]');
  assert.equal((await records('trash')).filter(entry=>entry.kind==='project').length,0);
  assert.deepEqual(b.errors,[]);console.log('Trash/offline browser verification passed in four viewports:',directory);
}finally{await b.close();}
