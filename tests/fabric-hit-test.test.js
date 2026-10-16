import test from 'node:test';
import assert from 'node:assert/strict';
import {selectableFabricObjectAt} from '../src/fabric-hit-test.js';
const rect=(x,y,w,h)=>({containsPoint:p=>p.x>=x&&p.x<=x+w&&p.y>=y&&p.y<=y+h});
test('unselected nested group hits member frame union, not gaps or hidden members',()=>{
  const group={sceneType:'group',...rect(0,0,100,100),getObjects:()=>[
    rect(0,0,20,20),{sceneType:'group',getObjects:()=>[rect(80,80,20,20)]},
    {...rect(40,40,20,20),visible:false}]};
  assert.equal(selectableFabricObjectAt({},group,{x:10,y:10}),true);
  assert.equal(selectableFabricObjectAt({},group,{x:90,y:90}),true);
  assert.equal(selectableFabricObjectAt({},group,{x:50,y:50}),false);
  assert.equal(selectableFabricObjectAt({},group,{x:30,y:30}),false);
});
