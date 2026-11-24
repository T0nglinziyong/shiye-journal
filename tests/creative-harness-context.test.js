import test from 'node:test';
import assert from 'node:assert/strict';
import {modelContext,isCreativeSnapshot,creativeCompactionCandidate,creativeCompactionTranscript,fallbackCreativeMemory,recommendCreationSkills,shortlistCreationMethods,iterationAdvice,initialToolGuide,compactInitialToolGuide,failureGuidance} from '../creative-agent/runtime/context.mjs';
import {loadCreationSkills} from '../creative-agent/runtime/skills.mjs';

test('initial tape guidance uses frozen source type rather than appearance or title',()=>{
 const source={textMode:'none',materials:[{alias:'long-paper',assetID:'a'},{alias:'real-tape',assetID:'b'}],sourceSnapshots:[{assetID:'a',kind:'paper',title:'胶带图案长条纸'},{assetID:'b',kind:'tape',title:'花纹'}]};
 assert.deepEqual(initialToolGuide({source}).tapeAliases,['real-tape']);
 source.materials.pop();
 const guide=initialToolGuide({source});assert.deepEqual(guide.tapeAliases,[]);assert.ok(guide.notes.some(n=>n.includes('本次没有胶带')));
});

test('real Pi parameter mistakes receive exact correction in the LangGraph path',()=>{
 const stroke=failureGuidance('creation_apply',{operations:[{op:'graphic.add',geometry:{kind:'stroke'},style:{strokeDash:'dot'}}]},{path:'operations/0/style/strokeDash'});
 assert.match(stroke.hint,/geometry.*unit/);assert.match(stroke.hint,/strokeDash/);
 const reflow=failureGuidance('creation_apply',{operations:[{op:'text.reflow',size:{width:20}}]},{path:'operations/0/size'});
 assert.match(reflow.hint,/layer.update/);
});

test('an outdated task contract fails before any model invocation',async()=>{
  const {createCreationDocument}=await import('../src/creation-document.js');
  const {draft}=await import('../src/domain.js');
  const {initialHarnessState}=await import('../creative-agent/runtime/agent.mjs');
  const {taskFingerprint}=await import('../src/task-fingerprint.js');
  const document=await createCreationDocument({draft:draft(),assets:[]});
  document.source.schemaHash='sha256:'+'0'.repeat(64);
  document.source.taskHash=await taskFingerprint(document.source);
  assert.throws(()=>initialHarnessState({document,skills:{catalog(){throw Error('must not load');}},brief:{}}),/合同已变化/);
});

test('model context keeps the global index and tool pair but only the latest preview',()=>{
  const system={role:'system',content:'system'};
  const source={role:'user',content:[{type:'image_url',image_url:{url:'source'}}]};
  const reasoning={role:'assistant',reasoning_content:'required provider reasoning',tool_calls:[{id:'call'}]};
  const receipt={role:'tool',tool_call_id:'call',content:'receipt'};
  const previews=Array.from({length:5},(_,i)=>({role:'user',content:[{type:'text',text:'当前真实画面：'+i+'\n最新 Scene：many coordinates'},{type:'image_url',image_url:{url:'preview'+i}}]}));
  const input=[system,source,reasoning,receipt,...previews],before=JSON.stringify(input),out=modelContext(input);
  assert.equal(out[0],system);assert.deepEqual(out[1],source);assert.equal(out[2],reasoning);assert.equal(out[3],receipt);assert.equal(out.at(-1),previews.at(-1));
  assert.equal(out.filter(m=>Array.isArray(m.content)).length,2);assert.equal(JSON.stringify(input),before);
});

test('adding the first stage prompt cannot alter checkpoint messages or move the source index',()=>{
 const messages=[{role:'system',content:'rules'},{role:'user',content:'original source index'}];
 const request=modelContext(messages);
 request.splice(1,0,{role:'system',content:'stage'});
 assert.equal(messages.length,2);
 assert.equal(messages[1].content,'original source index');
 assert.deepEqual(request.map(message=>message.role),['system','system','user']);
});

test('a preview does not mutate the source message and invalidate its cache prefix',()=>{
 const source={role:'user',content:[{type:'text',text:'素材清单'},{type:'text',text:'全局素材编号图；始终可对照此图。'},{type:'image_url',image_url:{url:'source-board'}}]};
 const preview={role:'user',content:[{type:'text',text:'当前真实画面：first'},{type:'image_url',image_url:{url:'page'}}]};
 const messages=[{role:'system',content:'rules'},source,{role:'assistant',content:'试摆完成'},preview];
 const before=modelContext(messages,{qualityFrames:[]});
 const after=modelContext(messages,{qualityFrames:[{pngHash:'first'}]});
 assert.equal(before[1].content.filter(part=>part.type==='image_url').length,1);
 assert.deepEqual(after[1],before[1]);
 assert.equal(after.at(-1),preview);
 assert.equal(source.content[2].image_url.url,'source-board');
});

test('current snapshot supplies the complete Scene rather than a revision or delta',async()=>{
 const {createCreationDocument}=await import('../src/creation-document.js');
 const {draft}=await import('../src/domain.js');
 const document=await createCreationDocument({draft:draft(),assets:[]});
 const preview={role:'user',content:[{type:'text',text:'当前真实画面：{"sceneRevision":"current"}\n最新 Scene：{"layers":[{"id":"visible"}]}'},{type:'image_url',image_url:{url:'preview'}}]};
 const out=modelContext([{role:'system',content:'rules'},{role:'user',content:'input'},{role:'assistant',content:'edit'},preview],{document,phase:'composition'});
 const summary=JSON.parse(out.at(-1).content.replace('当前创作状态（由检查点生成）：',''));
 assert.ok(Array.isArray(summary.scene.layers));assert.ok(Array.isArray(summary.scene.layerTree));
 assert.equal(out.filter(m=>isCreativeSnapshot(m)).length,2);
});

test('model context stays bounded as checkpoint history grows',()=>{
 const system={role:'system',content:'instructions'},index={role:'user',content:[{type:'text',text:'素材索引'},{type:'image_url',image_url:{url:'index'}}]};
 const messages=[system,index];
 for(let i=0;i<80;i++)messages.push({role:'assistant',tool_calls:[{id:'call-'+i,function:{name:'creation_apply'}}]},{role:'tool',tool_call_id:'call-'+i,content:'{"ok":true}'},{role:'user',content:[{type:'text',text:'当前真实画面：'+i},{type:'image_url',image_url:{url:'preview-'+i}}]});
 const out=modelContext(messages,{compactedUntil:2+72*3});
 assert.equal(out[0],system);assert.deepEqual(out[1],index);
 assert.ok(out.length<=30);assert.equal(out.filter(m=>m.role==='assistant').length,8);
 assert.equal(out.filter(m=>m.role==='tool').length,8);assert.equal(out.filter(m=>m.role==='user'&&Array.isArray(m.content)&&m.content[0].text.startsWith('当前真实画面')).length,1);
 assert.equal(out.filter(m=>m.role==='user').flatMap(m=>Array.isArray(m.content)?m.content:[]).filter(p=>p.type==='image_url').length,2);
});

test('recent DeepSeek tool turns keep their complete reasoning content',()=>{
 const messages=[{role:'system',content:'rules'},{role:'user',content:'source'}];
 for(let i=0;i<7;i++)messages.push({role:'assistant',reasoning_content:'reason-'+i,tool_calls:[{id:'r'+i,function:{name:'creation_apply',arguments:'{}'}}]},{role:'tool',tool_call_id:'r'+i,content:'{"ok":true}'});
 const out=modelContext(messages);
 assert.deepEqual(out.filter(m=>m.role==='assistant').map(m=>m.reasoning_content),Array.from({length:7},(_,i)=>'reason-'+i));
});

test('parameter help remains unchanged until a compaction boundary',()=>{
 const messages=[{role:'system',content:'rules'},{role:'user',content:'source'}];
 for(let i=0;i<3;i++)messages.push({role:'assistant',tool_calls:[{id:'h'+i,function:{name:'creation_help',arguments:'{}'}}]},{role:'tool',tool_call_id:'h'+i,content:'{"ok":true,"data":"'+('long schema '.repeat(100))+'"}'});
 const out=modelContext(messages);
 assert.equal(out.find(m=>m.tool_call_id==='h0'),messages[3]);
 assert.ok(out.find(m=>m.tool_call_id==='h2').content.length>1000);
 const calls=new Set(out.flatMap(m=>m.role==='assistant'?(m.tool_calls||[]).map(call=>call.id):[]));
 assert.ok(out.filter(m=>m.role==='tool').every(m=>calls.has(m.tool_call_id)));
});

test('material detail images remain stable until compaction',()=>{
 const system={role:'system',content:'instructions'},index={role:'user',content:[{type:'image_url',image_url:{url:'index'}}]};
 const inspect={role:'assistant',tool_calls:[{id:'inspect',function:{name:'inspect_materials'}}]};
 const result={role:'tool',tool_call_id:'inspect',content:'{"ok":true}'};
 const details={role:'user',content:[{type:'text',text:'素材 A'},{type:'image_url',image_url:{url:'detailA'}},{type:'image_url',image_url:{url:'detailB'}}]};
 const before=modelContext([system,index,inspect,result,details]);
 assert.equal(before.filter(message=>message===details).length,1);
 const after=modelContext([system,index,inspect,result,details,{role:'assistant',content:'已看过局部细节'}, {role:'user',content:'下一步'}]);
 assert.equal(after.some(message=>message===details),true);
 assert.equal(after.filter(message=>message.role==='user').flatMap(message=>Array.isArray(message.content)?message.content:[]).filter(part=>part.type==='image_url').length,3);
});

test('one studied tutorial remains available for comparison after planning and history windowing',()=>{
 const messages=[{role:'system',content:'rules'},{role:'user',content:'input'},
  {role:'assistant',tool_calls:[{id:'study',function:{name:'read_skill'}}]},
  {role:'tool',tool_call_id:'study',content:'{"ok":true}'},
  {role:'user',content:[{type:'text',text:'教程示意（仅供方法参考）：旧例'},{type:'image_url',image_url:{url:'old-example'}},
    {type:'text',text:'教程示意（仅供方法参考）：框架与成品'},{type:'image_url',image_url:{url:'paired-example'}}]}];
 for(let i=0;i<12;i++)messages.push({role:'assistant',content:'调整构思'+i},{role:'user',content:'继续'});
 const before=JSON.stringify(messages),out=modelContext(messages,{compactedUntil:15});
 const images=out.flatMap(m=>Array.isArray(m.content)?m.content:[]).filter(p=>p.type==='image_url');
 assert.deepEqual(images.map(p=>p.image_url.url),['paired-example']);
 assert.equal(JSON.stringify(messages),before);
 const again=modelContext(out);
 assert.equal(again.flatMap(m=>Array.isArray(m.content)?m.content:[]).filter(p=>p.image_url?.url==='paired-example').length,1);
});

test('the latest preview remains visible after read-only help instead of becoming only a hash',async()=>{
 const {createCreationDocument}=await import('../src/creation-document.js');
 const {draft}=await import('../src/domain.js');
 const document=await createCreationDocument({draft:draft(),assets:[]});
 const preview={role:'user',content:[{type:'text',text:'当前真实画面：{"pngHash":"sha256:abc"}'},{type:'image_url',image_url:{url:'data:image/png;base64,dGVzdA=='}}]};
 const messages=[{role:'system',content:'instructions'},{role:'user',content:[{type:'text',text:'index'}]},{role:'assistant',tool_calls:[]},preview];
 assert.equal(modelContext(messages,{document,preview:{pngHash:'sha256:abc',sceneRevision:'revision'}}).flatMap(m=>Array.isArray(m.content)?m.content:[]).filter(p=>p.image_url?.url==='data:image/png;base64,dGVzdA==').length,1);
 messages.push({role:'assistant',tool_calls:[{id:'help',function:{name:'creation_help',arguments:'{}'}}]},{role:'tool',tool_call_id:'help',content:'{"ok":true}'});
 const next=modelContext(messages,{document,preview:{pngHash:'sha256:abc',sceneRevision:'revision'}});
 assert.equal(next.flatMap(m=>Array.isArray(m.content)?m.content:[]).filter(p=>p.image_url?.url==='data:image/png;base64,dGVzdA==').length,1);
 assert.match(next.at(-1).content,/sha256:abc/);
});

test('creative compaction carries design decisions and rejected attempts into later turns',async()=>{
 const messages=[{role:'system',content:'instructions'},{role:'user',content:[{type:'image_url',image_url:{url:'index'}}]}];
 for(let i=0;i<13;i++)messages.push(
   {role:'assistant',content:i===1?'试过居中排布，但主图太拥挤，改为左侧留白。':null,reasoning_content:'private reasoning',tool_calls:[{id:'c'+i,function:{name:'creation_apply',arguments:JSON.stringify({transactionId:'t'+i,operations:[{op:'layer.update',target:'photo',place:{surface:'page',at:[i,40]}}]})}}]},
   {role:'tool',tool_call_id:'c'+i,content:'{"ok":true}'},
   {role:'user',content:[{type:'text',text:'当前真实画面：'+i},{type:'image_url',image_url:{url:'preview'+i}}]}
 );
 const candidate=creativeCompactionCandidate(messages,{compactedUntil:2,usage:[{prompt_tokens:610000}],phaseReviews:[{from:'layout',to:'craft',messageIndex:17}]});
 assert.ok(candidate);assert.equal(candidate.history.filter(m=>m.role==='assistant').length,11);
 assert.match(JSON.stringify(candidate.history),/主图太拥挤/);
 assert.doesNotMatch(JSON.stringify(candidate.history),/private reasoning|preview0/);
 const {createCreationDocument}=await import('../src/creation-document.js');
 const {draft}=await import('../src/domain.js');
 const state={compactedUntil:candidate.cutoff,creativeMemory:'居中排布拥挤，改为左侧留白。',document:await createCreationDocument({draft:draft(),assets:[]})};
 const out=modelContext(messages,state);
 assert.match(out[2].content,/居中排布拥挤，改为左侧留白/);
 assert.equal(out.filter(m=>m.role==='assistant').length,2);
 assert.equal(out.filter(m=>m.role==='user'&&Array.isArray(m.content)).length,2);
});

test('compaction never starts between two responses to one assistant tool batch',()=>{
 const messages=[{role:'system',content:'rules'},{role:'user',content:'input'}];
 for(let i=0;i<12;i++)messages.push({role:'assistant',tool_calls:[{id:'a'+i,function:{name:'creation_apply',arguments:'{}'}}]},{role:'tool',tool_call_id:'a'+i,content:'{"ok":true}'});
 messages.push({role:'assistant',tool_calls:[{id:'first',function:{name:'creation_phase',arguments:'{}'}},{id:'second',function:{name:'creation_help',arguments:'{}'}}]},{role:'tool',tool_call_id:'first',content:'{"ok":true}'},{role:'tool',tool_call_id:'second',content:'{"ok":true}'});
 const cutoff=messages.length-1;
 const candidate=creativeCompactionCandidate(messages,{compactedUntil:2,usage:[{prompt_tokens:610000}],phaseReviews:[{messageIndex:cutoff}]});
 assert.ok(candidate.cutoff<messages.length-3);
 const context=modelContext(messages,{compactedUntil:cutoff});
 const calls=new Set(context.flatMap(message=>message.role==='assistant'?(message.tool_calls||[]).map(call=>call.id):[]));
 assert.ok(context.filter(message=>message.role==='tool').every(message=>calls.has(message.tool_call_id)));
 assert.ok(context.some(message=>message.role==='assistant'&&message.tool_calls?.length===2));
});

test('soft creative loops compact completed turns without a phase transition',()=>{
 const messages=[{role:'system',content:'rules'},{role:'user',content:'input'}];
 for(let i=0;i<13;i++)messages.push({role:'assistant',tool_calls:[{id:'a'+i,function:{name:'creation_apply',arguments:'{}'}}]},{role:'tool',tool_call_id:'a'+i,content:'{"ok":true}'});
 assert.equal(creativeCompactionCandidate(messages,{compactedUntil:2,usage:[{prompt_tokens:30000}]}),null);
 const candidate=creativeCompactionCandidate(messages,{compactedUntil:2,usage:[{prompt_tokens:610000}],phaseReviews:[]});
 assert.ok(candidate);
 assert.equal(candidate.history.filter(item=>item.role==='assistant').length,11);
 assert.equal(messages[candidate.cutoff].role,'assistant');
});

test('an old phase marker does not suppress later cadence compaction',()=>{
 const messages=[{role:'system',content:'rules'},{role:'user',content:'input'}];
 for(let i=0;i<13;i++)messages.push({role:'assistant',tool_calls:[{id:'a'+i,function:{name:'creation_apply',arguments:'{}'}}]},{role:'tool',tool_call_id:'a'+i,content:'{"ok":true}'});
 const candidate=creativeCompactionCandidate(messages,{compactedUntil:2,usage:[{prompt_tokens:610000}],phaseReviews:[{messageIndex:4}]});
 assert.ok(candidate);
 assert.equal(candidate.history.filter(item=>item.role==='assistant').length,11);
});

test('failed model compaction keeps the design intent and rejected work',()=>{
 const memory=fallbackCreativeMemory('先前决定让文字落在蓝卡上。',[
  {role:'assistant',text:'居中尝试太拥挤，改为错位叠放。'},
  {role:'tool',ok:false,detail:'标题被底纸遮住'}
 ],{plan:{intent:'旅行手帐',composition:{layout:'错位叠放'}},decisions:['保留蓝卡作为书写区']});
 assert.match(memory,/旅行手帐|蓝卡/);
 assert.match(memory,/居中尝试太拥挤/);
 assert.match(memory,/标题被底纸遮住/);
});

test('malformed historical tool arguments cannot break compaction',()=>{
 const history=creativeCompactionTranscript([{role:'assistant',tool_calls:[
   {function:{name:'creation_apply',arguments:'null'}},
   {function:{name:'creation_apply',arguments:'{"operations":{}}'}},
   {function:{name:'creation_apply',arguments:'not json'}}
 ]}]);
 assert.equal(history[0].calls.length,3);
 assert.deepEqual(history[0].calls[0].operations,[]);
 assert.deepEqual(history[0].calls[1].operations,[]);
 assert.equal(history[0].calls[2].invalidArguments,true);
});

test('skill routing uses explicit direction and respects no-text tasks',async()=>{
  const skills=await loadCreationSkills();
  const selected=recommendCreationSkills(skills,{source:{textMode:'none',styles:[]}},{styles:['童趣可爱'],intent:'复古旧物'}).map(s=>s.name);
  assert.deepEqual(selected,['journal-composition','journal-color','paper-layering','journal-accents','journal-graphics']);
  assert.ok(recommendCreationSkills(skills,{source:{styles:['复古旧物']}}).some(s=>s.name==='paper-layering'));
});

test('zero-material skill routing offers lettering and drawn graphics without source techniques',async()=>{
  const skills=await loadCreationSkills();
  const {createCreationDocument}=await import('../src/creation-document.js');
  const {draft}=await import('../src/domain.js');
  const {initialHarnessState}=await import('../creative-agent/runtime/agent.mjs');
  const document=await createCreationDocument({draft:draft(),assets:[]});
  const state=initialHarnessState({document,skills,brief:{styles:['丰富层叠']}});
  assert.deepEqual(state.loadedSkills,[]);
  assert.ok([...state.recommendedMethods,...state.expressionCards].some(method=>method.id==='title-art'));
  assert.ok(state.recommendedMethods.some(method=>method.id==='graphic-route'));
  assert.ok(!state.recommendedMethods.some(method=>method.id==='paper-peek'));
  assert.ok(!initialToolGuide(document).common.descriptions.some(item=>item.name==='material.add'));
  assert.match(state.messages[0].content,/零素材创作/);
  assert.ok(!state.messages[0].content.includes('基础 Skill、匹配风格和常用参数已自动提供'));
  assert.ok(state.messages[0].content.length<100000);
  const visual=await createCreationDocument({draft:draft(),assets:[],contentPolicy:'visual'});
  const visualState=initialHarnessState({document:visual,skills,brief:{styles:['丰富层叠']}});
  assert.ok(!visualState.recommendedMethods.some(method=>method.skill==='journal-lettering'));
  assert.ok(!recommendCreationSkills(skills,visual).some(skill=>skill.name==='journal-lettering'));
  assert.deepEqual(shortlistCreationMethods({...document,source:{...document.source,materials:Array(5).fill({})}},{styles:['丰富层叠']}).slice(0,2).map(m=>m.id),['paper-peek','accent-materials']);
  const noText=initialHarnessState({document:visual,skills,brief:{intent:'只用数字图形创作',styles:['丰富层叠']}});
  assert.equal(noText.expressionRequired,false);
  assert.deepEqual(noText.expressionCards.map(card=>card.id),['graphic-loop','color-echo','accent-spark']);
  assert.ok(!noText.messages[0].content.includes('可直接调用的文字效果选法'));
});

test('lettering effects are delayed until the craft stage',async()=>{
  const skills=await loadCreationSkills();
  const {createCreationDocument}=await import('../src/creation-document.js');
  const {draft}=await import('../src/domain.js');
  const {initialHarnessState}=await import('../creative-agent/runtime/agent.mjs');
  const document=await createCreationDocument({draft:draft(),assets:[]});
  const state=initialHarnessState({document,skills,brief:{intent:'做一页有手写感的记录',styles:['丰富层叠']}});
  assert.deepEqual(state.expressionCards.map(card=>card.id),['title-art','title-art','color-echo','accent-spark']);
  assert.ok(!state.messages[0].content.includes('title-cross-shadow'));
  const {letteringEffectMenu}=await import('../creative-agent/runtime/expression.mjs');
  for(const [id,variant] of [['title-art','gap-shadow-offset-outline'],['title-art','gap-shadow-gradient-outline'],['title-art','tape'],['title-art','cross-shadow'],['title-art','scattered-round'],['title-art','scattered-round-triangle'],['title-art','number-route'],['title-art','script-dots'],['title-art','paper-lettering']])
    assert.ok(letteringEffectMenu().some(item=>item.id===id&&item.variant===variant),`${id}:${variant||''}`);
  assert.ok(state.messages[0].content.length<100000);
});

test('paper carriers stay discoverable without default promotion for every material task',async()=>{
  const {expressionCards}=await import('../creative-agent/runtime/expression.mjs');
  const skills=await loadCreationSkills(undefined,{illustrationRoot:null});
  for(const kind of ['paper','sticker'])for(const style of ['丰富层叠','疏朗留白','复古收藏']){
    const document={source:{materials:[{alias:'m1'}],sourceSnapshots:[{kind}],textMode:'automatic',styles:[style]}};
    const cards=expressionCards(document,{style});
    const methods=shortlistCreationMethods(document,{style});
    assert.ok(!cards.some(card=>card.id==='paper-color-card'));
    assert.ok(!methods.some(method=>method.id==='paper-color-card'));
    assert.ok(methods.some(method=>method.id==='record-on-material'));
  }
  const overview=skills.read('paper-layering');
  assert.ok(overview.methodCatalog.some(method=>method.id==='paper-color-card'));
  const detail=skills.read('paper-layering',{level:'detail',methodId:'paper-color-card'});
  assert.equal(detail.methods[0].id,'paper-color-card');
});

test('foundation feedback rejects a near invisible page tint and accepts visible paper',async()=>{
  const {paperFoundationStatus}=await import('../creative-agent/runtime/context.mjs');
  const document={page:{pageMode:'single',physicalPageHeightMM:210,canvas:{width:705,height:1000},paperColor:'#FCFAF0'},
    source:{styles:['丰富层叠'],materials:[{alias:'m1',assetID:'a'}],sourceSnapshots:[{assetID:'a',kind:'paper',role:'focal'}]}};
  const base={id:'base',type:'shape',surface:'page',opacity:1,hidden:false,fill:'#FBF6EC',world:{sizeMm:[148,210],centerMm:[74,105]}};
  assert.deepEqual(paperFoundationStatus(document,{layers:[base]}).missingPages,['page']);
  const backing={...base,id:'backing',fill:'#6696AA',world:{sizeMm:[90,120],centerMm:[74,105]}};
  assert.deepEqual(paperFoundationStatus(document,{layers:[base,backing]}).missingPages,[]);
  assert.deepEqual(paperFoundationStatus(document,{layers:[{...backing,fill:'#DCE4E9'}]}).missingPages,[]);
});

test('paper foundation applies to ordinary multi-material pages and flags cloned spread boards',async()=>{
  const {paperFoundationStatus}=await import('../creative-agent/runtime/context.mjs');
  const document={page:{pageMode:'spread',physicalPageHeightMM:210,canvas:{width:1410,height:1000},paperColor:'#FCFAF0'},
    source:{styles:['丰富层叠'],materials:[{alias:'a',assetID:'a'},{alias:'b',assetID:'b'}],sourceSnapshots:[]}};
  const paper=(id,x,y,width,height,fill='#C4D8E3')=>({id,type:'shape',surface:'page',opacity:1,hidden:false,fill,world:{sizeMm:[width,height],centerMm:[x,y]}});
  assert.deepEqual(paperFoundationStatus(document,{layers:[]}).missingPages,['page.left','page.right']);
  const repeated=paperFoundationStatus(document,{layers:[paper('left',74,105,112,170),paper('right',222,105,112,170)]});
  assert.deepEqual(repeated.missingPages,[]);
  assert.equal(repeated.flatBoards,true);
  assert.equal(paperFoundationStatus(document,{layers:[paper('left',74,105,112,170,'#DCE4E9'),paper('right',222,105,112,170,'#D7DFE4')]}).flatBoards,true);
  assert.equal(paperFoundationStatus(document,{layers:[paper('left',74,105,112,170,'#E9DFC9'),paper('right',222,105,112,170,'#A9CDE4')]}).flatBoards,true);
  assert.equal(paperFoundationStatus(document,{layers:[paper('left',74,105,112,170),paper('right',225,121,90,145)]}).flatBoards,false);
  const graphic=(id,x,y)=>({id,type:'material',surface:'page',opacity:1,hidden:false,asset:id,world:{sizeMm:[25,25],centerMm:[x,y]}});
  assert.deepEqual(paperFoundationStatus(document,{layers:[paper('left',74,105,112,170),paper('right',225,121,90,145),graphic('a',74,105),graphic('b',300,105)]}).unconnectedPages,['page.right']);
  assert.deepEqual(paperFoundationStatus(document,{layers:[paper('left',74,105,112,170),paper('right',225,121,90,145),graphic('a',74,105),graphic('b',225,120)]}).unconnectedPages,[]);
  document.source.styles=['清新淡雅'];
  assert.equal(paperFoundationStatus(document,{layers:[]}).required,true);
  document.source.styles=['极简'];
  assert.equal(paperFoundationStatus(document,{layers:[]}).required,false);
});

test('a source writing card or patterned paper can be the foundation when text or artwork connects to it',async()=>{
  const {paperFoundationStatus}=await import('../creative-agent/runtime/context.mjs');
  const document={page:{pageMode:'single',physicalPageHeightMM:210,canvas:{width:705,height:1000},paperColor:'#FCFAF0'},
    source:{styles:['丰富层叠'],materials:[{alias:'journey',assetID:'journey-id'},{alias:'star',assetID:'star-id'}],sourceSnapshots:[{assetID:'journey-id',kind:'paper',role:'support'},{assetID:'star-id',kind:'paper',role:'support'}]}};
  const card={id:'card',type:'material',surface:'page',opacity:1,hidden:false,asset:'journey',world:{sizeMm:[65,90],centerMm:[74,100]}};
  const words={id:'words',type:'text',surface:'page',opacity:1,hidden:false,world:{sizeMm:[38,20],centerMm:[74,100]}};
  assert.deepEqual(paperFoundationStatus(document,{layers:[card,words]}).missingPages,[]);
  assert.deepEqual(paperFoundationStatus(document,{layers:[card,words]}).unconnectedPages,[]);
  const stars={...card,id:'stars',asset:'star'};
  assert.deepEqual(paperFoundationStatus(document,{layers:[stars,words]}).missingPages,[]);
  const smallerPattern={...stars,world:{sizeMm:[65,63],centerMm:[74,100]}};
  assert.deepEqual(paperFoundationStatus(document,{layers:[smallerPattern,words]}).missingPages,[]);
});

test('repeated local edits get a batch correction hint without forcing acceptance',()=>{
  const message=target=>({role:'assistant',tool_calls:[{function:{name:'creation_apply',arguments:JSON.stringify({operations:[{op:'layer.update',target}]})}}]});
  assert.equal(iterationAdvice([message('a'),message('b')]),'');
  assert.match(iterationAdvice([message('a'),message('a'),message('a')]),/连续多次修改同一批对象（a）/);
});

test('automatic material facts retain physical dimensions and expose missing required sources before finish',async()=>{
  const {createCreationDocument}=await import('../src/creation-document.js');
  const {draft}=await import('../src/domain.js');
  const {materialBrief,automaticSceneFeedback}=await import('../creative-agent/runtime/context.mjs');
  const asset={id:'paper',title:'必用纸片',kind:'paper',physicalWidthMM:55.7,physicalHeightMM:69.6};
  const document=await createCreationDocument({draft:draft(),assets:[asset],aliases:{m1:asset.id},requiredAssetIDs:[asset.id]});
  const [fact]=materialBrief(document);assert.equal(fact.widthMM,55.7);assert.equal(fact.heightMM,69.6);assert.equal(fact.required,true);assert.equal(fact.priority,'required');
  const feedback=automaticSceneFeedback(document);assert.equal(feedback.required[0].present,false);assert.equal(feedback.finalValidation.ok,false);assert.match(feedback.finalValidation.issue,/必用素材/);
});

test('failed parameter validation supplies targeted help without changing the operation',async()=>{
  const {failureGuidance}=await import('../creative-agent/runtime/context.mjs');
  const args={operations:[{op:'material.add',style:{shadow:{color:'#00000033'}}}]},before=JSON.stringify(args);
  const guide=failureGuidance('creation_apply',args,{path:'/operations/0/style/shadow/color'});
  assert.equal(guide.operation.descriptions[0].name,'material.add');assert.equal(guide.fieldDefinitions.Color.pattern,'^#[0-9A-Fa-f]{6}$');assert.equal(JSON.stringify(args),before);
  assert.ok(failureGuidance('creation_help',{},{}).available.topics.includes('place'));
  const star={operations:[{op:'graphic.add',id:'star',geometry:{kind:'star',points:5}}]};
  assert.match(failureGuidance('creation_apply',star,{path:'/operations/0/geometry/points'}).hint,/options/);
  const first=compactInitialToolGuide({source:{materials:[],sourceSnapshots:[],textMode:'none'}}).operations.find(item=>item.name==='graphic.add');
  assert.equal(first.example.op,'graphic.add');
});

test('invalid stroke styling reports all mismatched fields and valid alternatives together',async()=>{
  const {styleFor}=await import('../src/scene-node-properties.js');
  assert.throws(()=>styleFor('ink',{fill:null,strokeOpacity:.5},{canvas:{height:100},physicalPageHeightMM:100}),error=>/style.fill/.test(error.message)&&/style.strokeOpacity/.test(error.message)&&/可用：.*opacity/.test(error.message));
});


test('opening user scope survives tool discovery and the rolling history window exactly once',async()=>{
 const {createCreationDocument}=await import('../src/creation-document.js'),{draft}=await import('../src/domain.js');
 const document=await createCreationDocument({draft:draft(),assets:[],prompt:'标题'});
 const scope={role:'user',content:'当前只做标题：保留正文，验证字形和描边。已预读标题 Skill。'};
 const messages=[{role:'system',content:'创作'}, {role:'user',content:'材料清单'},scope];
 for(let i=0;i<12;i++){messages.push({role:'assistant',content:'读取工具 '+i},{role:'tool',content:'参数 '+i});
  const before=JSON.stringify(messages),out=modelContext(messages);
  assert.equal(out.filter(m=>m.content===scope.content).length,1);
  assert.equal(modelContext(messages,{document}).filter(m=>m.content===scope.content).length,1);
  assert.equal(JSON.stringify(messages),before);
 }
});





test('ordinary turns reuse the complete prior history prefix despite changing Scene summaries',async()=>{
 const {createCreationDocument}=await import('../src/creation-document.js'),{draft}=await import('../src/domain.js');
 const document=await createCreationDocument({draft:draft(),assets:[]});
 const messages=[{role:'system',content:'fixed rules'},{role:'user',content:'fixed task'}];
 for(let turn=0;turn<10;turn++){
  messages.push({role:'assistant',reasoning_content:'reason '+turn,tool_calls:[{id:'c'+turn,function:{name:'creation_help',arguments:'{}'}}]},{role:'tool',tool_call_id:'c'+turn,content:JSON.stringify({ok:true,data:'schema '.repeat(100)})});
  const before=JSON.stringify(messages),request=modelContext(messages,{document,compactedUntil:2,decisions:[{turn}]});
  assert.deepEqual(request.slice(0,messages.length),messages);
  assert.match(request.at(-1).content,/当前创作状态/);
  assert.equal(JSON.stringify(messages),before);
 }
});


test('ordinary long histories and image counts do not trigger compaction',()=>{
 const messages=[{role:'system',content:'rules'},{role:'user',content:'task'},...Array.from({length:10},(_,i)=>[
  {role:'assistant',reasoning_content:'x'.repeat(31000),tool_calls:[{id:'c'+i,function:{name:'creation_apply',arguments:'{}'}}]},
  {role:'tool',tool_call_id:'c'+i,content:'{"ok":true}'},
  {role:'user',content:Array.from({length:3},()=>({type:'image_url',image_url:{url:'image'}}))}
 ]).flat()];
 assert.equal(creativeCompactionCandidate(messages,{usage:[{prompt_tokens:120000,completion_tokens:30000}],firstLayoutTurn:10,turns:10}),null);
 const candidate=creativeCompactionCandidate(messages,{usage:[{prompt_tokens:570000,completion_tokens:40000}]});
 assert.ok(candidate);
 const retained=modelContext(messages,{compactedUntil:candidate.cutoff});
 assert.equal(retained.filter(m=>m.role==='assistant').length,2);
 assert.equal(retained.find(m=>m.role==='assistant').reasoning_content,'x'.repeat(31000));
 assert.equal(creativeCompactionCandidate(messages,{compactedUntil:candidate.cutoff,usage:[{prompt_tokens:610000}]}),null);
});

test('full snapshot is refreshed after compaction without accumulating old snapshots',async()=>{
 const {createCreationDocument}=await import('../src/creation-document.js'),{draft}=await import('../src/domain.js');
 const document=await createCreationDocument({draft:draft(),assets:[]});
 const messages=[{role:'system',content:'rules'},{role:'user',content:'task'},
  {role:'assistant',content:'older'},{role:'user',content:'older decision'},
  {role:'assistant',content:'recent'},{role:'user',content:'recent decision'}];
 const state={document,compactedUntil:4},first=modelContext(messages,state);
 const next=modelContext([...messages,...first.filter(isCreativeSnapshot)],state);
 assert.equal(next.filter(isCreativeSnapshot).length,1);
 assert.deepEqual(JSON.parse(next.at(-1).content.slice('当前创作状态（由检查点生成）：'.length)).scene,JSON.parse(first.at(-1).content.slice('当前创作状态（由检查点生成）：'.length)).scene);
});

test('tray-only changes retain the latest matching page image and remove obsolete workspace snapshots',async()=>{
 const {createCreationDocument}=await import('../src/creation-document.js'),{draft}=await import('../src/domain.js');
 const document=await createCreationDocument({draft:draft(),assets:[]});
 const frame=(id,version)=>({role:'user',content:[{type:'text',text:'当前真实画面：'+version},{type:'text',text:'工作空间 '+id+'；画面版本：'+version},{type:'image_url',image_url:{url:version}}]});
 const messages=[{role:'system',content:'rules'},{role:'user',content:'task'},{role:'assistant',content:'edit'},frame('page','old'),frame('page','current'),frame('tray','tray-new'),{role:'assistant',content:'help'},{role:'tool',tool_call_id:'help',content:'help result'}];
 const before=JSON.stringify(messages),out=modelContext(messages,{document,visualState:{page:{signature:'current'},tray:{signature:'tray-new'}},preview:{sceneRevision:'current'}});
 assert.deepEqual(out.flatMap(m=>Array.isArray(m.content)?m.content:[]).filter(p=>p.type==='image_url').map(p=>p.image_url.url),['current','tray-new']);
 assert.equal(JSON.stringify(messages),before);assert.equal(out.at(-3).role,'tool');
});


test('first turn provides cutting and tearing examples without a help round',()=>{
 const guide=compactInitialToolGuide({source:{materials:[{alias:'m1',assetID:'a'}],sourceSnapshots:[],textMode:'rich'}});
 for(const name of ['material.cut','material.tear']){
  const command=guide.operations.find(item=>item.name===name);
  assert.ok(command?.example);
  assert.equal(command.example.op,name);
  for(const field of command.parameters.required)assert.ok(field in command.example,field);
 }
 assert.ok(guide.definitions.Region);
 assert.ok(guide.operations.some(item=>item.name==='layer.split'));
 assert.ok(guide.operations.some(item=>item.name==='group.ungroup'));
});


test('failed tool routing and pen style get bounded actionable guidance',()=>{
 const routed=failureGuidance('creation_apply',{operations:[{op:'creation_paper'}]},{message:'$/operations/0/op unknown'});
 assert.match(routed.hint,/独立工具/);
 const ink=failureGuidance('creation_apply',{operations:[{op:'graphic.add'}]},{path:'/operations/0/style/penStyle'});
 assert.match(ink.hint,/pen、ballpoint、brush、marker/);
});

test('title group update error returns actual editable children without an extra inspect call',async()=>{
 const {draft}=await import('../src/domain.js');
 const {createCreationDocument}=await import('../src/creation-document.js');
 const {applyCreationTransaction,creationSceneRevision}=await import('../src/creation-transaction.js');
 const {compileTitleOperations}=await import('../creative-agent/runtime/title-tool.mjs');
 const base=await createCreationDocument({draft:draft(),assets:[]});
 const operations=compileTitleOperations({titles:[{id:'title',content:'测试',place:{reference:'page',at:[30,30],unit:'mm'},size:{width:60,unit:'mm'},style:{fontSizePt:18,color:'#112233'}}]});
 const {document}=applyCreationTransaction(base,{protocolVersion:2,transactionId:'title',baseSceneRevision:creationSceneRevision(base),operations},[]);
 const guidance=failureGuidance('creation_apply',{operations:[{op:'layer.update',target:'title',style:{fontSizePt:20}}]},{message:'operations[0] layer.update: group 不支持 style.fontSizePt'},document);
 assert.equal(guidance.textChildren.length,1);assert.equal(guidance.textChildren[0].content,'测试');
 assert.notEqual(guidance.textChildren[0].id,'title');assert.match(guidance.hint,/本批次未执行/);
});
