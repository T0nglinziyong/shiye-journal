import test from 'node:test';
import assert from 'node:assert/strict';
import {fuseRecognitionCandidates} from '../src/recognition-fusion.js';

const c=(x,y,w,h,extra={})=>({x,y,w,h,mask:{width:10,height:10,alpha:new Uint8Array(100).fill(255),polygons:[]},...extra});

test('closed structural boundary replaces a shadow-expanded colour proposal',()=>{
  const colour=c(.18,.18,.42,.42,{edgeMethod:'graphcut-lab-shadow-aware'});
  const physical=c(.20,.20,.36,.36,{edgeMethod:'edge-enclosure',structuralConfidence:.9});
  const out=fuseRecognitionCandidates([colour],[physical]);
  assert.equal(out.length,1);assert.equal(out[0],physical);
});

test('one structural sticker boundary reunites several colour islands',()=>{
  const left=c(.35,.3,.08,.22),middle=c(.43,.34,.07,.2),right=c(.5,.29,.09,.24);
  const sticker=c(.33,.27,.29,.31,{edgeMethod:'edge-enclosure',structuralConfidence:.82});
  const out=fuseRecognitionCandidates([left,middle,right],[sticker]);
  assert.equal(out.length,1);assert.equal(out[0],sticker);
});

test('unrelated neighbouring materials stay separate',()=>{
  const a=c(.1,.1,.2,.2),b=c(.55,.55,.2,.2),struct=c(.11,.11,.18,.18,{edgeMethod:'edge-enclosure',structuralConfidence:.9});
  const out=fuseRecognitionCandidates([a,b],[struct]);
  assert.equal(out.length,2);assert.ok(out.includes(struct));assert.ok(out.includes(b));
});

test('fusion chooses inner physical card over a nested outer shadow enclosure',()=>{
  const colour=c(.18,.18,.42,.42,{edgeMethod:'graphcut-lab-shadow-aware'});
  const shadow=c(.17,.17,.44,.44,{edgeMethod:'edge-enclosure',structuralConfidence:.70,boundaryShadowFraction:.45});
  const card=c(.20,.20,.36,.36,{edgeMethod:'edge-enclosure',structuralConfidence:.82,boundaryShadowFraction:.02});
  const out=fuseRecognitionCandidates([colour],[shadow,card]);
  assert.equal(out.length,1);assert.equal(out[0],card);
});
