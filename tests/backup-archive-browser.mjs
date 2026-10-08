import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';

const b=await browserHarness('shiye-backup-archive',process.env.SHIYE_TEST_URL||'http://127.0.0.1:5192');
try{
  await b.wait('.series-grid');
  const result=await b.evaluate(`(async()=>{
    const {createZipBackup,readZipBackup}=await import('/src/backup-archive.js');
    const {validateRestoredRecords}=await import('/src/backup-integrity.js');
    const bin=new Blob([new TextEncoder().encode('SYNTHETIC PRIVATE IMAGE BYTES 2026\\n')],{type:'image/png'});
    const records={
      assets:[{id:'asset',title:'测试素材',blobId:'blob',supply:{quantity:1}}],
      series:[{id:'series',title:'synthetic'}],
      projects:[{id:'project',drafts:[{id:'d',items:[{assetID:'asset'}]}]}],
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
    return {blobSize:output.size,tables:Object.keys(recovered).length,heartbeats};
  })()`);
  assert.equal(result.tables,6);
  assert.ok(result.blobSize>100);
  assert.deepEqual(b.errors,[]);
  console.log('PASS: worker ZIP archive, independent bytes, integrity rejection, six stores',result);
}finally{await b.close();}
