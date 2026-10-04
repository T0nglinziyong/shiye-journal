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


test('complete rectangular paper boundary may reunite several substantial pale-interior fragments',()=>{
  const top=c(.20,.20,.34,.07),left=c(.18,.27,.08,.24),bottom=c(.22,.48,.30,.08);
  const card=c(.16,.17,.42,.42,{edgeMethod:'edge-enclosure',paperContactRatio:.96,insideEvidenceRatio:.28,fillRatio:.86,rectFill:.91});
  assert.deepEqual(fuseRecognitionCandidates([top,left,bottom],[card]),[card]);
});

test('tiny internal detail with a one-pixel-style bbox overshoot is still suppressed by its physical parent',()=>{
  const parent=c(.30,.30,.40,.30,{edgeMethod:'edge-enclosure',paperContactRatio:.97,insideEvidenceRatio:.25,fillRatio:.88,rectFill:.93});
  const glyph=c(.64,.299,.04,.04,{edgeMethod:'watershed-grabcut'});
  const out=fuseRecognitionCandidates([glyph],[parent]);
  assert.deepEqual(out,[parent]);
});
