import test from 'node:test';
import assert from 'node:assert/strict';
import {canvasGuide,validateCanvasOperations,lowerCanvasOperations} from '../creative-agent/runtime/canvas-interface.mjs';
import {assertUniformOpacity} from '../creative-agent/runtime/opacity-contract.mjs';
import {createCreationDocument} from '../src/creation-document.js';
import {applyCreationTransaction,creationSceneRevision} from '../src/creation-transaction.js';
import {draft} from '../src/domain.js';
const paper={op:'create',kind:'paper',id:'paper',size:{width:50,height:70,unit:'mm'},style:{fill:'#EEDDBB',opacity:.55}};
const apply=(doc,operations,id)=>applyCreationTransaction(doc,{protocolVersion:2,transactionId:id,baseSceneRevision:creationSceneRevision(doc),operations},[]).document;
test('all model objects use style.opacity and reject the inverse paper field',()=>{
 assert.ok(!JSON.stringify(canvasGuide()).includes('translucency'));
 for(const opacity of [0,.55,1])validateCanvasOperations([{...paper,style:{...paper.style,opacity}},{op:'create',kind:'tape',id:'t',asset:'m1',lengthMm:20,style:{opacity}},{op:'update',target:'paper',style:{opacity}}]);
 assert.throws(()=>validateCanvasOperations([{...paper,translucency:.45}]),/style.opacity/);
 assert.throws(()=>assertUniformOpacity({parameters:{geometry:{options:{translucency:.3}}}}),/style.opacity/);
 assert.throws(()=>validateCanvasOperations([{...paper,style:{...paper.style,opacity:1.1}}]));
});
test('paper opacity is absolute on create and sparse update; unrelated edits preserve it',async()=>{
 let doc=await createCreationDocument({draft:draft(),assets:[]});
 doc=apply(doc,lowerCanvasOperations([paper]),'create');
 assert.equal(doc.page.layers[0].opacity,.55);assert.equal(doc.page.layers[0].shapeOptions.translucency,0);
 for(const opacity of [0,.3,1]){
  const ops=[{op:'update',target:'paper',style:{opacity}}];validateCanvasOperations(ops);
  doc=apply(doc,lowerCanvasOperations(ops,{document:doc}),'opacity-'+Math.round(opacity*100));
  assert.equal(doc.page.layers[0].opacity,opacity);assert.equal(doc.page.layers[0].shapeOptions.translucency,0);
 }
 doc=apply(doc,lowerCanvasOperations([{op:'update',target:'paper',texture:'rough'}],{document:doc}),'texture');
 assert.equal(doc.page.layers[0].opacity,1);assert.equal(doc.page.layers[0].shapeOptions.grain,.9);
});
test('editing stored translucent paper does not multiply two opacity controls',async()=>{
 for(const semantic of [true,false]){
  let doc=await createCreationDocument({draft:draft(),assets:[]});
  const base={id:'paper',size:paper.size,style:{fill:'#EEDDBB'}};
  doc=apply(doc,[semantic?{op:'paper.add',...base,translucency:.45}:{op:'graphic.add',...base,geometry:{kind:'paper',options:{translucency:.45}}}],'stored');
  const before=JSON.stringify(doc);
  const ops=lowerCanvasOperations([{op:'update',target:'paper',style:{opacity:.7}}],{document:doc});
  assert.equal(JSON.stringify(doc),before);
  doc=apply(doc,ops,'update');
  assert.equal(doc.page.layers[0].opacity,.7);assert.equal(doc.page.layers[0].shapeOptions.translucency,0);
  if(semantic)assert.equal(doc.page.layers[0].creationObject.parameters.translucency,0);
 }
});
