import test from 'node:test';
import assert from 'node:assert/strict';
import {compileTwoHoleWeaves} from '../src/craft-display.js';
import {geometryArea} from '../src/craft-topology.js';

const rectangle=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
const scene=()=>{
 const strip={id:'strip',type:'material',x:100,y:100,width:200,height:20,rotation:0,zIndex:12};
 const target={id:'target',type:'material',x:100,y:100,width:200,height:100,rotation:0,zIndex:10,
  materialMask:{shape:'region',outer:rectangle(0,0,1,1),holes:[.2,.4,.6,.8].map(x=>rectangle(x-.035,.34,.07,.32))}};
 return {items:[strip,target]};
};
test('four physical openings produce two front projections of one strip',()=>{
 const draft=scene();
 compileTwoHoleWeaves(draft,[{piece:'strip',through:[0,1,2,3].map((hole,i)=>({target:'target',hole,sideAfter:i%2?'back':'front'}))}]);
 const strip=draft.items[0];
 assert.equal(strip.craftDisplaySlices.length,1);
 assert.ok(Math.abs(geometryArea(strip.craftDisplaySlices[0].geometryRatio)-.4)<.01);
 assert.equal(strip.zIndex,9);
});
test('nonalternating crossings are rejected',()=>{
 const draft=scene();
 assert.throws(()=>compileTwoHoleWeaves(draft,[{piece:'strip',through:[0,1].map(hole=>({target:'target',hole,sideAfter:'front'}))}]),/交替/);
});
