import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';

const target=process.env.SHIYE_TEST_URL||'http://127.0.0.1:5192';
if(!['127.0.0.1','localhost'].includes(new URL(target).hostname))throw Error('备份恢复测试只允许本机隔离站，拒绝对线上资料写入');
const b=await browserHarness('shiye-backup-archive',target);
try{
  await b.wait('.series-grid');
  const result=await b.evaluate(`(async()=>{
    const {createZipBackup,readZipBackup}=await import('/src/backup-archive.js');
    const {validateRestoredRecords}=await import('/src/backup-integrity.js');
    const bin=new Blob([new TextEncoder().encode('SYNTHETIC PRIVATE IMAGE BYTES 2026\\n')],{type:'image/png'});
    const records={
      assets:[{id:'asset',title:'测试素材',blobId:'blob'}],
      series:[{id:'series',title:'synthetic'}],
      projects:[{id:'project',title:'合成作品',activeDraftID:'d',drafts:[{id:'d',sceneVersion:2,canvas:{width:700,height:1000},pageMode:'single',physicalPageHeightMM:297,layers:[{id:'item',type:'material',assetID:'asset',x:30,y:40,width:50,height:60}]}]}],
      meta:[{id:'test',value:1}],
      trash:[]
    };
    let lastProgress=0,heartbeats=0;
    const timer=setInterval(()=>heartbeats++,0);
    const output=await createZipBackup({records,blobIDs:['blob'],loadBlob:async()=>({id:'blob',data:bin}),
      onProgress:({current})=>lastProgress=current});
    clearInterval(timer);
    if(!(output instanceof Blob)||output.type!=='application/zip')throw Error('ZIP export missing');
    const bytes=new Uint8Array(await output.arrayBuffer());
    if(bytes[0]!==80||bytes[1]!==75)throw Error('ZIP magic missing');
    const recovered=await readZipBackup(output);
    validateRestoredRecords(recovered);
    if(recovered.assets.length!==1||recovered.blobs.length!==1||lastProgress!==1)throw Error('not all tables restored');
    if(await recovered.blobs[0].data.text()!==await bin.text())throw Error('original image changed');
    if(recovered.blobs[0].data.type!=='image/png')throw Error('MIME lost');
    // Corrupt the stored original bytes while leaving the central directory.
    const needle=new TextEncoder().encode('SYNTHETIC PRIVATE IMAGE');
    let where=-1;
    for(let i=0;i<bytes.length-needle.length;i++){
      if(needle.every((v,j)=>bytes[i+j]===v)){where=i;break;}
    }
    if(where<0)throw Error('image not stored as independent binary entry');
    bytes[where]^=1;let refused=false;
    try{await readZipBackup(new Blob([bytes],{type:'application/zip'}));}
    catch{refused=true;}
    if(!refused)throw Error('corrupt independent image accepted');
    // End-to-end: browser IDB and store.restoreBackup() must preserve exact
    // bytes, then reject a damaged ZIP without clearing the last good copy.
    const store=await import('/src/store.js');
    const id='zip-browser-test-'+crypto.randomUUID(),blobID='blob-'+id;
    await store.transaction(['assets','blobs'],tx=>{
      tx.objectStore('assets').put({id,title:'ZIP acceptance',blobId:blobID});
      tx.objectStore('blobs').put({id:blobID,data:bin});
    });
    const full=await store.createBackup();
    await store.transaction(['assets','blobs'],tx=>{
      tx.objectStore('assets').delete(id);
      tx.objectStore('blobs').delete(blobID);
    });
    await store.restoreBackup(full);
    const exact=await store.get('blobs',blobID);
    if(!exact||await exact.data.text()!==await bin.text())throw Error('actual IndexedDB ZIP restore failed');
    await store.put('assets',{id,title:'latest-owned-record',blobId:blobID});
    const broken=new Uint8Array(await full.arrayBuffer());
    // Invalid ZIP must fail before any full table replacement.
    broken[0]=0;
    let legacyRejected=false;
    try{await store.restoreBackup(new Blob([broken]));}catch{legacyRejected=true;}
    if(!legacyRejected||(await store.get('assets',id))?.title!=='latest-owned-record')
      throw Error('corrupt ZIP overwrote an existing record');
    return {blobSize:output.size,tables:Object.keys(recovered).length,heartbeats};

  })()`);
  assert.equal(result.tables,6);
  assert.ok(result.blobSize>100);
  assert.deepEqual(b.errors,[]);
  console.log('PASS: worker ZIP archive, independent bytes, integrity rejection, six stores',result);
}finally{await b.close();}
