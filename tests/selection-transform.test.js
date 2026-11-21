import test from 'node:test';
import assert from 'node:assert/strict';
import {transformSelectedFrame,isObjectDeleteKey} from '../src/selection-transform.js';
const initial={x:100,y:100,width:80,height:40,rotation:0};
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-6,actual+' != '+expected);
test('bottom-right corner handles proportional scaling and rotation together',()=>{
 const from={x:180,y:140},to={x:200,y:160};
 const result=transformSelectedFrame(initial,'corner',from,to);
 near(result.width/initial.width,result.height/initial.height);
 assert.ok(result.rotation>0);
 near(result.x+result.width/2,140);near(result.y+result.height/2,120);
});
test('right-edge grip stretches width only and anchors the opposite side',()=>{
 const result=transformSelectedFrame(initial,'right',{x:180,y:120},{x:215,y:120});
 near(result.width,115);near(result.height,40);near(result.x,100);near(result.y,100);
});
test('upper-edge grip stretches height only and anchors bottom',()=>{
 const result=transformSelectedFrame(initial,'top',{x:140,y:100},{x:140,y:85});
 near(result.height,55);near(result.width,80);near(result.y,85);near(result.x,100);
});
test('rotated edge grip stretches along the local axis',()=>{
 const frame={x:100,y:100,width:60,height:80,rotation:90};
 const right=transformSelectedFrame(frame,'right',{x:130,y:180},{x:130,y:200});
 near(right.width,80);near(right.height,80);
});
test('delete keyboard respects focused text controls and modifiers',()=>{
 const input={closest:()=>({})},plain={closest:()=>null};
 assert.equal(isObjectDeleteKey({key:'Delete',target:plain}),true);
 assert.equal(isObjectDeleteKey({key:'Backspace',target:plain}),true);
 assert.equal(isObjectDeleteKey({key:'Delete',target:input}),false);
 assert.equal(isObjectDeleteKey({key:'Delete',target:plain,metaKey:true}),false);
 assert.equal(isObjectDeleteKey({key:'Delete',target:plain,isComposing:true}),false);
});
