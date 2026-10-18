import test from 'node:test';
import assert from 'node:assert/strict';
import {createSyncCommitRelay} from '../server/sync-commit-relay.mjs';
import {fetchCloudRequest} from '../src/cloud-session.js';

const payload={operations:[{store:'assets',action:'put',item:{id:'a'}}],
  base_revision:7,operation_id:'00000000-0000-4000-8000-000000000001',
  expected_epoch:'epoch',sync_protocol_version:3};
function response(){return {code:0,headers:{},body:null,setHeader(key,value){this.headers[key]=value;},
  status(code){this.code=code;return this;},json(body){this.body=body;return this;},
  send(body){this.body=body;return this;}};}

test('relay forwards only a v3 commit with the user JWT and public key',async()=>{
  const calls=[],handler=createSyncCommitRelay({env:{
    VITE_SHIYE_SUPABASE_URL:'https://test.supabase.co',
    VITE_SHIYE_SUPABASE_PUBLISHABLE_KEY:'public-key'},
  fetcher:async(url,init)=>{calls.push({url,init});return {status:200,text:async()=>
    '{"status":"applied","revision":8}'};}});
  const res=response();await handler({method:'POST',headers:{origin:'https://shiye-journal-test.vercel.app',
    authorization:'Bearer user.jwt.token'},body:payload},res);
  assert.equal(res.code,200);
  assert.equal(calls.length,1);
  assert.equal(calls[0].url.toString(),
    'https://test.supabase.co/rest/v1/rpc/shiye_commit_v3_guarded');
  assert.equal(calls[0].init.headers.Authorization,'Bearer user.jwt.token');
  assert.equal(calls[0].init.headers.apikey,'public-key');
  assert.equal(JSON.parse(calls[0].init.body).operation_id,payload.operation_id);
});

test('relay rejects foreign origins and malformed commits without forwarding',async()=>{
  let calls=0,handler=createSyncCommitRelay({fetcher:async()=>{calls++;}});
  for(const [origin,body,code] of [
    ['https://foreign.example',payload,403],
    ['https://shiye-journal-test.vercel.app',{...payload,sync_protocol_version:2},400]
  ]){
    const res=response();await handler({method:'POST',headers:{origin,
      authorization:'Bearer user.jwt.token'},body},res);
    assert.equal(res.code,code);
  }
  assert.equal(calls,0);
});

test('a failed direct commit uses the same operation body through the relay',async()=>{
  const priorWindow=globalThis.window;globalThis.window={};
  try{
    const calls=[],body=JSON.stringify(payload);
    const reply=await fetchCloudRequest(
      'https://test.supabase.co/rest/v1/rpc/shiye_commit_v3_guarded',
      {method:'POST',body,headers:{Authorization:'Bearer user.jwt.token'}},{
        fetcher:async(input,init)=>{
          calls.push({input,init});
          if(calls.length===1)throw new TypeError('Failed to fetch');
          return {ok:true,status:200};
        }
      });
    assert.equal(reply.status,200);
    assert.equal(calls[1].input,'/api/sync-commit');
    assert.equal(calls[1].init.body,body);
  }finally{if(priorWindow===undefined)delete globalThis.window;
    else globalThis.window=priorWindow;}
});

test('ordinary reads never use the commit relay',async()=>{
  let calls=0;
  await assert.rejects(fetchCloudRequest('https://test.supabase.co/rest/v1/shiye_records',
    {method:'GET'},{fetcher:async()=>{calls++;throw new TypeError('Failed to fetch');}}));
  assert.equal(calls,1);
});

test('a large valid commit may use the relay after an unconfirmed direct response',async()=>{
  const priorWindow=globalThis.window;globalThis.window={};
  try{
    const body=JSON.stringify({...payload,operations:[{store:'assets',action:'put',
      item:{id:'a',title:'x'.repeat(1_100_000)}}]});
    let calls=0;
    const reply=await fetchCloudRequest(
      'https://test.supabase.co/rest/v1/rpc/shiye_commit_v3_guarded',
      {method:'POST',body,headers:{Authorization:'Bearer user.jwt.token'}},{
        fetcher:async()=>{calls++;if(calls===1)throw new TypeError('Failed to fetch');
          return {ok:true,status:200};}
      });
    assert.equal(reply.status,200);assert.equal(calls,2);
  }finally{if(priorWindow===undefined)delete globalThis.window;
    else globalThis.window=priorWindow;}
});
