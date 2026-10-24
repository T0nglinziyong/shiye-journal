import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';
import {unzipSync} from 'fflate';

const base=process.env.SHIYE_TEST_URL||'http://127.0.0.1:5175';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))
  throw Error('创作封面验收只能在本地合成资料上运行');
const b=await browserHarness('shiye-offline-cover',base);
try{
  await b.wait('.series-grid');
  await b.evaluate(`(async()=>{
    const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('shiye-pwa-full-v1');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
    const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=1200;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#8c6bb8';ctx.fillRect(0,0,1600,1200);
    ctx.clearRect(0,0,220,220);ctx.fillStyle='#f0bf34';ctx.fillRect(400,250,700,600);
    const data=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    const asset={id:'cover-handoff-asset',blobId:'cover-handoff-image',title:'合成透明素材',kind:'sticker',role:'focal',seriesID:null,tags:[],reviewStatus:'ready',physicalWidthMM:40,physicalHeightMM:30,supply:{quantity:1},createdAt:new Date().toISOString()};
    await new Promise((resolve,reject)=>{const tx=db.transaction(['assets','blobs'],'readwrite');tx.objectStore('assets').put(asset);tx.objectStore('blobs').put({id:asset.blobId,data});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});
    db.close();
  })()`);
  await b.command('Page.reload');await b.wait('.series-grid');
  await b.click('[data-route="library"]','.series-grid');
  await b.click('.swift-tabs button:nth-child(2)','.asset-grid');
  await b.click('.asset-grid [data-act="detail"]','.detail-columns');
  await b.click('[data-act="detail-add"]');
  await b.click('[data-route="matching"]','[data-act="match-export-gpt"]');
  await b.click('[data-act="match-export-gpt"]','#offline-gpt-prompt');
  assert.match(await b.evaluate('document.querySelector(".offline-handoff-intro").textContent'),/任务包/);
  await b.evaluate(`(()=>{HTMLAnchorElement.prototype.click=function(){window.__coverHandoffDownload={filename:this.download,href:this.href}}})()`);
  await b.click('#offline-download-package');
  const payload=await b.evaluate(`(async()=>{const info=window.__coverHandoffDownload;const bytes=new Uint8Array(await (await fetch(info.href)).arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return {filename:info.filename,base64:btoa(binary)}})()`);
  assert.equal(payload.filename,'拾页-GPT创作任务.zip');
  const files=unzipSync(Buffer.from(payload.base64,'base64'));
  const names=Object.keys(files),material=names.find(name=>/^materials\/[^/]+\.(webp|png)$/.test(name));
  assert.ok(material,'ZIP 缺少低清素材封面：'+names.join(', '));
  assert.equal(names.filter(name=>name.startsWith('materials/')).length,1);
  assert.ok(!names.some(name=>/original|full|high-res/i.test(name)),'ZIP 混入高清原图');
  const encoded=Buffer.from(files[material]).toString('base64');
  const dimensions=await b.evaluate(`(async()=>{const raw=atob(${JSON.stringify(encoded)}),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));const image=await createImageBitmap(new Blob([bytes],{type:${JSON.stringify(material.endsWith('.png')?'image/png':'image/webp')}}));const result={width:image.width,height:image.height};image.close();return result})()`);
  assert.ok(Math.max(dimensions.width,dimensions.height)<=480,JSON.stringify(dimensions));
  assert.deepEqual(b.errors,[]);
  console.log('PASS: exported ZIP contains one material cover, longest edge',Math.max(dimensions.width,dimensions.height),'px');
}finally{await b.close();}
