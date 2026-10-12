import test from 'node:test';
import assert from 'node:assert/strict';
import {checkAccountResetEpoch,resetMarkerToken,observedResetKey,finishPendingAccountReset} from '../src/account-reset-epoch.js';
import {eraseSiteAppData} from '../src/account-data-wipe.js';
import {createProjectSync} from '../src/project-sync.js';

function mockClient(record,queries=[]){
 const result={data:record?{record}:null,error:null};
 return {from:table=>{
   assert.equal(table,'shiye_records');
   const query={select(){return this;},eq(key,value){queries.push([key,value]);return this;},
     maybeSingle:async()=>result};
   return query;
 }};
}
const marker=(resetId='4b7df00d-20a0-4d13-97aa-25ce19ec9c12',phase='complete')=>({
 id:'shiye-reset-barrier',resetId,phase,revision:34
});
function memoryStorage(initial={}){
 const values=new Map(Object.entries(initial));
 return {getItem:key=>values.get(key)??null,setItem:(key,val)=>values.set(key,String(val)),
   get length(){return values.size;},key:i=>[...values.keys()][i]??null,
   clear:()=>values.clear(),dump:()=>Object.fromEntries(values)};
}
test('a different device first login purges IndexedDB before reporting ready',async()=>{
 const userId='u-123',queries=[],storage=memoryStorage({'shiye-old-settings':'old'});
 let deleted=0;
 const run=()=>checkAccountResetEpoch({client:mockClient(marker(),queries),userId,storage,
   erase:async()=>{deleted++;}});
 const first=await run(),second=await run();
 assert.equal(first.wiped,true);assert.equal(second.wiped,false);
 assert.equal(deleted,1);assert.equal(storage.getItem(observedResetKey(userId)),marker().resetId);
 assert.ok(queries.some(([k,v])=>k==='user_id'&&v===userId));
});
test('when IndexedDB deletion is blocked, marker is not acknowledged',async()=>{
 const storage=memoryStorage();
 await assert.rejects(checkAccountResetEpoch({client:mockClient(marker()),userId:'u',
   storage,erase:async()=>{throw Error('IndexedDB blocked');}}),/blocked/);
 assert.equal(storage.getItem(observedResetKey('u')),null);
});
test('a second reset uses a different id and invalidates previously observed devices',async()=>{
 const storage=memoryStorage({[observedResetKey('u')]:marker('old').resetId});
 const next=marker('13f6d30e-5bb2-4c90-8d57-476cfa835700','deleting');
 const result=await checkAccountResetEpoch({client:mockClient(next),userId:'u',storage,erase:async()=>{}});
 assert.equal(result.wiped,true);assert.equal(result.pending,true);
});
test('missing reset marker never wipes local work',async()=>{
 const result=await checkAccountResetEpoch({client:mockClient(null),userId:'u',
   storage:memoryStorage(),erase:async()=>{throw Error('must not erase');}});
 assert.equal(result.wiped,false);
});
test('legacy server reset marker is recognized',()=>{
 assert.equal(resetMarkerToken({id:'shiye-reset-barrier',revision:10}),'legacy:10');
});
test('automatic purge clears app storage while preserving a current Supabase login token',async()=>{
 const storage=memoryStorage({'shiye-settings':'old','sb-my-ref-auth-token':'secret-token',
   'shiye-reset-observed:u':'stale'});
 const idb={databases:async()=>[],deleteDatabase:()=>{const req={};
   queueMicrotask(()=>req.onsuccess?.());return req;}};
 const result=await eraseSiteAppData({storage,session:memoryStorage(),idb,
   cacheStorage:{keys:async()=>[],delete:async()=>true},
   serviceWorker:{getRegistrations:async()=>[]},preserveAuthentication:true});
 assert.deepEqual(result.errors,[]);
 assert.equal(storage.getItem('sb-my-ref-auth-token'),'secret-token');
 assert.equal(storage.getItem('shiye-settings'),null);
 assert.equal(storage.getItem('shiye-reset-observed:u'),null);
});
test('reset pauses the queued sync immediately; no stale writes are replayed',async()=>{
 let durable=[],commits=0;
 const sync=createProjectSync({load:async()=>durable,
   write:async rows=>{durable=structuredClone(rows);},
   revision:()=>0,autoFlushDelayMs:120000,
   commit:async()=>{commits++;}});
 await sync.stage({id:'old-work'});
 sync.pause();
 await sync.flush();
 assert.equal(commits,0);
 assert.equal(durable.length,1);
});

test('an interrupted remote reset resumes deletion on login without starting a fresh reset',async()=>{
 const seen=[],statuses=[],queue=[
   {more:true,phase:'cos',cosDeleted:400},
   {more:true,phase:'supabase',supabaseDeleted:9},
   {reset:true,more:false,phase:'complete'}
 ];
 const client={auth:{getSession:async()=>({data:{session:{access_token:'mock-bearer'}},error:null})}};
 const fetchRequest=async(path,options)=>{
   assert.equal(path,'/api/account-reset');
   const body=JSON.parse(options.body);
   assert.equal(body.mode,'delete');
   assert.equal(body.resetId,'old-run');
   seen.push(body);
   return {ok:true,json:async()=>queue.shift()};
 };
 const result=await finishPendingAccountReset({
   client,resetId:'old-run',fetchRequest,onProgress:message=>statuses.push(message)
 });
 assert.equal(result.deleted,409);
 assert.equal(result.complete,true);
 assert.equal(seen.length,3);
 assert.equal(statuses.length,3);
});
