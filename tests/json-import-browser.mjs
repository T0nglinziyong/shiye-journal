import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';
import {createOfflineHandoff} from '../src/offline-creation.js';
import {project} from '../src/domain.js';
import {createNativeProjectDocument} from '../src/native-project-package.js';
import {unzipSync,strFromU8} from 'fflate';

const asset={id:'browser-json-asset',title:'测试纸片',kind:'sticker',role:'focal',physicalWidthMM:40,
  physicalHeightMM:50,supply:{quantity:1},updatedAt:'2026-10-14T00:00:00.000Z',blobId:'browser-json-image'};
const output=await createOfflineHandoff({project:project('导入测试'),assets:[asset],aliases:{m1:asset.id},settings:{includeThumbnails:false}});
const scene=strFromU8(unzipSync(new Uint8Array(await output.blob.arrayBuffer()))['examples/project.shiyeproject.json']);
const b=await browserHarness('shiye-json-import',process.env.SHIYE_TEST_URL||'http://localhost:5175');
try{
  await b.wait('.series-grid');
  await b.evaluate(`(async()=>{const db=await new Promise((resolve,reject)=>{const q=indexedDB.open('shiye-pwa-full-v1');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});await new Promise((resolve,reject)=>{const tx=db.transaction('assets','readwrite');tx.objectStore('assets').put(${JSON.stringify({...asset,kind:'tape',supply:{quantity:0},title:'导出后改名'})});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});})()`);
  await b.command('Page.reload');await b.wait('.series-grid');
  await b.click('[data-route="matching"]','[data-act="match-import-gpt"]');
  await b.click('[data-act="match-import-gpt"]','#offline-gpt-result');
  assert.equal(await b.evaluate('!!document.querySelector("#offline-register-task")'),false);
  const pasted=await b.evaluate(`(async()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{readText:async()=>${JSON.stringify(scene)}}});document.querySelector('#offline-paste-result').click();await new Promise(r=>setTimeout(r,80));return document.querySelector('#offline-gpt-result').value})()`);
  assert.equal(pasted,scene);
  const fallback=await b.evaluate(`(async()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{readText:async()=>{throw Error('blocked')}}});document.querySelector('#offline-paste-result').click();await new Promise(r=>setTimeout(r,80));return {text:document.querySelector('#offline-gpt-result').value,focused:document.activeElement?.id==='offline-gpt-result'}})()`);
  assert.equal(fallback.text,scene);assert.equal(fallback.focused,true);
  const storedSize=await b.evaluate(`(async()=>{const {materialStorageBlobs}=await import('/src/material-storage-resolution.js');const canvas=document.createElement('canvas');canvas.width=2100;canvas.height=2970;const ctx=canvas.getContext('2d');ctx.fillStyle='#2b784a';ctx.fillRect(0,0,2100,2970);const image=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));const same=await materialStorageBlobs(image,image,210,297);const frame=await materialStorageBlobs(image,image,105,148.5);const a=await createImageBitmap(same.cutout),b=await createImageBitmap(frame.cutout);const result={a4:[a.width,a.height],half:[b.width,b.height],sameBlob:same.cutout===same.frame};a.close();b.close();return result})()`);
  assert.deepEqual(storedSize,{a4:[1018,1440],half:[543,768],sameBlob:true});
  const savedImport=await b.evaluate(`(async()=>{const {saveImportBatch}=await import('/src/import-save.js');const canvas=document.createElement('canvas');canvas.width=1050;canvas.height=1485;canvas.getContext('2d').fillRect(0,0,1050,1485);const image=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));const candidate={selected:true,blob:image,candidateFrameBlob:image,width:105,height:148.5,kind:'sticker',region:{x:.1,y:.1,w:.5,h:.5}};const state={importSaving:false,importStep:'review',importMode:'material',importRecords:[{confirmed:true,selectedCandidates:[candidate]}],preferences:{recognitionPixels:900},assets:[],projects:[]},urls=new Map();let batch;await saveImportBatch({state,db:{stageImport:async value=>{batch=value;return {pending:false}}},urls,render:()=>{}});const asset=batch.assets[0],raster=await createImageBitmap(batch.blobs.find(row=>row.id===asset.blobId).data);const result={size:[raster.width,raster.height],hash:/^sha256:[a-f0-9]{64}$/.test(asset.imageHash),saved:state.importSavedCount};raster.close();for(const url of urls.values())URL.revokeObjectURL(url);return result})()`);
  assert.deepEqual(savedImport,{size:[543,768],hash:true,saved:1});
  await b.click('#offline-import-text','#canvas-page');
  assert.equal(await b.evaluate('document.querySelectorAll(".canvas-object.material").length'),1);
  await b.click('[data-act="back-works"]','.works-grid');
  assert.ok(await b.evaluate('document.querySelectorAll(".works-grid [data-act=open-project]").length')>=1);
  const native=JSON.stringify(createNativeProjectDocument(project('作品页 JSON 导入')));
  await b.evaluate(`(()=>{const input=document.querySelector('#work-file-input'),transfer=new DataTransfer();transfer.items.add(new File([${JSON.stringify(native)}],'作品.shiyeproject.json',{type:'application/json'}));input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await b.wait('#canvas-page');
  assert.ok(await b.evaluate('document.querySelector(".swift-editor-head h1")?.textContent.includes("作品页 JSON 导入")'));
  await b.click('[data-act="back-works"]','.works-grid');
  assert.ok(await b.evaluate('document.querySelectorAll(".works-grid [data-act=open-project]").length')>=2);
  await b.evaluate(`(()=>{const input=document.querySelector('#work-file-input'),transfer=new DataTransfer();transfer.items.add(new File([new Uint8Array([80,75,3,4,0,0,0,0])],'旧作品.shiyeproject.zip',{type:'application/zip'}));input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await b.sleep(80);
  assert.ok(await b.evaluate('document.querySelector("#toast")?.textContent.includes("不再导入 .shiyeproject.zip")'));
  for(const [width,height] of [[390,844],[768,1024]]){
    await b.command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<700});
    await b.click('[data-route="matching"]','[data-act="match-import-gpt"]');
    await b.click('[data-act="match-import-gpt"]','#offline-gpt-result');
    assert.ok(await b.evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
    await b.click('[role=dialog] [aria-label=关闭]');
  }
  assert.deepEqual(b.errors,[]);
  console.log('JSON import and clipboard browser check passed');
}finally{await b.close();}
