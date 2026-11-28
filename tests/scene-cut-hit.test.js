import test from 'node:test';
import assert from 'node:assert/strict';
import {cutPreviewPieceAt} from '../src/scene-cut-hit.js';

test('canvas taps toggle only the visible cut piece under the released pointer',()=>{
  const preview={spec:{operation:'split'},pieces:[
    {key:'left',type:'shape',outline:[[0,0],[50,0],[50,100],[0,100]]},
    {key:'right',type:'shape',outline:[[50,0],[100,0],[100,100],[50,100]]}]};
  assert.equal(cutPreviewPieceAt(preview,{x:20,y:50})?.key,'left');
  assert.equal(cutPreviewPieceAt(preview,{x:80,y:50})?.key,'right');
  assert.equal(cutPreviewPieceAt(preview,{x:120,y:50}),null);
  assert.equal(cutPreviewPieceAt({...preview,spec:{operation:'mask'}},{x:20,y:50}),null);
});

test('a cutout hole belongs to its inner piece, not the surrounding remnant',()=>{
  const rectangle=(left,top,right,bottom)=>[[left,top],[right,top],[right,bottom],[left,bottom]];
  const preview={spec:{operation:'split'},pieces:[
    {key:'inside',type:'material',hitGeometry:[[rectangle(25,25,75,75)]]},
    {key:'outside',type:'material',hitGeometry:[[rectangle(0,0,100,100),rectangle(25,25,75,75)]]}]};
  assert.equal(cutPreviewPieceAt(preview,{x:50,y:50})?.key,'inside');
  assert.equal(cutPreviewPieceAt(preview,{x:5,y:50})?.key,'outside');
});

test('an opaque sibling in the selected group blocks clicks on a lower piece',()=>{
  const square=[[0,0],[100,0],[100,100],[0,100]];
  const preview={spec:{operation:'split'},pieces:[
    {key:'lower',sourceID:'lower',type:'shape',outline:square},
    {key:'upper',sourceID:'upper',type:'shape',outline:[[0,0],[50,0],[50,100],[0,100]]}]};
  assert.equal(cutPreviewPieceAt(preview,{x:25,y:50},{topSourceID:'upper'})?.key,'upper');
  assert.equal(cutPreviewPieceAt(preview,{x:75,y:50},{topSourceID:'upper'}),null);
});
