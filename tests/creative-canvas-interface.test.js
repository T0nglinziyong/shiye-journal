import test from 'node:test';
import assert from 'node:assert/strict';
import {publicToolData,canvasGuide,canvasOperations,validateCanvasOperations,lowerCanvasOperations} from '../creative-agent/runtime/canvas-interface.mjs';
import {availableHarnessTools,selectHarnessTools} from '../creative-agent/runtime/tools.mjs';
import {createCreationAgentSession} from '../src/creation-agent-session.js';
import {draft} from '../src/domain.js';
test('model sees eight operations and ten tools, without duplicate title/paper entry points',()=>{
 assert.equal(canvasOperations.length,8);const tools=selectHarnessTools(availableHarnessTools());assert.equal(tools.length,10);
 assert.ok(!tools.some(t=>['creation_paper','creation_title','creation_phase','creation_review'].includes(t.function.name)));
 assert.deepEqual(tools.find(t=>t.function.name==='creation_apply').function.parameters.properties.operations.items.properties.op.enum,canvasOperations.map(x=>x.name));
 assert.ok(JSON.stringify(canvasGuide()).length<60000);
 assert.throws(()=>validateCanvasOperations([{op:'paper.add'}]),/未知/);
});
test('advanced text controls and one combined title example are available in the initial guide',()=>{
 const guide=canvasGuide();
 const text=guide.operations.find(x=>x.name==='create').parameters.oneOf.find(x=>x.properties.kind.const==='text').properties;
 const update=guide.operations.find(x=>x.name==='update').parameters.properties;
 for(const key of ['effect','accentColor','layout','curveHeightMm','backdrop','runs','gapMm']){
  assert.ok(text[key].description?.length>10,key);
  assert.ok(update[key].description?.length>10,key);
 }
 const example=guide.operations.find(x=>x.name==='create').examples.find(x=>x.kind==='text');
 assert.equal(example.effect,'offset-outline');
 assert.equal(example.backdrop.kind,'band');
 validateCanvasOperations([structuredClone(example)]);
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
test('public guidance rewriting preserves literal user content and requires a tape measure',()=>{
 const original={content:'read_skill title.add',parameters:{content:'creation_title'},guidance:'read_skill'};
 const result=publicToolData(original);assert.equal(result.content,original.content);assert.deepEqual(result.parameters,original.parameters);assert.equal(result.guidance,'knowledge(action=skill)');
 assert.throws(()=>validateCanvasOperations([{op:'create',kind:'tape',id:'t',asset:'a'}]),/合同/);
});
test('paper surface and explicit edge cutting are separate ordered operations',async()=>{
 const session=await createCreationAgentSession({draft:draft(),assets:[]});let serial=0;
 const create={op:'create',kind:'paper',id:'sheet',size:{width:70,height:100,unit:'mm'},style:{fill:'#CCDDEE',opacity:.7,paperSurface:{kind:'torn'}},place:{reference:'page',at:[50,70],unit:'mm'}};
 const cut={op:'cut',method:'edge',target:'sheet',edge:{style:'torn',edges:['bottom'],depthMm:1,seed:42}};
 const apply=async operations=>{validateCanvasOperations(operations);return session.execute([{name:'creation_apply',arguments:{protocolVersion:2,transactionId:'paper-edge-'+serial++,baseSceneRevision:session.revision,operations:lowerCanvasOperations(operations)}}]);};
 assert.throws(()=>validateCanvasOperations([{...create,edge:cut.edge}]),/合同/);
 assert.throws(()=>validateCanvasOperations([{op:'update',target:'sheet',edge:cut.edge}]),/合同/);
 const failed=await apply([cut,create]);assert.equal(failed.results[0].ok,false);assert.equal(session.draft.layers.length,0);
 const result=await apply([create,cut]);assert.equal(result.results[0].ok,true,JSON.stringify(result));
 const node=()=>session.draft.layers.find(n=>n.id==='sheet');
 assert.equal(node().paperSurface.kind,'torn');assert.ok(node().vectorMask);assert.equal(node().opacity,.7);
 const pose=[node().x,node().y,node().rotation];
 await apply([{...cut,edge:{style:'clean'}}]);assert.ok(!node().vectorMask);assert.equal(node().paperSurface.kind,'torn');assert.deepEqual([node().x,node().y,node().rotation],pose);
 await apply([{op:'split',target:'sheet',split:{through:[.5,.5],unit:'ratio',rotationDeg:25,edge:{style:'torn',seed:42}},pieces:[{id:'upper'},{id:'lower',place:{reference:'page',at:[90,120],unit:'mm'}}]}]);
 for(const id of ['upper','lower']){const part=session.draft.layers.find(n=>n.id===id);assert.ok(part);assert.equal(part.paperSurface.kind,'torn');assert.equal(part.opacity,.7);}
});

test('unknown create kind reports the discriminator, not unrelated missing fields',()=>{
 for(const kind of [undefined,'create_placeholder_guard','shape']){
  assert.throws(()=>validateCanvasOperations([{op:'create',kind,id:'noop'}]),error=>{
   assert.match(error.message,/create.kind.*material\/text\/paper\/graphic\/tape/);
   assert.doesNotMatch(error.message,/missingProperty|missing.*content|missing.*asset/);
   return true;
  });
 }
});
test('sparse text fit reuses the existing height and applies new content before measurement',()=>{
 const document={page:{canvas:{height:1000},physicalPageHeightMM:200,layers:[{id:'body',type:'text',width:250,height:300,content:'旧内容'}]}};
 const commands=lowerCanvasOperations([{op:'update',target:'body',content:'新的两段正文',size:{width:45,unit:'mm'},fit:{minFontSizePt:8,maxFontSizePt:12}}],{document});
 assert.deepEqual(commands.map(x=>x.op),['layer.update','text.fit']);
 assert.equal(commands[0].content,'新的两段正文');
 assert.equal(commands[1].size.width,45);
 assert.equal(commands[1].size.height,60);
 assert.ok(!('content' in commands[1]));
 assert.throws(()=>lowerCanvasOperations([{op:'update',target:'new',size:{width:40,unit:'mm'},fit:{minFontSizePt:8,maxFontSizePt:12}}],{document}),/宽和高/);
});
test('a short heading can be fitted immediately after creation without restating its size',()=>{
 const operations=[
  {op:'create',kind:'text',id:'heading',content:'出门小清单',size:{width:38,unit:'mm'},style:{fontSizePt:14,color:'#334455'}},
  {op:'update',target:'heading',fit:{minFontSizePt:10,maxFontSizePt:15,maxLines:1}}
 ];
 validateCanvasOperations(operations);
 const commands=lowerCanvasOperations(operations,{document:{page:{canvas:{height:1000},physicalPageHeightMM:200,layers:[]}}});
 assert.deepEqual(commands.map(x=>x.op),['text.add','text.fit']);
 assert.equal(commands[1].size.width,38);
 assert.ok(commands[1].size.height>=8);
});
test('content and fit execute as one atomic sparse update',async()=>{
 const session=await createCreationAgentSession({draft:draft(),assets:[]});let serial=0;
 const apply=async operations=>{
  validateCanvasOperations(operations);
  const commands=lowerCanvasOperations(operations,{document:{page:session.draft}});
  const result=await session.execute([{name:'creation_apply',arguments:{protocolVersion:2,transactionId:'fit-'+serial++,baseSceneRevision:session.revision,operations:commands}}]);
  assert.equal(result.results[0].ok,true,JSON.stringify(result));
 };
 await apply([{op:'create',kind:'text',id:'body',content:'旧内容',size:{width:60,unit:'mm'},style:{fontSizePt:12,color:'#334455'}}]);
 await apply([{op:'update',target:'body',content:'新的一段文字',size:{width:50,height:25,unit:'mm'},fit:{minFontSizePt:8,maxFontSizePt:12}}]);
 assert.equal(session.draft.layers.find(node=>node.id==='body').content,'新的一段文字');
});
test('an explicit placement point takes precedence over a repeated reference anchor',()=>{
 const operations=[{op:'update',target:'title',place:{reference:'page',referenceAnchor:'top-left',anchor:'top-left',at:[72,14],unit:'mm'}}];
 validateCanvasOperations(operations);
 assert.deepEqual(lowerCanvasOperations(operations),[{op:'layer.update',target:'title',place:{reference:'page',anchor:'top-left',at:[72,14],unit:'mm'}}]);
});
test('an unambiguous node offset inherits its target anchor',()=>{
 const operations=[{op:'create',kind:'text',id:'body',content:'一段话',size:{width:42,unit:'mm'},place:{reference:'node:paper',anchor:'top-left',offset:{value:[5,6],unit:'mm'}}}];
 validateCanvasOperations(operations);
 assert.equal(operations[0].place.referenceAnchor,'top-left');
 assert.equal(lowerCanvasOperations(operations)[0].place.referenceAnchor,'top-left');
});
test('model commentary is ignored without loosening unknown drawing fields',()=>{
 const note={op:'create',kind:'paper',id:'paper',size:{width:30,height:40,unit:'mm'},style:{fill:'#EEE8DD'},op_note:'作为标题底纸'};
 validateCanvasOperations([note]);
 assert.ok(!('op_note' in note));
 assert.throws(()=>validateCanvasOperations([{...note,randomField:true}]),/additionalProperties/);
});
