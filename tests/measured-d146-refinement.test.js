import test from 'node:test';
import assert from 'node:assert/strict';
import {draft} from '../src/domain.js';
import {createCreationDocument} from '../src/creation-document.js';
import {applyCreationTransaction,creationSceneRevision} from '../src/creation-transaction.js';
import {inspectCreationDocument} from '../src/creation-inspection.js';
import {loadOfflineCanvas} from '../src/offline-node-preview.mjs';
import {compileMeasuredD146} from '../creative-agent/library/measured-d146.js';
import {refineMeasuredTemplate} from '../creative-agent/library/refine-measured-template.js';

test('digit ink fits measured slots and marker follows reflowed text',async()=>{
 const page=draft({ratio:'a5'});page.physicalPageHeightMM=157;page.canvas.width=page.canvas.height*110/157;
 let doc=await createCreationDocument({draft:page,assets:[],aliases:{},title:'D146',prompt:'template draft'});
 const compiled=compileMeasuredD146({texts:{q2:'路过街角，记下新开的花。'}});
 for(let i=0;i<compiled.operations.length;i+=12)doc=applyCreationTransaction(doc,{protocolVersion:2,transactionId:`base-${i}`,baseSceneRevision:creationSceneRevision(doc),operations:compiled.operations.slice(i,i+12)},[]).document;
 const canvas=await loadOfflineCanvas();
 doc=refineMeasuredTemplate(doc,compiled,[],canvas).document;
 const ids=['top-one','top-four','bottom-one','q2-body','q2-body-highlight-0'];
 const rows=inspectCreationDocument(doc,{ids,textLines:true,textContext:canvas.createCanvas(1,1).getContext('2d'),textCanvasFactory:canvas.createCanvas}).layers;
 const byId=Object.fromEntries(rows.map(row=>[row.id,row]));
 for(const key of ['top-one','top-four','bottom-one']){
  const b=compiled.refinement.digitInkBoxes[key],target=[(b[0]+b[2])*110/1260,(b[1]+b[3])*157/1800];
  const ink=byId[key].textLines.lines[0].inkBoundsMm,actual=[(ink[0]+ink[2])/2,(ink[1]+ink[3])/2];
  assert.ok(Math.abs(target[0]-actual[0])<2,key+' x');
  assert.ok(Math.abs(target[1]-actual[1])<2,key+' y');
 }
 const line=byId['q2-body'].textLines.lines[0].inkBoundsMm,marker=byId['q2-body-highlight-0'].world;
 assert.ok(marker.centerMm[0]>line[0]&&marker.centerMm[0]<line[2]);
 assert.ok(Math.abs(marker.centerMm[1]-line[3])<1);
 assert.equal(byId['q2-body'].textLines.lines.length,1);
});
