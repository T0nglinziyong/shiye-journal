import test from 'node:test';
import assert from 'node:assert/strict';
import {createJobLanePool} from '../compute-server/job-lane-pool.mjs';

const waitFor=async predicate=>{
  for(let i=0;i<100;i++){
    if(predicate())return;
    await new Promise(resolve=>setTimeout(resolve,2));
  }
  throw Error('任务通道未按时推进');
};

test('one notification starts one lane, and two jobs use both lanes without duplicate claims',async()=>{
  const claims=[],started=[],finished=[],errors=[],gates=new Map();
  let active=0,maxActive=0;
  const pool=createJobLanePool({slots:['gpu-0','gpu-1'],
    claim:async id=>{claims.push(id);return id?{id,failed_ids:[]}:null;},
    process:async(job,slot)=>{
      started.push([job.id,slot]);maxActive=Math.max(maxActive,++active);
      await new Promise(resolve=>gates.set(job.id,resolve));
      active--;finished.push(job.id);
    },
    notifyFailed:async()=>{},onError:error=>errors.push(error)});
  pool.hint('a');await waitFor(()=>started.length===1);
  assert.equal(claims.length,1);
  pool.hint('b');pool.hint('b');await waitFor(()=>started.length===2);
  pool.hint('c');
  assert.equal(maxActive,2);
  gates.get('a')();await waitFor(()=>started.length===3);
  gates.get('b')();gates.get('c')();
  await waitFor(()=>finished.length===3&&claims.includes(null));
  assert.deepEqual(started.map(row=>row[0]),['a','b','c']);
  assert.equal(claims.filter(id=>id==='b').length,1);
  assert.deepEqual(errors,[]);
  const count=claims.length;
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(claims.length,count);
});
