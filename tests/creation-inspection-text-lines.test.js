import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from 'canvas';
import {draft} from '../src/domain.js';
import {createCreationDocument} from '../src/creation-document.js';
import {applyCreationTransaction,creationSceneRevision} from '../src/creation-transaction.js';
import {inspectCreationDocument} from '../src/creation-inspection.js';

test('opt-in text line inspection reports font ink bounds in page millimetres',async()=>{
 let document=await createCreationDocument({draft:draft(),assets:[]});
 document=applyCreationTransaction(document,{
  protocolVersion:2,transactionId:'text-line-inspection',baseSceneRevision:creationSceneRevision(document),
  operations:[{op:'text.add',id:'caption',content:'纸上\n的字',place:{reference:'page',at:[40,50],unit:'mm'},size:{width:50,unit:'mm'},style:{fontSizePt:18}}]
 },[]).document;
 const ordinary=inspectCreationDocument(document,{ids:['caption']}).layers[0];
 assert.equal(ordinary.textLines,undefined);
 const context=createCanvas(2,2).getContext('2d');
 const detail=inspectCreationDocument(document,{ids:['caption'],textLines:true,textContext:context,textCanvasFactory:createCanvas}).layers[0].textLines;
 assert.equal(detail.status,'raster-ink');
 assert.deepEqual(detail.lines.map(row=>row.text),['纸上','的字']);
 assert.ok(detail.lines[0].inkBoundsMm[3]<detail.lines[1].inkBoundsMm[1]);
 for(const line of detail.lines){
  assert.equal(line.inkQuadMm.length,4);
  assert.ok(line.inkBoundsMm.every(Number.isFinite));
  assert.ok(line.inkBoundsMm[2]>line.inkBoundsMm[0]);
  assert.ok(line.inkBoundsMm[3]>line.inkBoundsMm[1]);
 }
 const narrow=applyCreationTransaction(document,{
  protocolVersion:2,transactionId:'narrow-text',baseSceneRevision:creationSceneRevision(document),
  operations:[{op:'layer.update',target:'caption',style:{widthScale:.6}}]
 },[]).document;
 const narrowRow=inspectCreationDocument(narrow,{ids:['caption'],textLines:true,textContext:context,textCanvasFactory:createCanvas}).layers[0];
 assert.equal(narrowRow.widthScale,.6);
 const normalWidth=detail.lines[0].inkBoundsMm[2]-detail.lines[0].inkBoundsMm[0];
 const narrowWidth=narrowRow.textLines.lines[0].inkBoundsMm[2]-narrowRow.textLines.lines[0].inkBoundsMm[0];
 assert.ok(narrowWidth<normalWidth*.9);
 assert.ok(Math.abs((narrowRow.textLines.lines[0].inkBoundsMm[3]-narrowRow.textLines.lines[0].inkBoundsMm[1])-(detail.lines[0].inkBoundsMm[3]-detail.lines[0].inkBoundsMm[1]))<.5);
});
