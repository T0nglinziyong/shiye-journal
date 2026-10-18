import test from 'node:test';
import assert from 'node:assert/strict';
import {readCloudPages} from '../src/cloud-page-read.js';

test('an oversized cloud page retries with smaller stable offsets and returns every record once',async()=>{
  const records=Array.from({length:71},(_,id)=>({id})),calls=[];
  const result=await readCloudPages(async(offset,size)=>{
    calls.push([offset,size]);
    if(size>16)throw Object.assign(Error('Upstream response too large'),{status:502});
    return records.slice(offset,offset+size);
  },{initialSize:32});
  assert.deepEqual(result,records);
  assert.deepEqual(calls[0],[0,32]);
  assert.ok(calls.some(([offset,size])=>offset>0&&size===16));
});

test('an unrelated gateway error is surfaced without turning into an incomplete snapshot',async()=>{
  let calls=0;
  await assert.rejects(readCloudPages(async()=>{
    calls++;throw Object.assign(Error('offline'),{status:503});
  },{initialSize:32}),/offline/);
  assert.equal(calls,1);
});
