import test from 'node:test';
import assert from 'node:assert/strict';
import {titleTool,compileTitleOperations} from '../creative-agent/runtime/title-tool.mjs';
import {availableHarnessTools,selectHarnessTools} from '../creative-agent/runtime/tools.mjs';
import {validateValue} from '../src/creative-contract.js';
import {draft} from '../src/domain.js';
import {createCreationDocument} from '../src/creation-document.js';
import {applyCreationTransaction,creationSceneRevision} from '../src/creation-transaction.js';
const title={id:'title',text:'慢慢生活',place:{reference:'page',at:[50,40],unit:'mm'},order:{edge:'front'},widthMm:90,fontSizePt:22,color:'#354A55',layout:'stagger',runs:[{text:'慢慢',role:'primary',rotationDeg:-4},{text:'生活',role:'secondary',offsetMm:[0,2]}],style:{outline:{color:'#F5EDDA',widthMm:.35}},backdrop:{kind:'mixed',patternColor:'#B78B65'}};
test('title is always visible with typed combinable effects and rejects invalid parameters',()=>{
 assert.ok(selectHarnessTools(availableHarnessTools()).some(t=>t.function.name==='creation_title'));
 const args={transactionId:'title',baseSceneRevision:'sha256:'+'a'.repeat(64),titles:[title]};validateValue(args,titleTool.function.parameters);
 assert.throws(()=>validateValue({...args,titles:[{...title,layout:'random'}]},titleTool.function.parameters));
 assert.throws(()=>compileTitleOperations({titles:[{...title,runs:[{text:'少字'}]}]}),/拼接/);
 assert.throws(()=>compileTitleOperations({titles:[{...title,layout:'curve'}]}),/单行/);
});
test('title keeps editable lettering above its background, source unchanged and batch atomic',async()=>{
 const base=await createCreationDocument({draft:draft(),assets:[]});
 const operations=compileTitleOperations({titles:[title]});
 const children=operations[0].children,letters=children.filter(c=>c.op==='text.add');
 assert.equal(letters.map(c=>c.content).join(''),title.text);
 assert.equal(letters[0].place.rotationDeg,-4);assert.equal(letters[0].style.outline.widthMm,.35);
 assert.ok(children.findIndex(c=>c.op==='text.add')>0);
 const tx={protocolVersion:2,transactionId:'title',baseSceneRevision:creationSceneRevision(base),operations};
 const result=applyCreationTransaction(base,tx,[]);assert.deepEqual(result.document.source,base.source);
 assert.equal(result.document.page.layers.length,1);assert.equal(applyCreationTransaction(result.document,tx,[]).changed,false);
 const before=JSON.stringify(base);
 assert.throws(()=>applyCreationTransaction(base,{...tx,operations:[...operations,...compileTitleOperations({titles:[{...title,id:'bad',order:{before:'missing'}}]})]},[]));
 assert.equal(JSON.stringify(base),before);
});
test('plain titles need no decoration and curve combines with outlines and backdrops',()=>{
 const {runs,style,backdrop,...plain}=title;
 const simple=compileTitleOperations({titles:[{...plain,layout:'plain'}]})[0];assert.equal(simple.children.length,1);
 const curved=compileTitleOperations({titles:[{...plain,layout:'curve',curveHeightMm:3,style,backdrop}]})[0];
 assert.equal(curved.children.find(c=>c.op==='text.add').style.curveHeightMm,3);
 assert.ok(curved.children.some(c=>c.op==='graphic.add'));
});
