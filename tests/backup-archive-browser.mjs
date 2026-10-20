import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';
import {Zip,ZipPassThrough,zipSync} from 'fflate';

const target=process.env.SHIYE_TEST_URL||'http://127.0.0.1:5192';
if(!['127.0.0.1','localhost'].includes(new URL(target).hostname))throw Error('备份恢复测试只允许本机隔离站，拒绝对线上资料写入');
const compressedBase64=Buffer.from(zipSync({'manifest.json':new TextEncoder().encode('X'.repeat(100000))},
  {level:6})).toString('base64');
const traversalBase64=Buffer.from(zipSync({'../outside.json':new TextEncoder().encode('bad')},
  {level:0})).toString('base64');
const duplicateBase64=Buffer.from(await new Promise((resolve,reject)=>{
  const chunks=[],archive=new Zip((error,chunk,final)=>{
    if(error){reject(error);return;}chunks.push(chunk);
    if(final)resolve(Buffer.concat(chunks.map(item=>Buffer.from(item))));
  });
  for(let i=0;i<2;i++){
    const entry=new ZipPassThrough('manifest.json');archive.add(entry);
    entry.push(new TextEncoder().encode('{}'),true);
  }
  archive.end();
})).toString('base64');
const tooManyBase64=Buffer.from(zipSync(Object.fromEntries(Array.from({length:20001},(_,i)=>[
  `blobs/${String(i).padStart(8,'0')}.bin`,new Uint8Array(0)
])),{level:0})).toString('base64');
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
    // A desktop streamed export must never produce a backup this app offers
    // to restore only after clearing the current library. The rejection is
    // checked in the worker before it reads any of the oversized ZIP body.
    const oneMiB=new Blob([new Uint8Array(1024*1024)]);
    const oversized=new Blob(Array(257).fill(oneMiB));
    let sizeRejected=false;
    try{await readZipBackup(oversized);}catch(error){sizeRejected=/256 MB/.test(error.message);}
    if(!sizeRejected)throw Error('oversized ZIP was not rejected before restore');
    const compressed=Uint8Array.from(atob('${compressedBase64}'),char=>char.charCodeAt(0));
    let compressedRejected=false;
    try{await readZipBackup(new Blob([compressed]));}
    catch(error){compressedRejected=/不受支持的压缩文件/.test(error.message);}
    if(!compressedRejected)throw Error('compressed ZIP was allowed to expand');
    for(const [name,encoded] of [['path traversal','${traversalBase64}'],
      ['duplicate entry','${duplicateBase64}']]){
      const hostile=Uint8Array.from(atob(encoded),char=>char.charCodeAt(0));
      let rejected=false;
      try{await readZipBackup(new Blob([hostile]));}
      catch(error){rejected=/非法、重复或过多/.test(error.message);}
      if(!rejected)throw Error(name+' ZIP entry was accepted');
    }
    const tooMany=Uint8Array.from(atob('${tooManyBase64}'),char=>char.charCodeAt(0));
    let entryLimitRejected=false;
    try{await readZipBackup(new Blob([tooMany]));}
    catch(error){entryLimitRejected=/非法、重复或过多/.test(error.message);
      if(!entryLimitRejected)throw Error('ZIP entry limit gave '+error.message);}
    if(!entryLimitRejected)throw Error('ZIP entry limit was not enforced');
    // End-to-end: browser IDB and store.restoreBackup() must preserve exact
    // bytes, then reject a damaged ZIP without clearing the last good copy.
    const store=await import('/src/store.js');
    const id='zip-browser-test-'+crypto.randomUUID(),blobID='blob-'+id,projectID='work-'+id;
    const work={id:projectID,title:'ZIP 作品验收',activeDraftID:'draft',drafts:[{
      id:'draft',sceneVersion:2,canvas:{width:300,height:400},pageMode:'single',
      physicalPageHeightMM:297,layers:[{id:'colored-shape',type:'shape',kind:'rectangle',
        x:150,y:200,width:100,height:100,fill:'#ff0000'}]
    }]};
    await store.transaction(['assets','blobs','projects'],tx=>{
      tx.objectStore('assets').put({id,title:'ZIP acceptance',blobId:blobID});
      tx.objectStore('blobs').put({id:blobID,data:bin});
      tx.objectStore('projects').put(work);
    });
    const full=await store.createBackup();
    await store.transaction(['assets','blobs','projects'],tx=>{
      tx.objectStore('assets').delete(id);
      tx.objectStore('blobs').delete(blobID);
      tx.objectStore('projects').delete(projectID);
    });
    await store.restoreBackup(full);
    const exact=await store.get('blobs',blobID);
    if(!exact||await exact.data.text()!==await bin.text())throw Error('actual IndexedDB ZIP restore failed');
    const restoredWork=await store.get('projects',projectID);
    if(!restoredWork?.drafts?.length)throw Error('restored editable work missing');
    const {renderSceneCanvas}=await import('/src/scene-renderer.js');
    const rendered=await renderSceneCanvas(restoredWork.drafts[0],{waitForFonts:false});
    const center=rendered.canvas.getContext('2d').getImageData(150,200,1,1).data;
    if(center[0]<180||center[1]>100||center[2]>100)
      throw Error('restored work did not render its editable shape');
    await store.put('assets',{id,title:'latest-owned-record',blobId:blobID});
    const broken=new Uint8Array(await full.arrayBuffer());
    // Invalid ZIP must fail before any full table replacement.
    broken[0]=0;
    let legacyRejected=false;
    try{await store.restoreBackup(new Blob([broken]));}catch{legacyRejected=true;}
    if(!legacyRejected||(await store.get('assets',id))?.title!=='latest-owned-record')
      throw Error('corrupt ZIP overwrote an existing record');
    // The same six-store transaction primitive used by restore must roll
    // back a failure even after its first destructive request was queued.
    let aborted=false;
    try{await store.confirmedTransaction(['assets','blobs','series','projects','meta','trash'],tx=>{
      tx.objectStore('assets').clear();
      throw Error('injected restore interruption');
    });}catch(error){aborted=/injected restore interruption/.test(error.message);}
    if(!aborted||(await store.get('assets',id))?.title!=='latest-owned-record')
      throw Error('aborted restore transaction did not preserve the original library');
    return {blobSize:output.size,tables:Object.keys(recovered).length,heartbeats,id,blobID,projectID};

  })()`);
  assert.equal(result.tables,6);
  assert.ok(result.blobSize>100);
  await b.command('Page.reload');
  await b.wait('.series-grid');
  const persisted=await b.evaluate(`(async()=>{
    const store=await import('/src/store.js');
    const [asset,blob,work]=await Promise.all([
      store.get('assets',${JSON.stringify(result.id)}),
      store.get('blobs',${JSON.stringify(result.blobID)}),
      store.get('projects',${JSON.stringify(result.projectID)})
    ]);
    return {asset:asset?.title,blob:blob?await blob.data.text():null,
      work:work?.drafts?.[0]?.layers?.[0]?.id};
  })()`);
  assert.equal(persisted.asset,'latest-owned-record');
  assert.equal(persisted.blob,'SYNTHETIC PRIVATE IMAGE BYTES 2026\n');
  assert.equal(persisted.work,'colored-shape');
  // The deliberate rollback above also rejects its queued IndexedDB clear()
  // request; Chromium reports that expected AbortError separately.
  assert.deepEqual(b.errors.filter(error=>!error.includes('AbortError: The transaction was aborted')),[]);
  console.log('PASS: worker ZIP archive, independent bytes, integrity rejection, six stores',result);
}catch(error){console.error('Backup acceptance failed:',error);throw error;}finally{await b.close();}
