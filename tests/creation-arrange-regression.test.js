import test from 'node:test';
import assert from 'node:assert/strict';
import {arrangeCreationNodes} from '../src/creation-arrange.js';
import {worldBox,rigidMatrix} from '../src/scene-spatial.js';
const shape=(id,width=60,rotation=0)=>({id,type:'shape',x:0,y:0,width,height:40,rotation});
const page=()=>({canvas:{width:1000,height:1000},physicalPageHeightMM:200,layers:[shape('a'),shape('b',80),shape('c',60,20)]});
for(const direction of ['horizontal','vertical','grid'])test(`arrange ${direction} is stable and preserves dimensions`,()=>{
 const p=page(),rule={direction,gapMm:4,...(direction==='grid'?{columns:2}:{})};
 arrangeCreationNodes(p,['a','b','c'],rule,'page');const first=JSON.stringify(p);
 arrangeCreationNodes(p,['a','b','c'],rule,'page');assert.equal(JSON.stringify(p),first);
 assert.equal(p.layers[1].width,80);assert.ok(Math.abs(worldBox(p,'c').rotation-20)<1e-8);
});
test('arrange works in a rotated local parent and refuses overflow without resizing',()=>{
 const p=page();p.layers=[{id:'group',type:'group',localTransform:rigidMatrix(400,400,30),layoutBox:{width:500,height:300},children:p.layers}];
 arrangeCreationNodes(p,['a','b','c'],{direction:'horizontal',gapMm:4},'parent');
 assert.ok(worldBox(p,'b').cx>worldBox(p,'a').cx);
 const before=JSON.stringify(p);
 assert.throws(()=>arrangeCreationNodes(p,['a','b','c'],{direction:'horizontal',gapMm:1000},'parent'),/超出/);
 assert.equal(JSON.stringify(p),before);
});
