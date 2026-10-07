import test from 'node:test';
import assert from 'node:assert/strict';
import {attachBoundaryHints,selectBoundaryHint} from '../src/recognition-boundary-hints.js';

const c=(x,y,w,h,extra={})=>({x,y,w,h,...extra});
const good=(x,y,w,h,extra={})=>c(x,y,w,h,{
  edgeMethod:'edge-enclosure',paperContactRatio:.94,interiorBackgroundRatio:.06,
  fillRatio:.82,rectFill:.91,structuralConfidence:.78,...extra
});

test('one-to-one hint selects a supported boundary for one identity',()=>{
  const a=c(.10,.10,.25,.30),b=c(.60,.10,.22,.30);
  const hint=good(.09,.09,.27,.32);
  const best=selectBoundaryHint(a,[a,b],[hint],0);
  assert.ok(best);assert.equal(best.candidate,hint);
  const out=attachBoundaryHints([a,b],[hint]);
  assert.equal(out.length,2);
  assert.equal(out[0].boundaryHint,'edge-enclosure');
  assert.equal(out[1].boundaryHint,null);
});

test('boundary hint cannot wrap two identities',()=>{
  const a=c(.10,.10,.24,.30),b=c(.38,.10,.24,.30);
  const wrapper=good(.08,.08,.58,.34,{fillRatio:.72,rectFill:.75});
  assert.equal(selectBoundaryHint(a,[a,b],[wrapper],0),null);
  assert.equal(selectBoundaryHint(b,[a,b],[wrapper],1),null);
  const out=attachBoundaryHints([a,b],[wrapper]);
  assert.equal(out.length,2);
  assert.ok(out.every(x=>x.boundaryHint===null));
});

test('weak page-facing geometry is not allowed to replace an identity mask',()=>{
  const a=c(.20,.20,.30,.30);
  const weak=c(.19,.19,.32,.32,{
    paperContactRatio:.93,interiorBackgroundRatio:.34,
    fillRatio:.48,rectFill:.63,structuralConfidence:.9
  });
  assert.equal(selectBoundaryHint(a,[a],[weak],0),null);
});

test('attaching a hint preserves identity and content metadata',()=>{
  const contentMask={width:4,height:4,alpha:new Uint8Array(16).fill(1)};
  const a=c(.20,.20,.28,.28,{
    pixels:2500,instanceMethod:'connected-component',identityFillRatio:.57,
    touchesProtectedFrame:true,absorbedFragments:2,contentMask,
    recognitionConfidence:.71,mask:{source:'identity'}
  });
  const hint=good(.19,.19,.30,.30,{mask:{source:'boundary'}});
  const [out]=attachBoundaryHints([a],[hint]);
  assert.equal(out.mask.source,'boundary');
  assert.equal(out.contentMask,contentMask);
  assert.equal(out.identityFillRatio,.57);
  assert.equal(out.identityPixels,2500);
  assert.equal(out.touchesProtectedFrame,true);
  assert.equal(out.absorbedFragments,2);
  assert.equal(out.identityRecognitionConfidence,.71);
});
