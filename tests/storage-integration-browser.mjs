import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';
// Every mutation in this test is in a synthetic, browser-local IDB database.
const base=process.env.SHIYE_TEST_URL||'http://127.0.0.1:5193';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))
  throw Error('Storage acceptance cannot run against a real user website');
const b=await browserHarness('shiye-storage-integration',base);
try{
  await b.wait('.series-grid');
  const boot=await b.evaluate('({view:document.querySelector("#view")?.textContent?.slice(0,160),title:document.title})');
  console.log('Synthetic browser boot:',boot);
  const result=await b.evaluate(`(async()=>{
    const {createZipBackup,readZipBackup}=await import('/src/backup-archive.js');
    const {createPrivateCache}=await import('/src/private-cache.js');
    const id='storage-acceptance-'+crypto.randomUUID(),account='fake-account';
    const a=createPrivateCache({name:id}),c=createPrivateCache({name:id});
    const row=(key,serial=1)=>({serial,baseRevision:0,operationID:crypto.randomUUID(),record:{id:key,title:key}});
    const first=row('first'),second=row('second');
    await Promise.all([
      a.putOutbox(account,'project-outbox',[],[first]),
      c.putOutbox(account,'project-outbox',[],[second])
    ]);
    const entries=await a.get(account,'project-outbox');
    if(entries.length!==2)throw Error('Concurrent tab data loss: '+entries.length);
    const conflicting=row('first',2);
    let conflict=false;
    try{await c.putOutbox(account,'project-outbox',[],[conflicting]);}catch{conflict=true;}
    if(!conflict)throw Error('Concurrent same-document update overwrote an existing edit');
    const queue='unified-outbox',bulk=new Blob([new Uint8Array(256*1024)]);
    let pending=[];
    for(let index=0;index<26;index++){
      const next=[...pending,{serial:index+1,baseRevision:0,
        operationID:crypto.randomUUID(),record:{id:'import-'+index,kind:'batch',data:bulk}}];
      await a.putOutbox(account,queue,pending,next);pending=next;
    }
    if((await c.get(account,queue)).length!==26)throw Error('Blob import queue lost a row');
    await a.putOutbox(account,queue,pending,[]);
    if((await c.get(account,queue)).length)throw Error('Acknowledged rows remained in queue');

    // A live text input must stay responsive while image bytes are packaged.
    const input=document.createElement('textarea');input.value='handwritten-note-synthetic';
    input.style.cssText='position:fixed;left:0;top:0;width:100px;height:50px;z-index:9999';
    document.body.append(input);input.focus();
    let heartbeats=0,worst=0,last=performance.now();
    const timer=setInterval(()=>{const now=performance.now();worst=Math.max(worst,now-last);last=now;heartbeats++;},20);
    const bytes=new Uint8Array(4*1024*1024);
    for(let i=0;i<bytes.length;i+=4096)bytes[i]=(i/4096)%256;
    const records={assets:[{id:'synthetic-asset',blobId:'img'}],series:[],
      projects:[{id:'work',drafts:[]}],meta:[],trash:[]};
    const source=new Blob([bytes],{type:'application/octet-stream'});
    const started=performance.now();
    const packed=await createZipBackup({records,blobIDs:['img'],loadBlob:async()=>({id:'img',data:source})});
    const recovered=await readZipBackup(packed);
    const elapsed=performance.now()-started;
    clearInterval(timer);
    const focused=document.activeElement===input;
    const unchanged=input.value==='handwritten-note-synthetic';input.remove();
    if(!focused||!unchanged)throw Error('Backup interrupted an active input');
    if(heartbeats<2||worst>1000)throw Error('UI event loop paused during ZIP: '+worst);
    if(!recovered.blobs?.length||recovered.blobs[0].data.size!==source.size)throw Error('Restored bytes missing');
    // Exercise the direct-to-file streaming adapter without a File System Access prompt.
    let parts=0,bytesWritten=0;
    const streamed=await createZipBackup({records,blobIDs:['img'],loadBlob:async()=>({id:'img',data:source}),
      onChunk:async chunk=>{parts++;bytesWritten+=chunk.byteLength;}});
    if(streamed.bytes!==bytesWritten||parts<2)throw Error('ZIP writer backpressure broken');
    return {heartbeats,worstFrameDelayMs:Math.round(worst),elapsedMs:Math.round(elapsed),
      restoredBytes:recovered.blobs[0].data.size,streamChunks:parts};
  })()`);
  assert.ok(result.heartbeats>=2);
  assert.ok(result.worstFrameDelayMs<1000);
  assert.equal(result.restoredBytes,4*1024*1024);
  assert.deepEqual(b.errors,[]);
  console.log('PASS: synthetic concurrent outbox, 26 Blob imports, input responsive during ZIP, direct chunk writer',result);
}finally{await b.close();}
