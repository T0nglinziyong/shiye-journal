import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveCreationPlace} from '../src/creation-placement.js';

const page={canvas:{width:2000,height:1000},physicalPageHeightMM:100,pageMode:'spread',layers:[
 {id:'ticket',type:'shape',x:500,y:500,width:400,height:200,rotation:90}
]};

test('public mm and ratio positions resolve to the same Scene centre',()=>{
 const mm=resolveCreationPlace(page,{reference:'page.right',at:[25,50],unit:'mm'},{widthMm:20,heightMm:10});
 const ratio=resolveCreationPlace(page,{reference:'page.right',at:[.25,.5],unit:'ratio'},{widthMm:20,heightMm:10});
 assert.deepEqual(mm,ratio);
 assert.deepEqual(mm,{x:1250,y:500,rotation:0});
});

test('a rotated reference uses its own axes and target anchor',()=>{
 const p=resolveCreationPlace(page,{reference:'node:ticket',referenceAnchor:'top-center',anchor:'bottom-center',offset:{value:[0,-5],unit:'mm'}},{widthMm:20,heightMm:10});
 assert.ok(Math.abs(p.x-650)<1e-8);
 assert.ok(Math.abs(p.y-450)<1e-8);
});

test('linked positioning resolves through the same geometry while unsupported visible bounds still fail',()=>{
 assert.deepEqual(resolveCreationPlace(page,{reference:'page',at:[.5,.5],unit:'ratio',behavior:'linked'},{widthMm:10,heightMm:10}),resolveCreationPlace(page,{reference:'page',at:[.5,.5],unit:'ratio'},{widthMm:10,heightMm:10}));
 assert.throws(()=>resolveCreationPlace(page,{reference:'page',at:[.5,.5],unit:'ratio',referenceBounds:'visible'},{widthMm:10,heightMm:10}),/visible/);
});
