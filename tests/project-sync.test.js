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
  await assert.rejects(reopened.flush(),/云端版本已变化/);assert.equal(calls,0);assert.equal((await reopened.pending())[0].record.title,'unsent');
});
test('local successful transactions advance pending base revisions without discarding them',async()=>{
  let rows=[{record:{id:'a'},serial:1,baseRevision:2}],revision=3;
  const q=createProjectSync({load:async()=>rows,write:async value=>{rows=value;},revision:()=>revision,commit:async()=>{revision++;}});
  await q.advance(2,3);assert.equal(rows[0].baseRevision,3);await q.flush();assert.deepEqual(rows,[]);
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
