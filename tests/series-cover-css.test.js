import test from 'node:test';
import assert from 'node:assert/strict';
import {seriesCoverLayout} from '../src/series-cover-layout.js';

test('fan z-order is valid CSS for even and odd counts and matches the Canvas order',()=>{
 for(let count=1;count<=5;count++){
  const {slots}=seriesCoverLayout(count,'fan');
  for(const slot of slots)assert.ok(Number.isInteger(slot.z)&&slot.z>0,`count=${count}, z=${slot.z}`);
  if(count>=3){const middle=slots[Math.floor((count-1)/2)].z;assert.ok(middle>slots[0].z);assert.ok(middle>slots.at(-1).z);}
  assert.equal(slots[0].z,slots.at(-1).z);
 }
 assert.deepEqual(seriesCoverLayout(4,'fan').slots.map(slot=>slot.z),[3,4,4,3]);
});
