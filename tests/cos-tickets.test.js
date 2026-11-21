import test from 'node:test';
import assert from 'node:assert/strict';
import {createTicketHandler} from '../server/cos-tickets.mjs';
import {createCOSStore} from '../src/cos-store.js';
const hash='a'.repeat(64),token='synthetic-token-for-test-only';
test('COS authorizes only authenticated owner hash paths and validates a whole batch before signing',async()=>{
  let signs=0;const run=createTicketHandler({ready:true,origin:'https://shiye-journal-test-shiye-pg-test-d1gg723f7fb356ccc.webapps.tcloudbase.com',authenticate:async t=>t===token?'owner':null,sign:async()=>{signs++;return 'https://example.test/private';}});
  const req={method:'POST',authorization:'Bearer '+token,body:{objects:[{method:'GET',path:'owner/'+hash}]}};
  assert.equal((await run({...req,authorization:''})).status,401);
  assert.equal((await run({...req,origin:'https://attacker.test'})).status,403);
  assert.equal((await run({...req,body:{objects:[...req.body.objects,{method:'GET',path:'other/'+hash}]}})).status,403);assert.equal(signs,0);
  for(const path of ['owner/../'+hash,'owner/'+hash+'/extra','owner/private-name.png'])assert.equal((await run({...req,body:{objects:[{method:'GET',path}]}})).status,403);
  assert.equal((await run(req)).status,200);
  const preview=await run({...req,body:{objects:[{method:'GET',path:'owner/'+hash,variant:'preview480'}]}});
  assert.equal(preview.status,200);assert.equal(preview.body.tickets[0].variant,'preview480');
  for(const variant of ['preview256','preview360','preview480','preview600','preview720','preview960','preview1200','preview1440','preview1920','preview2560','preview3200','preview3840','preview5120'])
    assert.equal((await run({...req,body:{objects:[{method:'GET',path:'owner/'+hash,variant}]}})).status,200,variant);
  for(const row of [{method:'GET',path:'owner/'+hash,variant:'preview621'},{method:'PUT',path:'owner/'+hash,type:'image/png',variant:'preview360'},{method:'GET',path:'owner/'+hash,variant:'sharpen'},{method:'GET',path:'owner/'+hash,variant:'preview359'},{method:'GET',path:'owner/'+hash,variant:'preview4096'},{method:'GET',path:'owner/'+hash,variant:'preview0004'},{method:'GET',path:'owner/'+hash+'-preview480.webp',variant:'preview480'}])
    assert.equal((await run({...req,body:{objects:[row]}})).status,403);
  assert.equal((await run({...req,body:{objects:[{method:'PUT',path:'owner/'+hash+'-preview480.webp',type:'image/webp'}]}})).status,200,'480px derived object is immutable and allowed');
  assert.equal((await run({...req,body:{objects:[{method:'PUT',path:'owner/'+hash+'-preview721.webp',type:'image/webp'}]}})).status,403,'only fixed cover width may be persisted');
  const put=await run({...req,body:{objects:[{method:'PUT',path:'owner/'+hash,type:'image/png'}]}});assert.equal(put.body.tickets[0].headers['x-cos-forbid-overwrite'],'true');
  assert.equal((await run({...req,method:'DELETE'})).status,405);
});
test('administrator may read another account in COS but can never write to its prefix',async()=>{
  const other='f217ac42-52ae-4d71-9b95-65e190034815';
  let signed=0;
  const run=createTicketHandler({ready:true,origin:'https://shiye-journal-test-shiye-pg-test-d1gg723f7fb356ccc.webapps.tcloudbase.com',authenticate:async()=>({userID:'owner',isAdmin:true}),sign:async()=>{signed++;return 'https://example.test/private';}});
  const req={method:'POST',authorization:'Bearer '+token,body:{objects:[{method:'GET',path:other+'/'+hash}]}};
  assert.equal((await run(req)).status,200);
  assert.equal(signed,1);
  assert.equal((await run({...req,body:{objects:[{method:'PUT',path:other+'/'+hash,type:'image/png'}]}})).status,403);
  assert.equal((await run({...req,body:{objects:[{method:'GET',path:'arbitrary/'+hash}]}})).status,403);
  assert.equal(signed,1);
});
test('COS adapter batches authorization, never exposes credentials, and does not fall back on failure',async()=>{
  let authorizationCalls=0,objectCalls=0;const store=createCOSStore({enabled:true,client:()=>({auth:{getSession:async()=>({data:{session:{access_token:token}}})}}),fetcher:async(url,options)=>{
    if(url==='/api/cos'){authorizationCalls++;assert.equal(options.headers.Authorization,'Bearer '+token);const {objects}=JSON.parse(options.body);return {ok:true,json:async()=>({tickets:objects.map(r=>({...r,url:'https://example.test/'+r.path,headers:{}}))})};}
    objectCalls++;return {ok:true,blob:async()=>new Blob(['image'])};
  }});
  await Promise.all([store.download('owner/'+hash),store.download('owner/'+'b'.repeat(64)),store.preview('owner/'+hash)]);assert.equal(authorizationCalls,1);assert.equal(objectCalls,3);
  const denied=createCOSStore({client:()=>({auth:{getSession:async()=>({data:{session:null}})}}),fetcher:async()=>{throw Error('should not fetch');}});await assert.rejects(denied.download('owner/'+hash),/请先登录/);
  const failed=createCOSStore({client:()=>({auth:{getSession:async()=>({data:{session:{access_token:token}}})}}),fetcher:async()=>({ok:false,status:503})});await assert.rejects(failed.download('owner/'+hash),/503/);
  let tries=0;const flaky=createCOSStore({client:()=>({auth:{getSession:async()=>({data:{session:{access_token:token}}})}}),fetcher:async(url,options)=>{if(url==='/api/cos'){tries++;if(tries===1)throw Error('transient network');const {objects}=JSON.parse(options.body);return {ok:true,json:async()=>({tickets:objects.map(row=>({...row,url:'https://example.test/'+row.path,headers:{}}))})};}return {ok:true,blob:async()=>new Blob(['recovered'])};}});
  assert.equal(await (await flaky.download('owner/'+hash)).text(),'recovered');assert.equal(tries,2);
  let deniedTries=0;const authDenied=createCOSStore({client:()=>({auth:{getSession:async()=>({data:{session:{access_token:token}}})}}),fetcher:async()=>{deniedTries++;return {ok:false,status:403};}});await assert.rejects(authDenied.download('owner/'+hash),/403/);assert.equal(deniedTries,1);
});
test('COS upload releases its queue when session acquisition stalls',async()=>{
  const store=createCOSStore({enabled:true,sessionTimeoutMs:10,
    client:()=>({auth:{getSession:()=>new Promise(()=>{})}}),
    fetcher:async()=>{throw Error('a signed request must not start without a session');}});
  await assert.rejects(store.upload('owner/'+hash,new Blob(['bytes'])),/等待登录会话超时/);
  await assert.rejects(store.upload('owner/'+'b'.repeat(64),new Blob(['bytes'])),/等待登录会话超时/);
});
test('COS batches sibling upload tickets that arrive a few milliseconds apart',async()=>{
  let ticketCalls=0;
  const store=createCOSStore({enabled:true,ticketBatchDelayMs:12,
    client:()=>({auth:{getSession:async()=>({data:{session:{access_token:token}}})}}),
    fetcher:async(url,options)=>{
      if(url==='/api/cos'){
        ticketCalls++;
        const objects=JSON.parse(options.body).objects;
        return {ok:true,json:async()=>({tickets:objects.map(row=>({...row,
          url:'https://example.test/'+row.path,headers:{}}))})};
      }
      return {ok:true};
    }});
  const first=store.upload('owner/'+hash,new Blob(['a']));
  await new Promise(resolve=>setTimeout(resolve,2));
  const second=store.upload('owner/'+'b'.repeat(64),new Blob(['b']));
  await Promise.all([first,second]);
  assert.equal(ticketCalls,1);
});
test('a stalled small-object PUT retries with a fresh ticket, but a forbidden PUT does not',async()=>{
  let tickets=0,puts=0,status=200;
  const store=createCOSStore({enabled:true,ticketBatchDelayMs:1,
    client:()=>({auth:{getSession:async()=>({data:{session:{access_token:token}}})}}),
    fetcher:async(url,options)=>{
      if(url==='/api/cos'){
        tickets++;
        const objects=JSON.parse(options.body).objects;
        return {ok:true,json:async()=>({tickets:objects.map(row=>({...row,
          url:'https://example.test/'+row.path,headers:{}}))})};
      }
      if(options.method!=='PUT')return {ok:false,status:404,body:{cancel:async()=>{}}};
      puts++;
      if(puts===1){assert.ok(options.signal,'PUT is bounded by a timeout');
        throw Object.assign(Error('stalled'),{name:'TimeoutError'});}
      return {ok:status===200,status};
    }});
  await store.upload('owner/'+hash,new Blob(['small']));
  assert.equal(puts,2);assert.equal(tickets,3);
  status=403;
  await assert.rejects(store.upload('owner/'+'b'.repeat(64),new Blob(['small'])),/403/);
  assert.equal(puts,3);assert.equal(tickets,4);
});
test('COS object probe distinguishes a missing object from a temporary or forbidden read',async()=>{
  let status=404,readOptions;
  const store=createCOSStore({enabled:true,client:()=>({auth:{getSession:async()=>({data:{session:{access_token:token}}})}}),fetcher:async(url,options)=>{
    if(url==='/api/cos'){const objects=JSON.parse(options.body).objects;return {ok:true,json:async()=>({tickets:objects.map(row=>({...row,url:'https://example.test/'+row.path,headers:{}}))})};}
    readOptions=options;return {ok:status>=200&&status<300,status,body:{cancel:async()=>{}}};
  }});
  assert.equal(await store.probe('owner/'+hash),false);assert.equal(readOptions.headers.Range,'bytes=0-0');
  status=206;assert.equal(await store.probe('owner/'+hash),true);
  status=403;await assert.rejects(store.probe('owner/'+hash),/403/);
});
test('COS uploads leave read capacity available and do not sign queued PUTs early',async()=>{
  const user='owner/',paths=Array.from({length:5},(_,i)=>user+String(i).repeat(64));
  let started=0,releaseRead;const releases=[];let signedWrites=0;
  const store=createCOSStore({enabled:true,client:()=>({auth:{getSession:async()=>({data:{session:{access_token:token}}})}}),fetcher:async(url,options)=>{
    if(url==='/api/cos'){const objects=JSON.parse(options.body).objects;signedWrites+=objects.filter(row=>row.method==='PUT').length;return {ok:true,json:async()=>({tickets:objects.map(row=>({...row,url:'https://example.test/'+row.path,headers:{}}))})};}
    if(options?.method==='PUT'){started++;await new Promise(resolve=>releases.push(resolve));return {ok:true};}
    await new Promise(resolve=>releaseRead=resolve);return {ok:true,blob:async()=>new Blob(['visible'])};
  }});
  const uploads=paths.map(path=>store.upload(path,new Blob(['bytes'])));
  for(let i=0;i<30&&started<3;i++)await new Promise(resolve=>setTimeout(resolve,1));assert.equal(started,3);
  const read=store.download(paths[0]);for(let i=0;i<30&&!releaseRead;i++)await new Promise(resolve=>setTimeout(resolve,1));assert.ok(releaseRead);
  releases.shift()();await new Promise(resolve=>setTimeout(resolve,5));assert.equal(started,3,'a queued write must not take the visible read lane');
  releaseRead();assert.equal(await (await read).text(),'visible');for(let i=0;i<30&&started<4;i++)await new Promise(resolve=>setTimeout(resolve,1));assert.equal(started,4);
  while(releases.length)releases.shift()();for(let i=0;i<30&&started<5;i++)await new Promise(resolve=>setTimeout(resolve,1));while(releases.length)releases.shift()();await Promise.all(uploads);assert.equal(signedWrites,5);
});
test('COS originals bypass optional previews and upload timing omits object paths',async()=>{
  const started=[],releases=new Map(),events=[];
  const store=createCOSStore({enabled:true,ticketBatchDelayMs:1,
    client:()=>({auth:{getSession:async()=>({data:{session:{access_token:token}}})}}),
    fetcher:async(url,options)=>{
      if(url==='/api/cos'){
        const objects=JSON.parse(options.body).objects;
        return {ok:true,json:async()=>({tickets:objects.map(row=>({...row,url:'https://example.test/'+row.path,headers:{}}))})};
      }
      started.push(url);
      await new Promise(resolve=>releases.set(url,resolve));
      return {ok:true};
    }});
  store.setDiagnosticReporter(event=>events.push(event));
  const previews=[0,1,2].map(i=>store.upload(`owner/${String(i).repeat(64)}-preview480.webp`,new Blob(['preview'])));
  for(let i=0;i<40&&started.length<1;i++)await new Promise(resolve=>setTimeout(resolve,1));
  assert.equal(started.length,1,'only one optional preview occupies a write lane');
  const originalPath='owner/'+hash,original=store.upload(originalPath,new Blob(['original']));
  for(let i=0;i<40&&started.length<2;i++)await new Promise(resolve=>setTimeout(resolve,1));
  assert.equal(started[1],'https://example.test/'+originalPath,'original starts without waiting for preview');
  releases.get(started[1])();await original;
  releases.get(started[0])();
  for(let index=2;index<4;index++){
    for(let i=0;i<40&&started.length<=index;i++)await new Promise(resolve=>setTimeout(resolve,1));
    assert.ok(started[index],'next preview eventually starts');
    releases.get(started[index])();
  }
  await Promise.all(previews);
  assert.ok(events.some(event=>event.action==='cos-put'));
  assert.ok(events.every(event=>!JSON.stringify(event).includes(originalPath)));
});

 test('an ambiguous PUT is acknowledged when its immutable object exists, without uploading again',async()=>{
  let puts=0,probes=0;const events=[];
  const store=createCOSStore({client:()=>({auth:{getSession:async()=>({data:{session:{access_token:token}}})}}),
    fetcher:async(url,options)=>{
      if(url==='/api/cos'){const objects=JSON.parse(options.body).objects;
        return {ok:true,json:async()=>({tickets:objects.map(row=>({...row,url:'https://example.test/'+row.path,headers:{}}))})};}
      if(options.method==='PUT'){puts++;throw Object.assign(Error('response lost'),{name:'TimeoutError'});}
      probes++;return {ok:true,status:206,body:{cancel:async()=>{}}};
    }});
  store.setDiagnosticReporter(event=>events.push(event));
  await store.upload('owner/'+hash,new Blob(['bytes']));
  assert.equal(puts,1);assert.equal(probes,1);
  assert.ok(events.some(event=>event.action==='cos-put-verified'));
});
