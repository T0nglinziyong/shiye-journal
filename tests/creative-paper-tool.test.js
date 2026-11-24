import test from 'node:test';
import assert from 'node:assert/strict';
import {paperTool,compilePaperOperations} from '../creative-agent/runtime/paper-tool.mjs';
import {availableHarnessTools,selectHarnessTools} from '../creative-agent/runtime/tools.mjs';
import {validateValue} from '../src/creative-contract.js';
import {draft} from '../src/domain.js';
import {createCreationDocument} from '../src/creation-document.js';
import {applyCreationTransaction,creationSceneRevision} from '../src/creation-transaction.js';
import {inspectCreationDocument} from '../src/creation-inspection.js';
const paper={id:'paper1',style:{fill:'#F1E5C9'},texture:'rough',edge:{style:'torn',seed:42},pattern:'ruled',translucency:.3,place:{reference:'page',at:[50,50],unit:'mm'},size:{width:60,height:70,unit:'mm'},order:{edge:'back'}};
test('paper is initially available, defaults layering and rejects unknown texture',()=>{
 assert.ok(selectHarnessTools(availableHarnessTools()).some(t=>t.function.name==='creation_paper'));
 const args={transactionId:'paper',baseSceneRevision:'sha256:'+'a'.repeat(64),papers:[paper]};
 validateValue(args,paperTool.function.parameters);
 assert.throws(()=>validateValue({...args,papers:[{...paper,texture:'glossy'}]},paperTool.function.parameters));
 const {order,...missing}=paper;assert.doesNotThrow(()=>validateValue({...args,papers:[missing]},paperTool.function.parameters));
});
test('paper uses editable graphics, preserves source and honors atomic retry/rollback',async()=>{
 const base=await createCreationDocument({draft:draft(),assets:[]});
 const input={protocolVersion:2,transactionId:'papers',baseSceneRevision:creationSceneRevision(base),operations:compilePaperOperations({papers:[paper]})};
 const result=applyCreationTransaction(base,input,[]),layers=inspectCreationDocument(result.document).layers;
 assert.equal(layers.length,1);const node=result.document.page.layers[0];
 assert.equal(node.kind,'paper');assert.equal(node.shapeOptions.grain,.9);assert.ok(node.vectorMask);assert.equal(node.shapeOptions.paperPattern,'ruled');assert.equal(node.shapeOptions.translucency,.3);
 assert.ok(!node.shadow);assert.deepEqual(result.document.source,base.source);
 assert.equal(applyCreationTransaction(result.document,input,[]).changed,false);
 const before=JSON.stringify(base);
 assert.throws(()=>applyCreationTransaction(base,{...input,operations:compilePaperOperations({papers:[paper,{...paper,id:'bad',order:{before:'missing'}}]})},[]));
 assert.equal(JSON.stringify(base),before);
});
