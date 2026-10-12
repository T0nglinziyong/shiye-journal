import test from 'node:test';
import assert from 'node:assert/strict';
import {project} from '../src/domain.js';
import {buildMaterialLedger} from '../src/material-ledger.js';
import {splitMaterialInDraft,retireSplitPiece,splitMaterialRegions} from '../src/material-split.js';
import {recordSceneOperation,makeAutoSceneSnapshot} from '../src/scene-persistence.js';
import {encodeAlphaMask,readAlphaMask} from '../src/alpha-mask-blob.js';

const asset={id:'asset-one',kind:'paper',title:'paper',physicalWidthMM:100,
 physicalHeightMM:80,supply:{kind:'single',quantity:1},updatedAt:'2026-10-12T10:00:00.000Z'};
const piece={id:'piece-root',type:'material',assetID:'asset-one',
 x:200,y:300,width:300,height:240,rotation:0,zIndex:3,
 materialUnitIndex:0,isParked:false,materialMask:null,cropRect:null};
function scene(){
 const p=project('scene');p.isDraft=false;
 p.drafts[0].items.push(structuredClone(piece));return p;
}
test('horizontal and vertical splits create two disjoint physical parts of one unit',()=>{
 for(const mode of ['horizontal','vertical']){
  const p=scene(),d=p.drafts[0];
  const children=splitMaterialInDraft(d,asset,piece.id,{mode,position:.5});
  assert.equal(children.length,2);
  assert.equal(d.items.length,2);
  assert.notEqual(children[0].id,children[1].id);
  assert.deepEqual(children.map(x=>x.assetID),['asset-one','asset-one']);
  assert.deepEqual(children.map(x=>x.materialUnitIndex),[0,0]);
  assert.ok(children.every(x=>x.width>0&&x.height>0&&x.splitParentId==='piece-root'));
  const ledger=buildMaterialLedger(d,[asset]);
  assert.equal(ledger.units.length,1);
  assert.equal(ledger.units[0].pieces.length,2);
  assert.ok(Math.abs(ledger.units[0].usedAreaMM2-8000)<1e-5);
 }
});
test('line split can carve two independently positioned pieces',()=>{
 const p=scene(),d=p.drafts[0];
 const pieces=splitMaterialInDraft(d,asset,piece.id,{mode:'line',from:[0,0],to:[1,1]});
 assert.equal(pieces.length,2);assert.notEqual(pieces[0].x,pieces[1].x);
 assert.ok(buildMaterialLedger(d,[asset]).units[0].pieces.length===2);
});
test('a simple inner lasso extracts the enclosed piece and leaves a physical frame',()=>{
 const p=scene(),d=p.drafts[0];
 const pieces=splitMaterialInDraft(d,asset,piece.id,{mode:'lasso',
   points:[[.25,.25],[.75,.25],[.75,.75],[.25,.75]]});
 assert.equal(pieces.length,2);
 assert.ok(pieces.some(x=>x.materialMask?.holes?.length===1));
 assert.ok(Math.abs(buildMaterialLedger(d,[asset]).units[0].usedAreaMM2-8000)<1e-5);
});
test('a dropped split piece becomes a recoverable standby part',()=>{
 const p=scene(),d=p.drafts[0];
 const [first,second]=splitMaterialInDraft(d,asset,piece.id,{mode:'vertical'});
 assert.equal(retireSplitPiece(d,first.id),true);
 assert.deepEqual(d.items.filter(i=>!i.isParked).map(i=>i.id),[second.id]);
 assert.deepEqual(d.items.filter(i=>i.isParked).map(i=>i.id),[first.id]);
 assert.ok(Math.abs(buildMaterialLedger(d,[asset]).units[0].usedAreaMM2-8000)<1e-5);
});
test('split cannot remove almost all source or create invalid empty regions',()=>{
 const d=scene().drafts[0];
 assert.throws(()=>splitMaterialRegions(d.items[0],asset,{mode:'vertical',position:1}));
 assert.equal(d.items.length,1);
});
test('compressed alpha masks retain exact alpha channel without RGB data',async()=>{
 const alpha=Uint8Array.from({length:64*32},(_,i)=>i%9===0?0:i%7===0?128:255);
 const blob=encodeAlphaMask(alpha,64,32);
 const decoded=await readAlphaMask(blob);
 assert.equal(blob.type,'application/gzip');
 assert.equal(decoded.width,64);assert.equal(decoded.height,32);
 assert.deepEqual([...decoded.alpha],[...alpha]);
});
test('every effective scene edit creates an operation; the thirtieth creates a snapshot',()=>{
 const p=project('ops'),draft=p.drafts[0];
 let before=structuredClone(draft);
 for(let i=0;i<30;i++){
   draft.paperColor=i%2?'#ffeeff':'#feeeee';
   const result=recordSceneOperation(p,before,draft,{at:new Date(Date.parse('2026-10-12T10:00:00Z')+i*1000).toISOString()});
   assert.equal(result.changed,true);before=structuredClone(draft);
 }
 assert.equal(p.sceneOperations.length,30);
 assert.equal(p.autoSceneSnapshots.length,1);
 assert.equal(p.autoSceneSnapshots[0].reason,'30-operations');
 assert.equal(p.sceneOperationsSinceSnapshot,0);
});
test('five-minute and exit snapshots keep editable drafts and avoid empty duplicates',()=>{
 const p=project('ops'),draft=p.drafts[0];const before=structuredClone(draft);
 draft.paperColor='#fffccc';
 recordSceneOperation(p,before,draft,{at:'2026-10-12T10:00:00Z'});
 assert.equal(p.autoSceneSnapshots?.length??0,0);
 assert.equal(makeAutoSceneSnapshot(p,{reason:'leave-editor',at:'2026-10-12T10:01:00Z'}),true);
 assert.equal(makeAutoSceneSnapshot(p,{reason:'leave-editor',at:'2026-10-12T10:02:00Z'}),false);
 assert.equal(p.autoSceneSnapshots[0].reason,'leave-editor');
});
