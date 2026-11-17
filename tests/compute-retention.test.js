import test from 'node:test';
import assert from 'node:assert/strict';
import {COMPUTE_RETENTION_HOURS,computeObjectNames,sweepComputeJobs} from '../compute-server/retention.mjs';

const id='11111111-1111-4111-8111-111111111111',user_id='2111845279800434690';
const prefix=`${user_id}/compute/${id}/`;
const job={id,user_id,status:'completed',input_path:prefix+'input.png',
  result_path:prefix+'result.json',updated_at:'2026-11-16T00:00:00.000Z'};

test('compute retention only accepts exact owner-scoped scratch paths',()=>{
 assert.deepEqual(computeObjectNames(job,{version:2,objects:[]}),
   [prefix+'input.png',prefix+'result.json']);
 assert.deepEqual(computeObjectNames(job,{version:1,objects:[{file:'material-001.png'}]}),
   [prefix+'input.png',prefix+'material-001.png',prefix+'result.json']);
 assert.throws(()=>computeObjectNames({...job,input_path:user_id+'/assets/input.png'},
   {version:2,objects:[]}));
 assert.throws(()=>computeObjectNames({...job,status:'running'},
   {version:2,objects:[]}));
 assert.throws(()=>computeObjectNames(job,{version:1,objects:[{file:'../../asset.png'}]}));
});

test('expired terminal job cleans objects before conditional metadata deletion',async()=>{
 const calls=[],now=Date.parse('2026-11-17T00:00:00.000Z');
 const result=await sweepComputeJobs({now,list:async(cutoff,limit)=>{
   assert.equal(limit,40);assert.equal(COMPUTE_RETENTION_HOURS,0);
   assert.equal(cutoff,'2026-11-17T00:00:00.000Z');return [job];},
   readManifest:async name=>{calls.push(['manifest',name]);return {version:2,objects:[]};},
   removeObject:async name=>calls.push(['delete',name]),
   removeJob:async(jobID,cutoff)=>{calls.push(['row',jobID,cutoff]);return true;}});
 assert.equal(result.deleted,1);assert.equal(result.failed,0);
 assert.deepEqual(calls.map(row=>row[0]),['manifest','delete','delete','row']);
});

test('failed object removal retains metadata so cleanup can retry',async()=>{
 let removed=false;
 const result=await sweepComputeJobs({now:Date.parse('2026-11-17T00:00:00Z'),
   list:async()=>[job],readManifest:async()=>({version:2,objects:[]}),
   removeObject:async()=>{throw Error('storage unavailable');},
   removeJob:async()=>{removed=true;return true;}});
 assert.equal(result.failed,1);assert.equal(result.deleted,0);assert.equal(removed,false);
});
