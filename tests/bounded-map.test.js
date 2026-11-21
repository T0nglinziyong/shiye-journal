import test from 'node:test';
import assert from 'node:assert/strict';
import {boundedMap} from '../src/bounded-map.js';

test('two tasks overlap, results retain input order and concurrency stays bounded',async()=>{
  let active=0,peak=0;
  const values=await boundedMap([0,1,2,3,4],2,async value=>{
    active++;peak=Math.max(peak,active);
    await new Promise(resolve=>setTimeout(resolve,value%2?1:3));
    active--;return value*2;
  });
  assert.equal(peak,2);
  assert.deepEqual(values,[0,2,4,6,8]);
});

test('a failed task waits for already started work before caller cleanup',async()=>{
  let active=0;
  await assert.rejects(boundedMap([0,1],2,async value=>{
    active++;
    try{
      if(value===0)throw Error('failed');
      await new Promise(resolve=>setTimeout(resolve,5));
    }finally{active--;}
  }),/failed/);
  assert.equal(active,0);
});
