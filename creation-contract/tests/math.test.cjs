'use strict';
const assert=require('node:assert/strict');const m=require('../static/runtime/placement-math.cjs');
let passed=0;function test(name,fn){fn();passed++;console.log('PASS '+name);}
function near(a,b,e=1e-9){assert.equal(a.length,b.length);a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<=e,`${v} != ${b[i]} at ${i}`));}
const I=[1,0,0,1,0,0];
test('identity',()=>near(m.multiply(I,I),I));
test('composition-order',()=>near(m.multiply([1,0,0,1,10,20],[0,1,-1,0,0,0]),[0,1,-1,0,10,20]));
test('inverse',()=>near(m.multiply([0,1,-1,0,100,50],m.inverse([0,1,-1,0,100,50])),I));
test('singular-rejected',()=>assert.throws(()=>m.inverse([0,0,0,0,0,0]),/Non-invertible/));
test('nan-rejected',()=>assert.throws(()=>m.point([NaN,0,0,1,0,0],[0,0]),/finite/));
test('anchor-center',()=>near(m.anchor([10,20,30,40]),[25,40]));
test('anchor-bottom-right',()=>near(m.anchor([10,20,30,40],'bottom-right'),[40,60]));
test('negative-size-rejected',()=>assert.throws(()=>m.anchor([0,0,-1,10]),/positive/));
test('reparent-preserves-world',()=>{let world=[0,1,-1,0,80,90],parent=[0,-1,1,0,20,30];near(m.multiply(parent,m.reparent(world,parent)),world);});
test('rotated-bounds',()=>near(m.worldBounds([0,0,20,10],[0,1,-1,0,100,50]),[90,50,10,20]));
const base={referenceBox:[0,0,200,100],targetBox:[0,0,20,10]};
test('mm-center',()=>near(m.resolvePlacement({...base,place:{at:[100,50],unit:'mm'}}),[1,0,0,1,90,45]));
test('ratio-equivalence',()=>near(m.resolvePlacement({...base,place:{at:[.5,.5],unit:'ratio'}}),m.resolvePlacement({...base,place:{at:[100,50],unit:'mm'}})));
test('reference-origin',()=>near(m.resolvePlacement({...base,referenceBox:[10,20,200,100],place:{at:[.5,.5],unit:'ratio'}}),[1,0,0,1,100,65]));
test('relative-gap',()=>near(m.resolvePlacement({...base,referenceBox:[10,20,40,20],place:{referenceAnchor:'middle-right',anchor:'middle-left',offset:{value:[5,0],unit:'mm'}}}),[1,0,0,1,55,25]));
test('rotated-reference',()=>near(m.resolvePlacement({...base,referenceBox:[0,0,40,20],targetBox:[0,0,10,10],referenceToWorld:[0,1,-1,0,100,20],place:{at:[1,1],unit:'ratio',offset:{value:[5,0],unit:'mm'}}}),[1,0,0,1,75,60]));
test('page-axis-offset',()=>near(m.resolvePlacement({...base,referenceBox:[0,0,40,20],targetBox:[0,0,10,10],referenceToWorld:[0,1,-1,0,100,20],place:{at:[1,1],unit:'ratio',offset:{value:[5,0],unit:'mm',space:'page'}}}),[1,0,0,1,80,55]));
test('rotated-parent',()=>near(m.resolvePlacement({...base,parentToWorld:[0,1,-1,0,100,50],place:{at:[150,100],unit:'mm'}}),[1,0,0,1,40,-55]));
test('rotated-target-anchor',()=>near(m.resolvePlacement({...base,targetLinear:[0,1,-1,0],place:{at:[50,50],unit:'mm'}}),[0,1,-1,0,55,40]));
test('ratio-offset',()=>near(m.resolvePlacement({...base,place:{at:[0,0],unit:'mm',offset:{value:[.1,.2],unit:'ratio'}}}),[1,0,0,1,10,15]));
test('mixed-point-anchor-rejected',()=>assert.throws(()=>m.resolvePlacement({...base,place:{at:[0,0],unit:'mm',referenceAnchor:'center'}}),/mutually/));
test('nested-three-level-inverse',()=>{let p=m.multiply(m.multiply([0,1,-1,0,10,20],[1,0,0,1,30,40]),[0,-1,1,0,5,6]);near(m.multiply(p,m.reparent([1,0,0,1,100,200],p)),[1,0,0,1,100,200]);});
console.log(JSON.stringify({ok:true,passed,scope:'pure-affine-and-anchor-only',integrationTested:false}));
