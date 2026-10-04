import test from 'node:test';
import assert from 'node:assert/strict';
import {fuseRecognitionCandidates} from '../src/recognition-fusion.js';

const c=(x,y,w,h,extra={})=>({x,y,w,h,mask:{width:10,height:10,alpha:new Uint8Array(100).fill(255),polygons:[]},...extra});

test('internal printed boxes cannot become independent materials',()=>{
  const item=c(.1,.1,.5,.5,{edgeMethod:'watershed-grabcut'});
  const internal=c(.2,.2,.08,.08,{edgeMethod:'edge-enclosure',paperContactRatio:.02,insideEvidenceRatio:.9,fillRatio:.95});
  const out=fuseRecognitionCandidates([item],[internal]);
  assert.deepEqual(out,[item]);
});

test('paper-facing physical boundary refines one watershed instance',()=>{
  const rough=c(.18,.18,.42,.42,{edgeMethod:'watershed-grabcut'});
  const physical=c(.20,.20,.36,.36,{edgeMethod:'edge-enclosure',paperContactRatio:.92,insideEvidenceRatio:.5,fillRatio:.9});
  const out=fuseRecognitionCandidates([rough],[physical]);
  assert.deepEqual(out,[physical]);
});

test('one physical sticker boundary may reunite several tiny watershed islands',()=>{
  const left=c(.35,.3,.05,.12),middle=c(.43,.34,.04,.10),right=c(.5,.29,.05,.13);
  const sticker=c(.33,.27,.29,.31,{edgeMethod:'edge-enclosure',paperContactRatio:.95,insideEvidenceRatio:.3,fillRatio:.58});
  const out=fuseRecognitionCandidates([left,middle,right],[sticker]);
  assert.deepEqual(out,[sticker]);
});

test('a contour never merges two substantial neighbouring materials',()=>{
  const a=c(.1,.1,.2,.2),b=c(.32,.1,.2,.2),bad=c(.08,.08,.48,.25,{edgeMethod:'edge-enclosure',paperContactRatio:.9,insideEvidenceRatio:.7,fillRatio:.6});
  const out=fuseRecognitionCandidates([a,b],[bad]);
  assert.equal(out.length,2);assert.ok(out.includes(a));assert.ok(out.includes(b));
});

test('strict paper-contact recovery can restore a missed pale photo',()=>{
  const photo=c(.55,.12,.2,.18,{edgeMethod:'edge-enclosure',paperContactRatio:.96,insideEvidenceRatio:.55,fillRatio:.8});
  assert.deepEqual(fuseRecognitionCandidates([],[photo]),[photo]);
});


test('closed physical carrier may reunite several substantial pale-interior fragments without a shape class',()=>{
  const top=c(.20,.20,.34,.07),left=c(.18,.27,.08,.24),bottom=c(.22,.48,.30,.08);
  const carrier=c(.16,.17,.42,.42,{edgeMethod:'edge-enclosure',paperContactRatio:.96,insideEvidenceRatio:.28,interiorBackgroundRatio:.02,fillRatio:.68});
  assert.deepEqual(fuseRecognitionCandidates([top,left,bottom],[carrier]),[carrier]);
});

test('page-connected gap prevents an accidental enclosure from merging neighbouring loose items',()=>{
  const a=c(.15,.20,.18,.22),b=c(.42,.20,.18,.22);
  const outer=c(.10,.15,.56,.34,{edgeMethod:'edge-enclosure',paperContactRatio:.95,insideEvidenceRatio:.32,interiorBackgroundRatio:.24,fillRatio:.60});
  const out=fuseRecognitionCandidates([a,b],[outer]);
  assert.equal(out.length,2);assert.ok(out.includes(a)&&out.includes(b));
});

test('tiny internal detail with a one-pixel-style bbox overshoot is still suppressed by its physical parent',()=>{
  const parent=c(.30,.30,.40,.30,{edgeMethod:'edge-enclosure',paperContactRatio:.97,insideEvidenceRatio:.25,fillRatio:.88,rectFill:.93});
  const glyph=c(.64,.299,.04,.04,{edgeMethod:'watershed-grabcut'});
  const out=fuseRecognitionCandidates([glyph],[parent]);
  assert.deepEqual(out,[parent]);
});


test('reconstructed fragmented carrier merges sparse pieces but not substantial neighbours',()=>{
  const f1=c(.10,.60,.06,.23),f2=c(.15,.60,.28,.04),f3=c(.10,.66,.12,.13),f4=c(.39,.62,.07,.06);
  const carrier=c(.07,.58,.43,.28,{edgeMethod:'boundary-reconstruction',boundaryReconstruction:true,reconstructionScore:.78,edgeSupportRatio:.72,paperContactRatio:.82,interiorBackgroundRatio:.45,fillRatio:.81,matchedOccupancy:.46});
  assert.deepEqual(fuseRecognitionCandidates([f1,f2,f3,f4],[carrier]),[carrier]);
  const a=c(.12,.12,.22,.27),b=c(.40,.10,.58,.42);
  const accidental=c(.10,.08,.88,.45,{edgeMethod:'boundary-reconstruction',boundaryReconstruction:true,reconstructionScore:.82,edgeSupportRatio:.75,paperContactRatio:.80,interiorBackgroundRatio:.16,fillRatio:.50,matchedOccupancy:.84});
  const out=fuseRecognitionCandidates([a,b],[accidental]);
  assert.equal(out.length,2);assert.ok(out.includes(a)&&out.includes(b));
});


test('overlapping watershed fragments may reunite even when their summed occupancy is high',()=>{
  const a=c(.62,.14,.09,.09),b=c(.65,.17,.21,.22),d=c(.62,.19,.07,.09);
  const carrier=c(.62,.13,.23,.27,{edgeMethod:'boundary-reconstruction',boundaryReconstruction:true,reconstructionScore:.64,edgeSupportRatio:.74,paperContactRatio:.62,interiorBackgroundRatio:.25,fillRatio:.66,matchedOccupancy:1.01,matchedPairOverlap:.54});
  assert.deepEqual(fuseRecognitionCandidates([a,b,d],[carrier]),[carrier]);
});
