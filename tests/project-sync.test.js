import test from 'node:test';
import assert from 'node:assert/strict';
import {createProjectSync} from '../src/project-sync.js';

test('reopened outbox recognizes an acknowledged import instead of replaying it',async()=>{
  let rows=[{record:{id:'batch',assets:[{id:'a'}]},serial:1,baseRevision:4}],calls=0;
  const sync=createProjectSync({load:async()=>rows,write:async next=>rows=structuredClone(next),commit:async()=>calls++,revision:()=>5,reconcile:async batch=>batch.id==='batch'?'committed':'conflict'});
  await sync.flush();assert.equal(calls,0);assert.deepEqual(rows,[]);
});
test('append-only import retries after an unrelated cloud revision',async()=>{
  let rows=[{record:{id:'batch',assets:[{id:'new'}]},serial:1,baseRevision:4}],calls=0;
  const sync=createProjectSync({load:async()=>rows,write:async next=>rows=structuredClone(next),commit:async()=>calls++,revision:()=>5,reconcile:async()=> 'rebase'});
  await sync.flush();assert.equal(calls,1);assert.deepEqual(rows,[]);
});
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
test('empty sync reports its idle transition after the network promise settles',async()=>{
  const statuses=[];
  let sync;
  sync=createProjectSync({load:async()=>[],write:async()=>{},commit:async()=>{},
    revision:()=>0,onStatus:()=>statuses.push(sync.status())});
  await sync.flush();
  assert.equal(sync.status().uploading,false);
  assert.equal(statuses.at(-1).uploading,false);
  assert.equal(statuses.at(-1).pending,0);
});
test('targeted pending inspection returns an isolated match without copying unrelated imports',async()=>{
  const rows=[{record:{id:'batch-a',kind:'batch',payload:{operations:[{store:'blobs',action:'put',item:{id:'a',data:new Blob(['a'])}}]}},serial:1,baseRevision:0},
    {record:{id:'batch-b',kind:'batch',payload:{operations:[{store:'blobs',action:'put',item:{id:'b',data:new Blob(['b'])}}]}},serial:2,baseRevision:0}];
  const sync=createProjectSync({load:async()=>rows,write:async()=>{},commit:async()=>{},revision:()=>0});
  let visited=0;
  const found=await sync.inspectPending(entries=>{for(const row of entries){visited++;if(row.record.id==='batch-b')return row.record.payload.operations[0].item;}return null;});
  assert.equal(visited,2);assert.equal(found.id,'b');found.id='changed';
  assert.equal((await sync.pending())[1].record.payload.operations[0].item.id,'b');
});
test('project edits are durably staged before slow cloud commits, and newer edits are retained',async()=>{
  let rows=[],revision=0;const gate=defer(),commits=[];
  const q=createProjectSync({load:async()=>rows,write:async value=>{rows=structuredClone(value);},revision:()=>revision,commit:async record=>{commits.push(record.title);if(commits.length===1)await gate.promise;revision++;}});
  await q.stage({id:'a',title:'first'});assert.equal(rows[0].record.title,'first');
  await q.stage({id:'a',title:'second'});assert.equal(rows[0].record.title,'second');
  gate.resolve();await q.flush();assert.equal(commits.at(-1),'second');assert.deepEqual(rows,[]);
});
test('failed network edits survive reload and cannot silently overwrite a different cloud version',async()=>{
  let rows=[],revision=3;const q=createProjectSync({load:async()=>rows,write:async value=>{rows=value;},revision:()=>revision,commit:async()=>{throw Error('offline');}});
  await q.stage({id:'a',title:'unsent'});await assert.rejects(q.flush(),/offline/);assert.equal(rows[0].record.title,'unsent');
  let calls=0;revision=4;const reopened=createProjectSync({load:async()=>rows,write:async value=>{rows=value;},revision:()=>revision,commit:async()=>{calls++;}});
  await reopened.flush();assert.equal(reopened.status().conflicts,1);assert.equal(reopened.status().error,null);assert.equal(calls,0);assert.equal((await reopened.pending())[0].record.title,'unsent');
});
test('database rejection keeps its error code and the durable row',async()=>{
  let rows=[],commits=0;
  const sync=createProjectSync({load:async()=>rows,write:async next=>rows=structuredClone(next),
    revision:()=>2019,reconcile:async()=> 'rebase',commit:async()=>{
      commits++;const error=Error('此对象已被删除');error.code='P0001';throw error;
    }});
  await sync.stage({id:'delete-batch'});
  await assert.rejects(sync.flush(),error=>error.code==='P0001'&&/已被删除/.test(error.message));
  assert.equal(commits,1);
  assert.deepEqual(rows.map(row=>row.record.id),['delete-batch']);
});
test('local successful transactions advance pending base revisions without discarding them',async()=>{
  let rows=[{record:{id:'a'},serial:1,baseRevision:2}],revision=3;
  const q=createProjectSync({load:async()=>rows,write:async value=>{rows=value;},revision:()=>revision,commit:async()=>{revision++;}});
  await q.advance(2,3,[{store:'assets',action:'put',item:{id:'other'}}]);assert.equal(rows[0].baseRevision,3);await q.flush();assert.deepEqual(rows,[]);
});
test('D-03: a local transaction touching the same document does not blindly advance a pending edit',async()=>{
  let rows=[{record:{id:'a'},serial:1,baseRevision:2}];
  const q=createProjectSync({load:async()=>rows,write:async value=>{rows=value;},revision:()=>3,commit:async()=>{}});
  await q.advance(2,3,[{store:'projects',action:'put',item:{id:'a'}}]);
  assert.equal(rows[0].baseRevision,2);
  await q.advance(2,3,[{store:'assets',action:'put',item:{id:'other'}}]);
  assert.equal(rows[0].baseRevision,3);
});
test('failed durable staging never reports a cloud commit',async()=>{
  let calls=0;const q=createProjectSync({load:async()=>[],write:async()=>{throw Error('quota');},revision:()=>0,commit:async()=>{calls++;}});
  await assert.rejects(q.stage({id:'a'}),/quota/);assert.equal(calls,0);assert.deepEqual(await q.pending(),[]);
});
test('failed local acknowledgement remains pending and can be reconciled without another write',async()=>{
  let rows=[],revision=0,writes=0,commits=0,diskFull=true;
  const sync=createProjectSync({load:async()=>rows,write:async next=>{if(++writes>=2&&diskFull)throw Error('disk full');rows=structuredClone(next);},revision:()=>revision,commit:async()=>{commits++;revision++;},reconcile:async()=> 'committed'});
  await sync.stage({id:'work',title:'saved'});
  await assert.rejects(sync.flush(),/disk full/);
  assert.equal(sync.status().pending,1);
  diskFull=false;
  await sync.flush();
  assert.equal(commits,1);assert.deepEqual(rows,[]);
});
test('a newer edit survives the older edit losing its acknowledgement',async()=>{
  let rows=[],revision=0;const gate=defer(),started=defer(),commits=[];
  const sync=createProjectSync({load:async()=>rows,write:async next=>rows=structuredClone(next),revision:()=>revision,
    commit:async record=>{commits.push(record.title);if(record.title==='first'){started.resolve();await gate.promise;revision++;throw Error('reply lost');}revision++;},
    reconcile:async record=>record.title==='first'?'committed':'conflict'});
  await sync.stage({id:'work',title:'first'});
  await started.promise;
  await sync.stage({id:'work',title:'second'});
  gate.resolve();await sync.flush();
  assert.deepEqual(commits,['first','second']);assert.deepEqual(rows,[]);
});
test('discard removes only idle local outbox entries and leaves committed cloud data untouched',async()=>{
  let rows=[{record:{id:'local',title:'draft'},serial:1,baseRevision:2}],commits=0;
  const sync=createProjectSync({load:async()=>rows,write:async next=>rows=structuredClone(next),revision:()=>2,commit:async()=>{commits++;}});
  assert.equal((await sync.pending()).length,1);
  assert.equal(await sync.discard(),1);
  assert.deepEqual(rows,[]);assert.equal(commits,0);
});
test('discard refuses an in-flight cloud request',async()=>{
  let rows=[{record:{id:'local'},serial:1,baseRevision:2}],release;
  const waiting=new Promise(resolve=>release=resolve);
  const sync=createProjectSync({load:async()=>rows,write:async next=>rows=structuredClone(next),revision:()=>2,commit:async()=>waiting});
  const flushing=sync.flush();await new Promise(resolve=>setTimeout(resolve,0));
  await assert.rejects(sync.discard(),/上传正在进行/);assert.equal(rows.length,1);
  release();await flushing;
});
test('transient outbox load failure can recover in the same session',async()=>{
  const rows=[{record:{id:'draft',title:'preserved'},serial:1,baseRevision:2}];
  let reads=0,commits=0,revision=2;
  const sync=createProjectSync({
    load:async()=>{if(++reads===1)throw Error('temporary IndexedDB read failure');return rows;},
    write:async next=>{rows.splice(0,rows.length,...structuredClone(next));},
    revision:()=>revision,
    commit:async()=>{commits++;revision++;},
  });
  await assert.rejects(sync.flush(),/temporary IndexedDB read failure/);
  await sync.flush();
  assert.equal(reads,4,'initial retry plus preupload and locked durable refreshes');
  assert.equal(commits,1);
  assert.deepEqual(rows,[]);
});

test('background sync refreshes durable rows after acquiring the cross-tab lease',async()=>{
  let disk=[],revision=0,leaseHeld=false,commits=[];
  const withLease=async fn=>{leaseHeld=true;return fn();};
  const make=()=>createProjectSync({
    load:async()=>structuredClone(disk),
    write:async rows=>{const old=new Map(disk.map(row=>[row.record.id,row]));
      for(const row of rows)old.set(row.record.id,structuredClone(row));
      // The fixture intentionally models durable rows added by other tabs.
      disk=[...old.values()];
    },
    commit:async record=>{assert.equal(leaseHeld,true);commits.push(record.id);revision++;disk=disk.filter(row=>row.record.id!==record.id);},
    revision:()=>revision,runExclusive:withLease
  });
  // Start tab B before tab A adds a queued item.
  const tabB=make();await tabB.pending();
  disk.push({serial:1,baseRevision:0,operationID:'other',record:{id:'from-other-tab'}});
  await tabB.flush();
  assert.deepEqual(commits,['from-other-tab']);
});


test('stale edited project is saved under a new ID without overwriting cloud original',async()=>{
  let revision=990,rows=[{record:{id:'original',title:'my offline draft'},serial:1,baseRevision:600,operationID:'op'}];
  const committed=[];
  const sync=createProjectSync({
    load:async()=>structuredClone(rows),reload:async()=>structuredClone(rows),
    write:async next=>{rows=structuredClone(next);},revision:()=>revision,
    reconcile:async()=> 'conflict',
    onConflict:async record=>({...record,id:'safe-copy',title:record.title+'（同步冲突副本）'}),
    commit:async record=>{committed.push(record);revision++;}
  });
  await sync.flush();
  assert.deepEqual(committed.map(r=>r.id),['safe-copy']);
  assert.equal(committed[0].title,'my offline draft（同步冲突副本）');
  assert.equal(rows.length,0);
});
test('unresolved change cannot stop independent later queued changes',async()=>{
  let revision=990,rows=[
    {record:{id:'conflict'},serial:1,baseRevision:600,operationID:'stuck'},
    {record:{id:'safe'},serial:2,baseRevision:600,operationID:'independent'}
  ];
  const uploaded=[];
  const sync=createProjectSync({
    load:async()=>structuredClone(rows),reload:async()=>structuredClone(rows),
    write:async next=>{rows=structuredClone(next);},revision:()=>revision,
    reconcile:async record=>record.id==='safe'?'rebase':'conflict',
    commit:async record=>{uploaded.push(record.id);revision++;}
  });
  await sync.flush();
  assert.deepEqual(uploaded,['safe']);
  assert.deepEqual(rows.map(row=>row.record.id),['conflict']);
  assert.equal(sync.status().conflicts,1);
  assert.equal(sync.status().error,null);
});

test('failed upload retains its row while independent queued records commit',async()=>{
  let revision=0,fail=true;
  let rows=[
    {record:{id:'broken',key:'shared'},serial:1,baseRevision:0,operationID:'broken-op'},
    {record:{id:'dependent',key:'shared'},serial:2,baseRevision:0,operationID:'dependent-op'},
    {record:{id:'independent',key:'other'},serial:3,baseRevision:0,operationID:'other-op'}
  ];
  const committed=[];
  const sync=createProjectSync({
    load:async()=>structuredClone(rows),reload:async()=>structuredClone(rows),
    write:async next=>{rows=structuredClone(next);},revision:()=>revision,
    recordKeys:record=>[{store:'assets',id:record.key}],
    reconcile:async()=> 'rebase',
    commit:async record=>{
      if(record.id==='broken'&&fail)throw Error('object upload failed');
      committed.push(record.id);revision++;
    }
  });
  await assert.rejects(sync.flush(),/未获确认/);
  assert.deepEqual(committed,['independent']);
  assert.deepEqual(rows.map(row=>row.record.id),['broken','dependent']);
  assert.equal(sync.status().conflicts,0);
  fail=false;
  await sync.flush();
  assert.deepEqual(committed,['independent','broken','dependent']);
  assert.deepEqual(rows,[]);
});

test('unchanged remote revision is an unconfirmed upload, not a conflict',async()=>{
  let rows=[];
  const sync=createProjectSync({load:async()=>rows,reload:async()=>structuredClone(rows),
    write:async next=>{rows=structuredClone(next);},revision:()=>7,
    commit:async()=>{throw Error('conflict');},reconcile:async()=> 'rebase'});
  await sync.stage({id:'draft'});
  await assert.rejects(sync.flush(),/云端版本未变化/);
  assert.equal(sync.status().conflicts,0);
  assert.equal(rows.length,1);
});

test('diagnostic callback observes a blocked row and subsequent safe commit without payloads',async()=>{
  let revision=3,rows=[
    {record:{id:'first',kind:'project',payload:{id:'private-work'}},serial:1,baseRevision:2,operationID:'one'},
    {record:{id:'second',kind:'batch',payload:{operations:[]}},serial:2,baseRevision:2,operationID:'two'}
  ];
  const events=[];
  const sync=createProjectSync({load:async()=>rows,reload:async()=>structuredClone(rows),
    write:async next=>{rows=structuredClone(next);},revision:()=>revision,
    reconcile:async record=>record.id==='first'?'conflict':'rebase',
    commit:async()=>{revision++;},onDiagnostic:event=>events.push(event)});
  await sync.flush();
  assert.ok(events.some(event=>event.action==='conflict'&&event.kind==='project'));
  assert.ok(events.some(event=>event.action==='committed'&&event.kind==='batch'));
  assert.ok(events.every(event=>!JSON.stringify(event).includes('private-work')));
});


test('durably staged deletion can retire older unsent saves for the same work only',async()=>{
  let rows=[
    {record:{id:'deleted',title:'old editor state'},serial:1,baseRevision:5,operationID:'old'},
    {record:{id:'untouched',title:'other editor state'},serial:2,baseRevision:5,operationID:'other'}
  ];
  const sync=createProjectSync({load:async()=>rows,reload:async()=>structuredClone(rows),
    write:async next=>{rows=structuredClone(next);},revision:()=>5,commit:async()=>{}});
  assert.equal(await sync.cancelPendingFor(['deleted']),1);
  assert.deepEqual(rows.map(row=>row.record.id),['untouched']);
});


test('editor edits are locally staged but cloud commits are coalesced every 10 seconds',async()=>{
  let time=0,nextTimerID=0,revision=5,rows=[],commits=[];
  const timers=new Map();
  const setTimer=(fn,delay)=>{const id=++nextTimerID;timers.set(id,{fn,at:time+delay});return id;};
  const clearTimer=id=>timers.delete(id);
  const advance=async(to)=>{
    time=to;
    for(const [id,timer] of [...timers]){
      if(timer.at<=time){timers.delete(id);timer.fn();}
    }
    for(let i=0;i<20;i++)await Promise.resolve();
  };
  const sync=createProjectSync({
    load:async()=>structuredClone(rows),reload:async()=>structuredClone(rows),
    write:async next=>{rows=structuredClone(next);},
    revision:()=>revision,
    commit:async record=>{commits.push({...record,time});revision++;},
    autoFlushDelayMs:10000,clock:()=>time,setTimer,clearTimer
  });
  await sync.stage({id:'draft',title:'first'});
  assert.equal(rows[0].record.title,'first','local IndexedDB outbox is saved before return');
  await advance(9000);
  await sync.stage({id:'draft',title:'latest'});
  assert.equal(commits.length,0,'no network write for each small operation');
  await advance(10000);
  assert.deepEqual(commits.map(x=>x.title),['latest']);
  await sync.stage({id:'draft',title:'after-upload'});
  await advance(15000);
  assert.equal(commits.length,1);
  await sync.flush();
  assert.deepEqual(commits.map(x=>x.title),['latest','after-upload'],'manual sync skips automatic interval');
  assert.deepEqual(rows,[]);
});
test('background wake-up schedules queued changes rather than forcing a cloud write',async()=>{
  let time=0,timers=[],rows=[],commits=0,revision=7;
  const sync=createProjectSync({
    load:async()=>structuredClone(rows),reload:async()=>structuredClone(rows),
    write:async next=>{rows=structuredClone(next);},
    revision:()=>revision,commit:async()=>{commits++;revision++;},
    autoFlushDelayMs:10000,clock:()=>time,
    setTimer:(fn,delay)=>{timers.push({fn,delay});return timers.length;},
    clearTimer:()=>{}
  });
  await sync.stage({id:'work',title:'change'});
  await sync.resumeScheduled();
  assert.equal(commits,0);
  assert.equal(timers.length,1);
  assert.ok(timers[0].delay>=10000);
});


test('edits arriving mid-upload wait for the next cloud window',async()=>{
  let time=0,revision=0,rows=[],id=0;
  const timers=new Map(),writes=[];
  let started,release;
  const opened=new Promise(resolve=>started=resolve),pending=new Promise(resolve=>release=resolve);
  const queue=createProjectSync({
    load:async()=>structuredClone(rows),reload:async()=>structuredClone(rows),
    write:async next=>{rows=structuredClone(next);},
    revision:()=>revision,clock:()=>time,autoFlushDelayMs:10000,
    setTimer:(fn,delay)=>{timers.set(++id,{fn,at:time+delay});return id;},
    clearTimer:i=>timers.delete(i),
    commit:async record=>{
      writes.push({title:record.title,time});
      if(writes.length===1){started();await pending;}
      revision++;
    }
  });
  await queue.stage({id:'work',title:'first'});
  time=10000;
  for(const [key,task] of [...timers])if(task.at<=time){timers.delete(key);task.fn();}
  await opened;
  await queue.stage({id:'work',title:'second'});
  release();
  for(let i=0;i<50;i++)await Promise.resolve();
  assert.deepEqual(writes.map(x=>x.title),['first']);
  assert.equal(rows[0].record.title,'second');
  time=20000;
  for(const [key,task] of [...timers])if(task.at<=time){timers.delete(key);task.fn();}
  for(let i=0;i<50;i++)await Promise.resolve();
  assert.deepEqual(writes,[{title:'first',time:10000},{title:'second',time:20000}]);
  assert.deepEqual(rows,[]);
});


test('newer cloud editor revision wins without creating a conflict copy',async()=>{
  let rows=[{serial:1,baseRevision:10,operationID:'pending',record:{
    id:'same-work',title:'older local edit',updatedAt:'2026-10-09T09:30:00Z'}}];
  const superseded=[],commits=[];
  const sync=createProjectSync({
    load:async()=>structuredClone(rows),reload:async()=>structuredClone(rows),
    write:async value=>{rows=structuredClone(value)},
    revision:()=>12,reconcile:async()=> 'remote',
    onSuperseded:record=>superseded.push(record.id),
    onConflict:async()=>{throw Error('No fork expected')},
    commit:async record=>commits.push(record.id)
  });
  await sync.flush();
  assert.deepEqual(commits,[]);
  assert.deepEqual(superseded,['same-work']);
  assert.deepEqual(rows,[]);
});
test('a multi-store mutation keeps newer operations and drops older ones',async()=>{
  let rows=[{serial:1,baseRevision:8,operationID:'batch-1',record:{
    id:'batch-1',names:['assets'],operations:[
      {action:'put',store:'assets',item:{id:'recent'},modifiedAt:'2026-10-09T11:00:00Z'},
      {action:'put',store:'assets',item:{id:'stale'},modifiedAt:'2026-10-09T10:00:00Z'}
    ]}}];
  const committed=[];
  const sync=createProjectSync({
    load:async()=>structuredClone(rows),reload:async()=>structuredClone(rows),
    write:async value=>{rows=structuredClone(value)},
    revision:()=>20,
    reconcile:async batch=>batch.operations.length===2?
      {kind:'replace',record:{...batch,operations:batch.operations.slice(0,1)}}:'rebase',
    commit:async batch=>committed.push(batch.operations.map(op=>op.item.id))
  });
  await sync.flush();
  assert.deepEqual(committed,[['recent']]);
  assert.deepEqual(rows,[]);
});

test('manual conflict choices preserve queue bytes until a reviewed serial is confirmed',async()=>{
 const clone=x=>structuredClone(x);
 for(const choice of ['cloud','local','both']){
  let rows=[],serverRevision=9;
  const sync=createProjectSync({
   load:async()=>clone(rows),reload:async()=>clone(rows),
   write:async next=>{rows=clone(next);},
   commit:async()=>{serverRevision++;},revision:()=>serverRevision,
   reconcile:async()=> 'conflict',autoFlushDelayMs:3600000
  });
  await sync.stage({id:'local-scene',title:'local words'},{baseRevision:2});
  const pending=(await sync.pending())[0];
  await assert.rejects(sync.resolvePending('local-scene',pending.serial+10,
    {record:{id:'lost-scene'},baseRevision:serverRevision}),/发生了新修改/);
  assert.equal(rows[0].record.title,'local words');
  const selected=choice==='cloud'?null:choice==='local'?{id:'local-scene',title:'local words'}:
    {id:'independent-copy',title:'both'};
  await sync.resolvePending('local-scene',pending.serial,
    {record:selected,baseRevision:serverRevision});
  const actual=await sync.pending();
  if(choice==='cloud')assert.deepEqual(actual,[]);
  else{assert.equal(actual.length,1);assert.equal(actual[0].record.id,selected.id);
    assert.equal(actual[0].baseRevision,9);}
  sync.pause();
 }
});


test('independent upload preparation runs before the shared account commit lock',async()=>{
  let revision=0,lease=Promise.resolve(),held=false,preparing=[];
  const gates=[];
  const runExclusive=fn=>{
    const task=lease.then(async()=>{held=true;try{return await fn();}finally{held=false;}});
    lease=task.catch(()=>{});return task;
  };
  const make=id=>{
    let rows=[];
    const gate=new Promise(resolve=>gates.push(resolve));
    return createProjectSync({load:async()=>structuredClone(rows),reload:async()=>structuredClone(rows),
      write:async next=>{rows=structuredClone(next);},revision:()=>revision,
      prepare:async()=>{assert.equal(held,false);preparing.push(id);await gate;},
      runExclusive,reconcile:async()=> 'rebase',commit:async()=>{assert.equal(held,true);revision++;}});
  };
  const a=make('a'),b=make('b');
  await a.stage({id:'a'});await b.stage({id:'b'});
  const first=a.flush(),second=b.flush();
  for(let i=0;i<100&&preparing.length<2;i++)await new Promise(resolve=>setTimeout(resolve,1));
  assert.deepEqual(preparing.sort(),['a','b']);
  assert.equal(held,false,'one slow immutable upload must not hold the revision lock');
  for(const release of gates)release();
  await Promise.all([first,second]);
  assert.equal(revision,2,'metadata commits remain serialized and versioned');
});
