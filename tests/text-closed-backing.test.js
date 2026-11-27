import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from 'canvas';
import {draft} from '../src/domain.js';
import {createCreationDocument} from '../src/creation-document.js';
import {applyCreationTransaction,creationSceneRevision} from '../src/creation-transaction.js';
import {drawSceneText} from '../src/editor-tools-model.js';
import {paintTextClosedBacking} from '../src/text-closed-backing.js';
import {validateWebScene} from '../src/web-scene-workbench.js';

const backing={kind:'closed',color:'#80D0EE',paddingMm:1.5};
const op={op:'text.add',id:'number',content:'4',place:{reference:'page',at:[40,50],unit:'mm'},size:{width:36,unit:'mm'},style:{fontFamily:'sans-serif',fontSizePt:64,color:'#101010',fillOpacity:0,outline:{color:'#101010',widthMm:.3},backing}};
function render(node){
 const canvas=createCanvas(250,250),ctx=canvas.getContext('2d');ctx.translate(125,125);drawSceneText(ctx,node);
 const data=ctx.getImageData(0,0,250,250).data;let blue=0,black=0;
 for(let i=0;i<data.length;i+=4){if(data[i+3]<50)continue;if(data[i+2]>data[i]+35)blue++;else if(data[i]<80)black++;}
 return {blue,black};
}
test('closed backing is part of editable text and follows content and style updates',async()=>{
 let doc=await createCreationDocument({draft:draft(),assets:[]});
 doc=applyCreationTransaction(doc,{protocolVersion:2,transactionId:'backed-text',baseSceneRevision:creationSceneRevision(doc),operations:[op]},[]).document;
 const first=doc.page.layers.find(layer=>layer.id==='number');
 assert.equal(first.type,'text');assert.equal(first.textBacking.kind,'closed');assert.ok(first.textBacking.padding>0);
 const painted=render(first);assert.ok(painted.blue>500);assert.ok(painted.black>100);
 doc=applyCreationTransaction(doc,{protocolVersion:2,transactionId:'update-backed-text',baseSceneRevision:creationSceneRevision(doc),operations:[{op:'layer.update',target:'number',content:'1',style:{backing:{color:'#F0A65E'}}}]},[]).document;
 const changed=doc.page.layers.find(layer=>layer.id==='number');
 assert.equal(changed.content,'1');assert.equal(changed.textBacking.color,'#F0A65E');assert.equal(changed.textBacking.kind,'closed');
 assert.equal(changed.textBacking.padding,first.textBacking.padding);
 assert.doesNotThrow(()=>validateWebScene(doc.page,doc.source,[],{final:false}));
 assert.notEqual(render(changed).blue,painted.blue);
});
test('closed backing fills an enclosed glyph hole while preserving the outer silhouette',()=>{
 const plain=createCanvas(240,180),plainCtx=plain.getContext('2d');
 plainCtx.font='100px sans-serif';plainCtx.textBaseline='alphabetic';plainCtx.textAlign='left';plainCtx.fillText('O',60,125);
 const m=plainCtx.measureText('O'),x=Math.round(60+m.width/2),y=Math.round(125-(m.actualBoundingBoxAscent-m.actualBoundingBoxDescent)/2);
 assert.equal(plainCtx.getImageData(x,y,1,1).data[3],0,'the glyph itself has a transparent hole');
 const backed=createCanvas(240,180),ctx=backed.getContext('2d');ctx.font=plainCtx.font;ctx.textBaseline='alphabetic';ctx.textAlign='left';
 paintTextClosedBacking(ctx,{textBacking:{kind:'closed',color:'#80D0EE',padding:6}},'O',60,125);
 const center=ctx.getImageData(x,y,1,1).data;
 assert.deepEqual(Array.from(center),[128,208,238,255]);
 assert.equal(ctx.getImageData(15,15,1,1).data[3],0,'the backing does not become a bounding rectangle');
});
