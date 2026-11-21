import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareUploadJobs} from '../src/upload-preparation.js';
test('a slow or failed image does not prevent later independent files from using free slots',async()=>{
  let release;const blocked=new Promise(resolve=>release=resolve),started=[];
  const jobs=Array.from({length:6},(_,i)=>({operationID:String(i)}));
  const done=prepareUploadJobs(jobs,async job=>{
    started.push(job.operationID);
    if(job.operationID==='0')await blocked;
    if(job.operationID==='1')throw Error('one file failed');
  },{limit:2});
  for(let i=0;i<15;i++)await Promise.resolve();
  assert.deepEqual(started,['0','1','2','3','4','5']);
  release();const failures=await done;
  assert.deepEqual([...failures.keys()],['1']);
});
