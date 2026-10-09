import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync} from 'fflate';

test('ZIP completion includes its final directory and manifest',async()=>{
  const previous=globalThis.self,chunks=[],waiting=new Map();
  const self={onmessage:null,postMessage(message){
    if(message.type==='chunk'){
      chunks.push(message.bytes);
      queueMicrotask(()=>self.onmessage({data:{type:'ack',seq:message.seq}}));
    }else waiting.get(message.type)?.(message);
  }};
  globalThis.self=self;
  const reply=type=>new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(Error('ZIP worker did not send '+type)),3000);
    waiting.set(type,message=>{clearTimeout(timeout);waiting.delete(type);resolve(message);});
  });
  try{
    await import('../src/backup-zip-worker.js');
    const records={assets:[],series:[],projects:[],meta:[],trash:[]};
    let next=reply('ready');self.onmessage({data:{type:'begin',records}});await next;
    next=reply('image-done');self.onmessage({data:{type:'image',record:{id:'asset',data:new Blob(['original image'])}}});await next;
    next=reply('done');self.onmessage({data:{type:'finish'}});await next;
    const size=chunks.reduce((n,chunk)=>n+chunk.length,0),archive=new Uint8Array(size);let at=0;
    for(const chunk of chunks){archive.set(chunk,at);at+=chunk.length;}
    const files=unzipSync(archive),manifest=JSON.parse(new TextDecoder().decode(files['manifest.json']));
    assert.equal(manifest.blobs.length,1);
    assert.equal(new TextDecoder().decode(files[manifest.blobs[0].path]),'original image');
  }finally{if(previous===undefined)delete globalThis.self;else globalThis.self=previous;}
});
