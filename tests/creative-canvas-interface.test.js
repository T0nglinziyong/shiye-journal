import test from 'node:test';
import assert from 'node:assert/strict';
import {publicToolData,canvasGuide,canvasOperations,validateCanvasOperations,lowerCanvasOperations} from '../creative-agent/runtime/canvas-interface.mjs';
import {availableHarnessTools,selectHarnessTools} from '../creative-agent/runtime/tools.mjs';
import {createCreationAgentSession} from '../src/creation-agent-session.js';
import {worldBox} from '../src/scene-spatial.js';
import {draft} from '../src/domain.js';
test('model sees eight operations and ten tools, without duplicate title/paper entry points',()=>{
 assert.equal(canvasOperations.length,8);const tools=selectHarnessTools(availableHarnessTools());assert.equal(tools.length,10);
 assert.ok(!tools.some(t=>['creation_paper','creation_title','creation_phase','creation_review'].includes(t.function.name)));
 assert.deepEqual(tools.find(t=>t.function.name==='creation_apply').function.parameters.properties.operations.items.properties.op.enum,canvasOperations.map(x=>x.name));
 assert.ok(JSON.stringify(canvasGuide()).length<60000);
 assert.throws(()=>validateCanvasOperations([{op:'paper.add'}]),/未知/);
});
test('one object language creates, splits, updates decorated text, groups and ungroups atomically',async()=>{
 const session=await createCreationAgentSession({draft:draft(),assets:[]});let serial=0;
 const apply=async operations=>{validateCanvasOperations(operations);const r=await session.execute([{name:'creation_apply',arguments:{protocolVersion:2,transactionId:'public-'+serial++,baseSceneRevision:session.revision,operations:lowerCanvasOperations(operations)}}]);assert.equal(r.results[0].ok,true,JSON.stringify(r));};
 await apply([{op:'create',kind:'paper',id:'p',size:{width:70,height:100,unit:'mm'},style:{fill:'#CCDDEE'}},{op:'create',kind:'text',id:'t',content:'07',size:{width:45,unit:'mm'},style:{fontSizePt:28,color:'#334455'},effect:'outline'}]);
 await apply([{op:'update',target:'t',style:{color:'#AA5544'}},{op:'split',target:'p',split:{through:[.5,.5],unit:'ratio',rotationDeg:20},pieces:[{id:'a'},{id:'b'}]}]);
 await apply([{op:'group',id:'g',targets:['t','a','b']},{op:'ungroup',target:'g',pieces:[{id:'a',place:{reference:'page',at:[40,50],unit:'mm'}}]}]);
 const t=session.draft.layers.find(n=>n.id==='t');assert.equal(t.creationObject.parameters.effect,'outline');assert.equal(t.creationObject.parameters.style.color,'#AA5544');
 await apply([{op:'copy',target:'t',id:'t2'},{op:'delete',target:'t2'}]);
});
test('group child contracts are recursive and unsupported fields cannot be silently lost',()=>{
 assert.throws(()=>validateCanvasOperations([{op:'group',id:'g',children:[{op:'create',kind:'paper',id:'p',size:{width:20,height:20,unit:'mm'},style:{fill:'#CCDDEE'},invented:true}]}]),/合同/);
 assert.throws(()=>validateCanvasOperations([{op:'cut',target:'p',mode:'keep',region:{shape:'rect',space:'local',unit:'ratio',box:[0,0,1,1]},method:'invented'}]),/合同/);
});
test('ordinary text can gain techniques later without a title-specific entry',async()=>{
 const session=await createCreationAgentSession({draft:draft(),assets:[]});let serial=0;
 const apply=async operations=>{validateCanvasOperations(operations);const r=await session.execute([{name:'creation_apply',arguments:{protocolVersion:2,transactionId:'text-'+serial++,baseSceneRevision:session.revision,operations:lowerCanvasOperations(operations)}}]);assert.equal(r.results[0].ok,true,JSON.stringify(r.results));};
 await apply([{op:'create',kind:'text',id:'date',content:'11.25',size:{width:45,unit:'mm'},style:{fontSizePt:22,color:'#334455'},place:{reference:'page',at:[50,60],unit:'mm',rotationDeg:7}}]);
 const before=worldBox(session.draft,'date');
 await apply([{op:'update',target:'date',effect:'outline',accentColor:'#CCAA77',backdrop:{kind:'dots'}}]);
 const node=session.draft.layers.find(n=>n.id==='date');assert.equal(node.type,'group');const after=worldBox(session.draft,'date');for(const k of ['cx','cy','rotation'])assert.ok(Math.abs(after[k]-before[k])<1e-6,k);assert.equal(node.creationObject.parameters.content,'11.25');assert.equal(node.creationObject.parameters.style.color,'#334455');
 await apply([{op:'update',target:'date',style:{color:'#AA5533'}}]);
 assert.equal(session.draft.layers.find(n=>n.id==='date').creationObject.parameters.backdrop.kind,'dots');
});

test('public guidance rewriting preserves literal user content and requires a tape measure',()=>{
 const original={content:'read_skill title.add',parameters:{content:'creation_title'},guidance:'read_skill'};
 const result=publicToolData(original);assert.equal(result.content,original.content);assert.deepEqual(result.parameters,original.parameters);assert.equal(result.guidance,'knowledge(action=skill)');
 assert.throws(()=>validateCanvasOperations([{op:'create',kind:'tape',id:'t',asset:'a'}]),/合同/);
});
