import test from 'node:test';
import assert from 'node:assert/strict';
import {publicToolData,publicCanvasText,canvasGuide,compactCanvasGuide,canvasOperations,validateCanvasOperations,lowerCanvasOperations,canvasOperationToolSchema} from '../creative-agent/runtime/canvas-interface.mjs';
import {creativeKnowledge} from '../creative-agent/runtime/creative-knowledge.mjs';
import {availableHarnessTools,selectHarnessTools} from '../creative-agent/runtime/tools.mjs';
import {createCreationAgentSession} from '../src/creation-agent-session.js';
import {draft} from '../src/domain.js';
test('model sees nine semantic operations and eight tools, without duplicate title/paper/recipe/workspace entry points',()=>{
 assert.equal(canvasOperations.length,9);const tools=selectHarnessTools(availableHarnessTools());assert.equal(tools.length,8);
 assert.ok(!tools.some(t=>t.function.name==='creation_recipe'));
 assert.ok(!tools.some(t=>t.function.name==='workspace'));
 assert.ok(!tools.some(t=>['creation_paper','creation_title','creation_phase','creation_review'].includes(t.function.name)));
 assert.deepEqual(tools.find(t=>t.function.name==='creation_apply').function.parameters.properties.operations.items.properties.op.enum,canvasOperations.map(x=>x.name));
 assert.ok(JSON.stringify(canvasGuide()).length<65000);
 assert.throws(()=>validateCanvasOperations([{op:'paper.add'}]),/未知/);
});
test('the concise prompt contract is generated from the executable operations',()=>{
 const guide=compactCanvasGuide();
 const loop=guide.capabilityCatalog.recipes.find(item=>item.methodId==='graphic-loop');
 assert.ok(loop.optional.includes('place')&&loop.optional.includes('size'));
 assert.ok(!loop.optional.includes('reference')&&!loop.optional.includes('widthMm'));
 assert.deepEqual(guide.operationParameters.map(({name})=>name),canvasOperations.map(({name})=>name));
 for(const operation of canvasOperations){
  const shown=guide.operationParameters.find(({name})=>name===operation.name);
  assert.equal(shown.summary,operation.summary);
  assert.deepEqual(guide.examples[operation.name],operation.examples||[operation.example]);
 }
 assert.ok(JSON.stringify(guide).length<24000);
 assert.ok(JSON.stringify(guide).length<JSON.stringify(canvasGuide()).length/2);
});
test('capability registry generates schema and validates type-specific props',()=>{
 const schema=canvasOperationToolSchema();
 assert.deepEqual(schema.properties.op.enum,canvasOperations.map(operation=>operation.name));
 assert.match(schema.properties.props.description,/Agent Canvas Manual/);
 assert.ok(compactCanvasGuide().objectParameters.kinds.paper.create.fields.texture);
 assert.ok(compactCanvasGuide().objectParameters.kinds.text.create.fields.content);
 const document={page:{layers:[{id:'paper',type:'shape',creationObject:{kind:'paper'}},{id:'body',type:'text'}]}};
 validateCanvasOperations([{op:'page',target:'page.right',props:{color:'#D8E5EB'}},{op:'update',target:'paper',place:{reference:'page',at:[40,50],unit:'mm'}}],{document});
 assert.deepEqual(lowerCanvasOperations([{op:'page',target:'page.right',props:{color:'#D8E5EB'}},{op:'update',target:'paper',place:{reference:'page',at:[40,50],unit:'mm'}}]),[{op:'page.update',page:'page.right',paperColor:'#D8E5EB'},{op:'layer.update',target:'paper',place:{reference:'page',at:[40,50],unit:'mm'}}]);
 assert.throws(()=>validateCanvasOperations([{op:'update',target:'paper',props:{content:'不应写到纸张能力'}}],{document}),/合同/);
 assert.throws(()=>validateCanvasOperations([{op:'update',target:'body',props:{texture:'不应写到文字能力'}}],{document}),/合同/);
});
test('half-page colors accept redundant plain pattern without sending it to the engine',()=>{
 const document={page:{paperPattern:'plain',layers:[]}};
 const operations=[{op:'page',target:'page.left',props:{color:'#F3EDE2',pattern:'plain'}},{op:'page',target:'page.right',props:{color:'#DDE5EB',pattern:'plain'}}];
 validateCanvasOperations(operations,{document});
 assert.deepEqual(lowerCanvasOperations(operations,{document}),[
  {op:'page.update',page:'page.left',paperColor:'#F3EDE2'},
  {op:'page.update',page:'page.right',paperColor:'#DDE5EB'}
 ]);
 assert.throws(()=>validateCanvasOperations([{op:'page',target:'page.left',props:{color:'#F3EDE2',pattern:'grid'}}],{document}),/只支持独立设置 color/);
});
test('canvas geometry defaults to mm while explicit ratios and font points remain distinct',()=>{
 const operations=[
  {op:'create',kind:'paper',id:'sheet',size:{width:65,height:80},style:{fill:'#E9DDD0'},place:{at:[.5,30]}},
  {op:'create',kind:'text',id:'heading',props:{content:'出门'},size:{width:45},style:{fontSizePt:24,color:'#354C60'},place:{reference:'node:sheet',anchor:'top-left',offset:{value:[5,6]}}},
  {op:'update',target:'heading',place:{at:[.5,.5],unit:'ratio'},size:{width:.4,unit:'ratio',reference:'page'}}
 ];
 validateCanvasOperations(operations);
 const lowered=lowerCanvasOperations(operations);
 assert.equal(lowered[0].place.unit,'mm');
 assert.equal(lowered[0].place.reference,'page');
 assert.equal(lowered[0].size.unit,'mm');
 assert.equal(lowered[1].place.offset.unit,'mm');
 assert.equal(lowered[1].size.unit,'mm');
 assert.equal(lowered[1].style.fontSizePt,24);
 assert.equal(lowered[2].place.unit,'ratio');
 assert.equal(lowered[2].size.unit,'ratio');
});
test('shape methods lower to the existing atomic crop, edge, split and cutout commands',()=>{
 const operations=[
  {op:'shape',method:'crop',target:'paper',mode:'keep',region:{shape:'rect',space:'local',unit:'ratio',box:[0,0,.8,.8]}},
  {op:'shape',method:'edge',target:'paper',edge:{style:'torn',edges:['bottom'],depthMm:1,seed:7}},
  {op:'shape',method:'split',target:'paper',split:{through:[.5,.5],unit:'ratio',rotationDeg:25},pieces:[{id:'left'},{id:'right'}]},
  {op:'shape',method:'cutout',cutoutKind:'window',target:'material',windowId:'opening',region:{shape:'rect',space:'local',unit:'ratio',box:[.2,.2,.6,.6]}}
 ];
 validateCanvasOperations(operations);
 assert.deepEqual(lowerCanvasOperations(operations).map(command=>command.op),['layer.cut','layer.update','layer.split','material.window']);
 assert.throws(()=>validateCanvasOperations([{op:'shape',method:'split',target:'paper',region:operations[0].region}]),/合同/);
});
test('advanced text controls and one combined title example are available in the initial guide',()=>{
 const guide=canvasGuide();
 const text=guide.capabilities.text.createProps.properties;
 const update=guide.capabilities.text.updateProps.properties;
 for(const key of ['effect','accentColor','layout','curveHeightMm','backdrop','runs','gapMm']){
  assert.ok(text[key].description?.length>3,key);
  assert.ok(update[key].description?.length>3,key);
 }
 const example=guide.operations.find(x=>x.name==='create').examples.find(x=>x.kind==='text');
 assert.equal(example.props.effect,'offset-outline');
 assert.equal(example.props.backdrop.kind,'band');
 validateCanvasOperations([structuredClone(example)]);
 const updateExample=guide.operations.find(x=>x.name==='update').example;
 assert.equal(updateExample.props.backdrop.kind,'band');
 validateCanvasOperations([structuredClone(updateExample)]);
});
test('one object language creates, splits, updates decorated text, groups and ungroups atomically',async()=>{
 const session=await createCreationAgentSession({draft:draft(),assets:[]});let serial=0;
 const apply=async operations=>{validateCanvasOperations(operations);const r=await session.execute([{name:'creation_apply',arguments:{protocolVersion:2,transactionId:'public-'+serial++,baseSceneRevision:session.revision,operations:lowerCanvasOperations(operations)}}]);assert.equal(r.results[0].ok,true,JSON.stringify(r));};
 await apply([{op:'create',kind:'paper',id:'p',size:{width:70,height:100},style:{fill:'#CCDDEE'}},{op:'create',kind:'text',id:'t',props:{content:'07',effect:'outline'},size:{width:45},style:{fontSizePt:28,color:'#334455'}}]);
 await apply([{op:'update',target:'t',style:{color:'#AA5544'}},{op:'shape',method:'split',target:'p',split:{through:[.5,.5],unit:'ratio',rotationDeg:20},pieces:[{id:'a'},{id:'b'}]}]);
 await apply([{op:'group',id:'g',targets:['t','a','b']},{op:'ungroup',target:'g',pieces:[{id:'a',place:{reference:'page',at:[40,50],unit:'mm'}}]}]);
 const t=session.draft.layers.find(n=>n.id==='t');assert.equal(t.creationObject.parameters.effect,'outline');assert.equal(t.creationObject.parameters.style.color,'#AA5544');
 await apply([{op:'copy',target:'t',id:'t2'},{op:'delete',target:'t2'}]);
});
test('neutral text options keep body text editable and advanced titles accept the same size shape',async()=>{
 const session=await createCreationAgentSession({draft:draft(),assets:[]});
 const operations=[
  {op:'create',kind:'text',id:'body',props:{content:'今天的风很轻。',backdrop:null,effect:'none'},size:{width:66,height:46,unit:'mm'},style:{fontSizePt:11,color:'#354C60'}},
  {op:'update',target:'body',props:{fit:{minFontSizePt:9,maxFontSizePt:11,maxLines:3}}},
  {op:'create',kind:'text',id:'title-sized',props:{content:'今日出门',effect:'offset-outline'},size:{width:52,height:17,unit:'mm'},style:{fontSizePt:26,color:'#354C60'}}
 ];
 validateCanvasOperations(operations);
 const commands=lowerCanvasOperations(operations);
 assert.deepEqual(commands.map(command=>command.op),['text.add','text.fit','title.add']);
 const result=await session.execute([{name:'creation_apply',arguments:{protocolVersion:2,transactionId:'text-size-parity',baseSceneRevision:session.revision,operations:commands}}]);
 assert.equal(result.results[0].ok,true,JSON.stringify(result));
 assert.equal(session.draft.layers.find(node=>node.id==='body')?.type,'text');
 assert.equal(session.draft.layers.find(node=>node.id==='title-sized')?.type,'group');
});
test('a named created object keeps its name through the real scene transaction',async()=>{
 const session=await createCreationAgentSession({draft:draft(),assets:[]});
 const operations=[{op:'create',kind:'paper',id:'named-paper',name:'日记底纸',size:{width:45,height:60},style:{fill:'#E9DDD0'}}];
 validateCanvasOperations(operations);
 const result=await session.execute([{name:'creation_apply',arguments:{protocolVersion:2,transactionId:'named-paper-create',baseSceneRevision:session.revision,operations:lowerCanvasOperations(operations)}}]);
 assert.equal(result.results[0].ok,true,JSON.stringify(result));
 assert.equal(session.draft.layers.find(node=>node.id==='named-paper')?.name,'日记底纸');
});
test('group child contracts are recursive and unsupported fields cannot be silently lost',()=>{
 assert.throws(()=>validateCanvasOperations([{op:'group',id:'g',children:[{op:'create',kind:'paper',id:'p',size:{width:20,height:20,unit:'mm'},style:{fill:'#CCDDEE'},invented:true}]}]),/合同/);
 assert.throws(()=>validateCanvasOperations([{op:'shape',target:'p',mode:'keep',region:{shape:'rect',space:'local',unit:'ratio',box:[0,0,1,1]},method:'invented'}]),/合同/);
});
test('public guidance rewriting preserves literal user content and requires a tape measure',()=>{
 const original={content:'read_skill title.add',parameters:{content:'creation_title'},guidance:'read_skill'};
 const result=publicToolData(original);assert.equal(result.content,original.content);assert.deepEqual(result.parameters,original.parameters);assert.equal(result.guidance,'knowledge(action=skill)');
 assert.throws(()=>validateCanvasOperations([{op:'create',kind:'tape',id:'t',asset:'a'}]),/合同/);
});
test('paper surface and explicit edge cutting are separate ordered operations',async()=>{
 const session=await createCreationAgentSession({draft:draft(),assets:[]});let serial=0;
 const create={op:'create',kind:'paper',id:'sheet',size:{width:70,height:100,unit:'mm'},style:{fill:'#CCDDEE',opacity:.7,paperSurface:{kind:'torn'}},place:{reference:'page',at:[50,70],unit:'mm'}};
 const cut={op:'shape',method:'edge',target:'sheet',edge:{style:'torn',edges:['bottom']}};
 const apply=async operations=>{validateCanvasOperations(operations);return session.execute([{name:'creation_apply',arguments:{protocolVersion:2,transactionId:'paper-edge-'+serial++,baseSceneRevision:session.revision,operations:lowerCanvasOperations(operations)}}]);};
 assert.throws(()=>validateCanvasOperations([{...create,edge:cut.edge}]),/合同/);
 assert.throws(()=>validateCanvasOperations([{op:'update',target:'sheet',edge:cut.edge}]),/合同/);
 const failed=await apply([cut,create]);assert.equal(failed.results[0].ok,false);assert.equal(session.draft.layers.length,0);
 const result=await apply([create,cut]);assert.equal(result.results[0].ok,true,JSON.stringify(result));
 const node=()=>session.draft.layers.find(n=>n.id==='sheet');
 assert.equal(node().paperSurface.kind,'torn');assert.ok(node().vectorMask);assert.equal(node().opacity,.7);
 const pose=[node().x,node().y,node().rotation];
 await apply([{...cut,edge:{style:'clean'}}]);assert.ok(!node().vectorMask);assert.equal(node().paperSurface.kind,'torn');assert.deepEqual([node().x,node().y,node().rotation],pose);
 await apply([{op:'shape',method:'split',target:'sheet',split:{through:[.5,.5],unit:'ratio',rotationDeg:25,edge:{style:'torn'}},pieces:[{id:'upper'},{id:'lower',place:{reference:'page',at:[90,120],unit:'mm'}}]}]);
 for(const id of ['upper','lower']){const part=session.draft.layers.find(n=>n.id===id);assert.ok(part);assert.equal(part.paperSurface.kind,'torn');assert.equal(part.opacity,.7);}
});
test('torn edge omits low-level seed and keeps a stable generated value',()=>{
 const first=[{op:'shape',method:'edge',target:'paper-a',edge:{style:'torn',edges:['bottom']}}];
 const second=structuredClone(first);
 validateCanvasOperations(first);validateCanvasOperations(second);
 assert.equal(first[0].edge.seed,second[0].edge.seed);
 assert.ok(Number.isInteger(first[0].edge.seed));
 assert.equal(first[0].edge.depthMm,undefined);
 assert.equal(lowerCanvasOperations(first)[0].edge.seed,first[0].edge.seed);
 const guide=compactCanvasGuide();
 assert.equal(guide.commonParameters.Edge.conditions?.length||0,0);
 assert.match(guide.basicRules.defaults,/稳定生成/);
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
 const commands=lowerCanvasOperations([{op:'update',target:'body',props:{content:'新的两段正文',fit:{minFontSizePt:8,maxFontSizePt:12}},size:{width:45,unit:'mm'}}],{document});
 assert.deepEqual(commands.map(x=>x.op),['layer.update','text.fit']);
 assert.equal(commands[0].content,'新的两段正文');
 assert.equal(commands[1].size.width,45);
 assert.equal(commands[1].size.height,60);
 assert.ok(!('content' in commands[1]));
 assert.throws(()=>lowerCanvasOperations([{op:'update',target:'new',size:{width:40,unit:'mm'},props:{fit:{minFontSizePt:8,maxFontSizePt:12}}}],{document}),/宽和高/);
});
test('a short heading can be fitted immediately after creation without restating its size',()=>{
 const operations=[
  {op:'create',kind:'text',id:'heading',props:{content:'出门小清单'},size:{width:38,unit:'mm'},style:{fontSizePt:14,color:'#334455'}},
  {op:'update',target:'heading',props:{fit:{minFontSizePt:10,maxFontSizePt:15,maxLines:1}}}
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
 await apply([{op:'create',kind:'text',id:'body',props:{content:'旧内容'},size:{width:60,unit:'mm'},style:{fontSizePt:12,color:'#334455'}}]);
 await apply([{op:'update',target:'body',props:{content:'新的一段文字',fit:{minFontSizePt:8,maxFontSizePt:12}},size:{width:50,height:25,unit:'mm'}}]);
 assert.equal(session.draft.layers.find(node=>node.id==='body').content,'新的一段文字');
});
test('an explicit placement point takes precedence over a repeated reference anchor',()=>{
 const operations=[{op:'update',target:'title',place:{reference:'page',referenceAnchor:'top-left',anchor:'top-left',at:[72,14],unit:'mm'}}];
 validateCanvasOperations(operations);
 assert.deepEqual(lowerCanvasOperations(operations),[{op:'layer.update',target:'title',place:{reference:'page',anchor:'top-left',at:[72,14],unit:'mm'}}]);
});
test('an unambiguous node offset inherits its target anchor',()=>{
 const operations=[{op:'create',kind:'text',id:'body',props:{content:'一段话'},size:{width:42,unit:'mm'},place:{reference:'node:paper',anchor:'top-left',offset:{value:[5,6],unit:'mm'}}}];
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
test('live P knowledge names the unified canvas operations instead of retired entry points',()=>{
 const text=publicCanvasText(creativeKnowledge);
 for(const oldName of ['material.tear','creation_recipe','creation_title','material.cut'])assert.ok(!text.includes(oldName),oldName);
 assert.match(text,/shape\(method=split, split.edge.style=torn\)/);
 assert.match(text,/creation_apply 中的 recipe/);
});
test('model-facing placement contract says at defaults to the object center',()=>{
 const guide=compactCanvasGuide();
 assert.match(guide.basicRules.placement,/默认 anchor:center/);
 assert.match(guide.basicRules.placement,/at:\[10,10\].*不是对象左上角/);
 assert.match(guide.basicRules.placement,/page.left\/page.right/);
 assert.match(guide.basicRules.placement,/page.right,at:\[20,40\]/);
 assert.match(canvasOperationToolSchema().properties.place.description,/anchor 省略时为对象中心/);
 assert.match(canvasOperationToolSchema().properties.place.description,/page.right,at:\[20,40\]/);
});
