import test from 'node:test';
import assert from 'node:assert/strict';
import {groupInstancesByCarrier,validCarrierLink,carrierGroupingSummary} from '../src/carrier-grouping.js';

const c=(x,y,w,h)=>({x,y,w,h,pixels:Math.round(w*h*100000),edgeMethod:'instance-connected-component'});
const good=(a,b,extra={})=>({a,b,confidence:.90,edgeSupport:.44,seedCoverage:.94,pageLeak:.05,carrierAreaRatio:1.8,...extra});

test('carrier grouping disabled preserves every visual instance',()=>{
  const instances=[c(.10,.10,.20,.20),c(.35,.12,.08,.08),c(.60,.50,.18,.22)];
  const groups=groupInstancesByCarrier(instances,[good(0,1)],{enabled:false});
  assert.equal(groups.length,3);
  assert.ok(groups.every(g=>!g.grouped&&g.members.length===1));
});

test('carrier grouping enabled joins only instances with strong shared-carrier evidence',()=>{
  const instances=[c(.10,.10,.20,.20),c(.35,.12,.08,.08),c(.60,.50,.18,.22)];
  const groups=groupInstancesByCarrier(instances,[good(0,1)],{enabled:true});
  assert.equal(groups.length,2);
  const merged=groups.find(g=>g.grouped);
  assert.deepEqual(merged.members,[0,1]);
  assert.equal(merged.carrierLinkCount,1);
  assert.ok(merged.x<=.100001&&merged.x+merged.w>=.429999);
});

test('page-leaking or weak edge carrier evidence never changes material identity',()=>{
  const instances=[c(.10,.10,.20,.20),c(.35,.12,.08,.08)];
  assert.equal(validCarrierLink(good(0,1,{pageLeak:.32})),false);
  assert.equal(validCarrierLink(good(0,1,{edgeSupport:.12})),false);
  assert.equal(validCarrierLink(good(0,1,{seedCoverage:.60})),false);
  assert.equal(groupInstancesByCarrier(instances,[good(0,1,{pageLeak:.32})],{enabled:true}).length,2);
});

test('carrier grouping can join a chain while retaining reversible member identities',()=>{
  const instances=[c(.10,.10,.08,.12),c(.18,.10,.07,.08),c(.24,.12,.06,.10),c(.70,.70,.12,.12)];
  const groups=groupInstancesByCarrier(instances,[good(0,1),good(1,2)],{enabled:true});
  assert.equal(groups.length,2);
  const merged=groups.find(g=>g.grouped);assert.deepEqual(merged.members,[0,1,2]);
  const summary=carrierGroupingSummary(groups);
  assert.deepEqual({visualInstances:summary.visualInstances,outputMaterials:summary.outputMaterials,groupedMaterials:summary.groupedMaterials},{visualInstances:4,outputMaterials:2,groupedMaterials:1});
});
