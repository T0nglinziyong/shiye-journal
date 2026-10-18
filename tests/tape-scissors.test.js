import test from 'node:test';
import assert from 'node:assert/strict';
import {project} from '../src/domain.js';
import {planSceneCut,rejoinMaterialPieces} from '../src/scene-cut-ops.js';
import {geometryArea} from '../src/craft-topology.js';
import {silhouetteFromAlpha} from '../src/raster-silhouette.js';
import {createTapeStrip,processTapeAsset,reshapeTapeStrip,validateTapeStrip} from '../src/tape-strip.js';
import {validateScenePhysical} from '../src/creative.js';
import {buildMaterialLedger} from '../src/material-ledger.js';

const source={id:'paper',kind:'paper',title:'纸片',physicalWidthMM:100,physicalHeightMM:80};
function page(){
  const draft=project('路径裁切').drafts[0],width=100*1000/297,height=80*1000/297;
  draft.layers.push({id:'paper-node',type:'material',assetID:'paper',x:200,y:200,width,height,
    zIndex:1,rotation:0,generationBaseline:{x:200,y:200,width,height,rotation:0,zIndex:1}});
  return draft;
}
test('a masked source can be split again without erasing the surviving mask',()=>{
  const masked=planSceneCut(page(),{operation:'mask',scope:'object',selectedID:'paper-node',
    preset:'window',inset:.2,hideRegion:true},[source]);
  const split=planSceneCut(masked.draft,{operation:'split',scope:'object',
    selectedID:'paper-node',pathType:'line',points:[[-10,200],[410,200]]},[source]);
  assert.equal(split.draft.items.length,2);
  assert.ok(split.draft.items.every(item=>item.vectorMask));
  assert.equal(validateScenePhysical(split.draft,[source]),true);
});

test('crossing curved strokes partition every bounded face and conserve material',()=>{
  const result=planSceneCut(page(),{operation:'split',scope:'object',selectedID:'paper-node',
    pathType:'line',points:[[-10,160],[120,130],[280,270],[410,160],[280,130],[120,270],[-10,240]]},[source]);
  assert.equal(result.draft.items.length,4);
  assert.ok(Math.abs(result.pieces.reduce((sum,piece)=>sum+piece.area,0)-8000)<1e-4);
  assert.equal(validateScenePhysical(result.draft,[source]),true);
});

test('transparent source pixels define a smaller cutting boundary',()=>{
  const width=8,height=8,pixels=new Uint8Array(width*height*4);
  for(let y=1;y<7;y++)for(let x=2;x<6;x++)pixels[(y*width+x)*4+3]=255;
  const silhouette=silhouetteFromAlpha(pixels,width,height);
  assert.ok(Math.abs(geometryArea(silhouette)-.375)<1e-8);
  const derived={...source,sourceSilhouette:silhouette};
  const result=planSceneCut(page(),{operation:'split',scope:'object',selectedID:'paper-node',
    pathType:'line',points:[[-10,200],[410,200]]},[derived]);
  assert.equal(result.draft.items.length,2);
  assert.ok(Math.abs(result.pieces.reduce((sum,piece)=>sum+piece.area,0)-3000)<1e-3);
  assert.equal(validateScenePhysical(result.draft,[source]),true);
});

test('confirmed repeating tape creates independent editable strips at real width',()=>{
  const tape=processTapeAsset({id:'tape',title:'示例胶带',kind:'tape',
    physicalWidthMM:120,physicalHeightMM:16},{axis:'x',repeatable:true,periodMM:20});
  const draft=project('胶带').drafts[0];
  const first=createTapeStrip(tape,draft,[[20,30],[120,35],[210,80]],1);
  const second=createTapeStrip(tape,draft,[[70,180],[180,180]],2);
  first.materialUnitIndex=0;second.materialUnitIndex=1;
  draft.items.push(first,second);
  assert.equal(validateTapeStrip(first.tapeStrip,tape),16);
  assert.equal(validateScenePhysical(draft,[tape]),true);
  const ledger=buildMaterialLedger(draft,[tape]);
  assert.equal(ledger.rolls[0].pieces.length,2);
  assert.ok(Math.abs(ledger.rolls[0].pieces[0].lengthMM-first.tapeStrip.pathLengthMM)<1e-8);
});

test('unverified photographic tape cannot stretch beyond its captured sample',()=>{
  const tape={id:'single',title:'实拍胶带',kind:'tape',physicalWidthMM:40,physicalHeightMM:12};
  const draft=project('胶带').drafts[0];
  assert.throws(()=>createTapeStrip(tape,draft,[[0,0],[400,0]]),/只拍到/);
});
test('one roll can make repeat, finite and stretched strips with independent widths and editable centerlines',()=>{
  const tape=processTapeAsset({id:'tape',kind:'tape',title:'花纹',physicalWidthMM:120,
    physicalHeightMM:16},{axis:'x',repeatable:true,repeatStartMM:12,repeatEndMM:32});
  const draft=project('胶带').drafts[0];
  const repeat=createTapeStrip(tape,draft,[[15,20],[260,40]],1,{widthMM:22,
    textureMode:'repeat',startCap:'angled',endCap:'torn'});
  const stretch=createTapeStrip(tape,draft,[[10,100],[250,100]],2,{widthMM:8,
    textureMode:'stretch',sourceOffsetMM:5,sourceWindowMM:60});
  const sample=createTapeStrip(tape,draft,[[10,160],[100,160]],3,{textureMode:'sample'});
  repeat.materialUnitIndex=0;stretch.materialUnitIndex=1;sample.materialUnitIndex=2;
  draft.items.push(repeat,stretch,sample);
  assert.equal(validateScenePhysical(draft,[tape]),true);
  assert.deepEqual(buildMaterialLedger(draft,[tape]).rolls[0].pieces.map(piece=>piece.unit),[0,1,2]);
  const edited=reshapeTapeStrip(repeat,tape,draft,[[30,30],[150,60],[260,20]],{widthMM:12});
  assert.equal(edited.id,repeat.id);
  assert.equal(edited.tapeStrip.physicalWidthMM,12);
  assert.equal(validateTapeStrip(edited.tapeStrip,tape),12);
});
test('cut tape fragments retain one source strip and can be rejoined',()=>{
  const tape=processTapeAsset({id:'tape',kind:'tape',title:'花纹',physicalWidthMM:120,
    physicalHeightMM:16},{axis:'x',repeatable:true,periodMM:20});
  const draft=project('裁切胶带').drafts[0];
  const node=createTapeStrip(tape,draft,[[20,150],[300,150]]);
  node.materialUnitIndex=0;draft.items.push(node);
  const cut=planSceneCut(draft,{operation:'split',scope:'object',selectedID:node.id,
    pathType:'line',points:[[160,0],[160,300]]},[tape]);
  assert.equal(cut.pieces.length,2);
  assert.equal(validateScenePhysical(cut.draft,[tape]),true);
  assert.equal(buildMaterialLedger(cut.draft,[tape]).rolls[0].pieces.length,1);
  const joined=rejoinMaterialPieces(cut.draft,cut.pieces.map(piece=>piece.nodeID),[tape]);
  assert.equal(validateScenePhysical(joined.draft,[tape]),true);
  assert.equal(joined.draft.items.length,1);
});
