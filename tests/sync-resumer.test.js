import test from 'node:test';
import assert from 'node:assert/strict';
import {createSyncResumer} from '../src/sync-resumer.js';

test('failed background upload retries without blocking and resumes on reopen',async()=>{
  let calls=0,timer;
  const make=()=>createSyncResumer({flush:async()=>{calls++;if(calls<3)throw Error('offline');},setTimer:fn=>{timer=fn;return 1;},clearTimer:()=>{timer=null;}});
  const first=make();await first.wake();assert.equal(first.status().retryScheduled,true);first.stop();assert.equal(timer,null);
  const reopened=make();await reopened.wake();assert.equal(reopened.status().retryScheduled,true);timer();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(calls,3);assert.equal(reopened.status().retryScheduled,false);
});

test('version conflict is retained for review, never replayed automatically',async()=>{
  let calls=0,timer,reported;
  const resume=createSyncResumer({flush:async()=>{calls++;throw Error('云端版本已变化');},onError:error=>reported=error,setTimer:fn=>{timer=fn;return 1;}});
  await resume.wake();assert.equal(calls,1);assert.match(reported.message,/版本/);assert.equal(timer,undefined);assert.equal(resume.status().retryScheduled,false);
});
test('sync detail inspection pauses scheduled retries and resumes after closing',async()=>{
  let calls=0,timer;
  const resume=createSyncResumer({flush:async()=>{calls++;if(calls===1)throw Error('offline');},setTimer:fn=>{timer=fn;return 1;},clearTimer:()=>{timer=null;}});
  await resume.wake();assert.equal(resume.status().retryScheduled,true);
  resume.suspend();assert.equal(resume.status().retryScheduled,false);assert.equal(resume.status().suspended,true);
  await resume.wake();assert.equal(calls,1);
  await resume.resume();assert.equal(calls,2);assert.equal(resume.status().suspended,false);
});

test('a wake during an upload schedules one more flush for newly staged edits',async()=>{
  let release,calls=0;
  const resumer=createSyncResumer({flush:async()=>{calls++;if(calls===1)await new Promise(resolve=>{release=resolve;});}});
  const first=resumer.wake();
  await new Promise(resolve=>setTimeout(resolve,0));
  resumer.wake();resumer.wake();
  release();await first;
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(calls,2);
  resumer.stop();
});


test('focus wake respects a scheduled retry after failure',async()=>{
  let calls=0,timer;
  const resume=createSyncResumer({flush:async()=>{calls++;if(calls===1)throw Error('upload failed');},
    setTimer:fn=>{timer=fn;return 1;},clearTimer:()=>{timer=null;}});
  await resume.wake();
  await resume.wake();await resume.wake();
  assert.equal(calls,1);
  timer();await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(calls,2);
  resume.stop();
});
