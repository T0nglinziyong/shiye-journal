// Only synthetic records in an isolated browser; exported PDF stays in /tmp.
import assert from 'node:assert/strict';
import {mkdir,readdir,readFile} from 'node:fs/promises';
import {PDFDocument} from 'pdf-lib';
import {browserHarness} from './browser-harness.mjs';
const directory=process.env.SHIYE_PDF_OUTPUT||'/tmp/shiye-pdf-verification';
await mkdir(directory,{recursive:true});
const b=await browserHarness('shiye-pdf-test',process.env.SHIYE_TEST_URL||'http://127.0.0.1:5173');
try{
  await b.wait('.series-grid');
  await b.evaluate(`(async()=>{const db=await new Promise(r=>{const q=indexedDB.open('shiye-pwa-full-v1');q.onsuccess=()=>r(q.result);}),c=document.createElement('canvas');c.width=400;c.height=800;const x=c.getContext('2d');x.fillStyle='#dfe7d8';x.fillRect(0,0,400,800);x.fillStyle='#52634b';x.fillRect(10,10,380,780);const data=await new Promise(r=>c.toBlob(r,'image/png'));await new Promise((r,j)=>{const t=db.transaction(['assets','blobs','meta'],'readwrite');t.objectStore('assets').put({id:'pdf-synthetic',title:'PDF尺寸验收',kind:'paper',role:'support',reviewStatus:'ready',tags:[],createdAt:new Date().toISOString(),blobId:'pdf-synthetic-blob',originalBlobId:'pdf-synthetic-blob',physicalWidthMM:40,physicalHeightMM:80,supply:{quantity:1}});t.objectStore('blobs').put({id:'pdf-synthetic-blob',data});t.objectStore('meta').put({id:'cece-samples-v2'});t.oncomplete=r;t.onerror=()=>j(t.error);});db.close();})()`);
  await b.command('Page.reload');await b.wait('.series-grid');
  await b.command('Page.setDownloadBehavior',{behavior:'allow',downloadPath:directory});
  await b.click('.swift-tabs button:nth-child(2)','.asset-grid');
  await b.click('[data-act="detail"][data-id="pdf-synthetic"]','.detail-columns');
  await b.evaluate(`[...document.querySelectorAll('.detail-links button')].find(b=>b.textContent==='导出打印 PDF').click()`);
  let name;for(let i=0;i<500;i++){name=(await readdir(directory)).find(n=>n.endsWith('.pdf'));if(name)break;await b.sleep(20);}
  assert.ok(name,'PDF download did not complete');
  const pdf=await PDFDocument.load(await readFile(directory+'/'+name));
  assert.equal(pdf.getPageCount(),1);
  const size=pdf.getPage(0).getSize();assert.ok(Math.abs(size.width-210*72/25.4)<.001&&Math.abs(size.height-297*72/25.4)<.001);
  assert.deepEqual(b.errors,[]);console.log('Actual app PDF export: parseable A4, 40 × 80 mm synthetic material, 10 mm ruler:',directory+'/'+name);
}finally{await b.close();}
