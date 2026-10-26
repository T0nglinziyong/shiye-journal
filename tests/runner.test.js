import test from 'node:test';
import assert from 'node:assert/strict';
import {runCreativeAgent} from '../src/creative-runner.js';
import {draft} from '../src/domain.js';
import {createCreationAgentSession} from '../src/creation-agent-session.js';
import {worldBox} from '../src/scene-spatial.js';
const call=(name,args,id=name)=>({id,type:'function',function:{name,arguments:typeof args==='string'?args:JSON.stringify(args)}});
const text=(id='note',content='今天的春风落在纸上')=>({op:'text.add',id,content,size:{width:60,unit:'mm'},place:{reference:'page',at:[50,50],unit:'mm'}});
const batch=(revision,operations,id='initial')=>({protocolVersion:2,transactionId:id,baseSceneRevision:revision,operations});
function currentRevision(payload){
 const all=JSON.stringify(payload.messages);return [...all.matchAll(/sha256:[a-f0-9]{64}/g)].at(-1)[0];
}
const runner=(options,respond)=>runCreativeAgent({draft:draft(),assets:[],aliases:{},key:'synthetic-test',onFinalScene:async()=> 'rendered-image',...options,request:async(_url,init)=>({ok:true,json:async()=>respond(JSON.parse(init.body))})});
const reply=(...calls)=>({choices:[{message:{tool_calls:calls}}]});

test('unified transactions retain a committed batch after malformed call, then finish the exact revision',async()=>{
 const payloads=[];let round=0;
 const result=await runner({},p=>{payloads.push(p);const rev=currentRevision(p);return ++round===1?reply(call('creation_apply',batch(rev,[text()]),'good'),call('creation_apply','{broken','bad')):reply(call('creation_finish',{sceneRevision:rev}));});
 assert.equal(payloads[0].messages.length,2,'one task message includes the authoritative scene once');
 assert.equal((JSON.stringify(payloads[0].messages).match(/coordinateSystem/g)||[]).length,1);
 assert.doesNotMatch(JSON.stringify(payloads[0].messages),/observed_region|plan\.weaves|apply_craft_plan|ink_strokes|upsert_materials/);
 assert.equal(result.finished,true);assert.equal(result.turns,2);assert.equal(result.draft.textBlocks.length,1);
 assert.equal(payloads[0].thinking.type,'disabled');assert.equal(payloads[0].tool_choice,'required');
 assert.equal(payloads[1].messages.filter(m=>m.role==='tool').length,2);
 assert.match(payloads[1].messages.find(m=>m.tool_call_id==='bad').content,/false/);
 assert.equal(result.renderedSceneHash,result.sceneHash);
});
test('an atomic batch never keeps a valid prefix when a later operation fails',async()=>{
 const session=await createCreationAgentSession({draft:draft(),assets:[],aliases:{}}),rev=session.revision;
 const result=await session.execute([call('creation_apply',batch(rev,[text(),{op:'layer.delete',target:'missing'}]))]);
 assert.equal(result.results[0].ok,false);assert.equal(session.draft.layers.length,0);assert.equal(session.revision,rev);
});
test('empty response and empty canvas cannot be marked complete',async()=>{
 await assert.rejects(runner({},()=>reply()),/没有返回创作操作/);
 const session=await createCreationAgentSession({draft:draft(),assets:[]});
 const r=await session.execute([call('creation_finish',{sceneRevision:session.revision})]);assert.equal(r.finishRequested,false);assert.match(r.results[0].detail,/画布为空/);
});
test('cancellation while receiving a response prevents every returned operation',async()=>{
 const controller=new AbortController(),turns=[];
 await assert.rejects(runner({signal:controller.signal,onResponse:()=>controller.abort(Error('用户停止')),onTurn:t=>turns.push(t)},p=>reply(call('creation_apply',batch(currentRevision(p),[text()])))),e=>/用户停止/.test(e.message)&&e.budget.stopReason==='cancelled'&&e.budget.totalRequests===1);
 assert.equal(turns.length,0);
});
test('inspection images follow all tool replies, and successful edits are durable before image failure',async()=>{
 const asset={id:'paper',title:'纸片',physicalWidthMM:20,physicalHeightMM:30,supply:{quantity:1}},payloads=[],events=[];let round=0;
 const result=await runner({assets:[asset],aliases:{m1:'paper'},onTurn:t=>events.push(t.draft.layers.length),onInspection:async()=>{assert.equal(events[0],1);throw Error('image failure');}},p=>{payloads.push(p);return ++round===1?reply(call('creation_apply',batch(currentRevision(p),[{op:'material.add',id:'paper',asset:'m1',place:{reference:'page',at:[50,50],unit:'mm'}}])),call('inspect_materials',{keys:['paper']}),call('creation_help','{bad','bad')):reply(call('creation_finish',{sceneRevision:currentRevision(p)}));});
 assert.equal(result.draft.items.length,1);assert.equal(result.finished,true);
 const messages=payloads[1].messages,i=messages.findIndex(m=>m.role==='assistant');assert.deepEqual(messages.slice(i+1,i+4).map(m=>m.role),['tool','tool','tool']);assert.equal(messages[i+4].role,'user');assert.match(JSON.stringify(messages),/无需重放/);
});
test('renderer failure cannot report completed; successful edits have already been checkpointed',async()=>{
 let round=0;const saved=[];
 await assert.rejects(runner({onTurn:t=>saved.push(t.draft),onFinalScene:async()=>{throw Error('decode failed');}},p=>++round===1?reply(call('creation_apply',batch(currentRevision(p),[text()]))):reply(call('creation_finish',{sceneRevision:currentRevision(p)}))),e=>e.code==='final-render-failed');
 assert.equal(saved[0].textBlocks.length,1);assert.notEqual(saved.at(-1).agentRun?.status,'finished');
});
test('eight configured requests are honored; a three-request budget stops before a fourth',async()=>{
 let count=0;
 const model=p=>{count++;return count===8?reply(call('creation_finish',{sceneRevision:currentRevision(p)})):reply(call('creation_apply',batch(currentRevision(p),count===1?[text()]:[{op:'layer.update',target:'note',content:'第 '+count+' 版'}],'turn-'+count)));};
 const result=await runner({maxTurns:8},model);assert.equal(count,8);assert.equal(result.budget.totalRequests,8);
 count=0;await assert.rejects(runner({maxTurns:3},model),e=>e.code==='request-limit'&&e.budget.totalRequests===3);assert.equal(count,3);
});
test('truncation consumes a request; repeated read-only calls stop without rendering unchanged frames',async()=>{
 let round=0,renders=0;
 const result=await runner({maxTurns:3},p=>++round===1?{choices:[{finish_reason:'length',message:{content:'incomplete'}}]}:round===2?reply(call('creation_apply',batch(currentRevision(p),[text()]))):reply(call('creation_finish',{sceneRevision:currentRevision(p)})));
 assert.equal(result.budget.formatRepairRequests,1);assert.equal(result.budget.creationRequests,2);
 await assert.rejects(runner({onScene:()=>{renders++;}},()=>reply(call('creation_help',{}))),e=>e.code==='no-progress');assert.equal(renders,0);
});
test('local-group and advanced-graphic edits stay in the unified engine and protect source size',async()=>{
 const asset={id:'a',title:'纸片',physicalWidthMM:20,physicalHeightMM:30,supply:{quantity:1}};
 const session=await createCreationAgentSession({draft:draft(),assets:[asset],aliases:{m1:'a'}});
 const commands=[{op:'group.compose',id:'cluster',place:{reference:'page',at:[70,70],unit:'mm',rotationDeg:25},layoutBox:{width:80,height:60,unit:'mm'},children:[{op:'material.add',id:'paper',asset:'m1',place:{reference:'parent',at:[.5,.5],unit:'ratio'}},{op:'graphic.add',id:'table',geometry:{kind:'weeklyTable',options:{rows:4,columns:3}},size:{width:40,height:30,unit:'mm'},place:{reference:'parent',at:[.8,.8],unit:'ratio'},style:{fill:null,stroke:'#446655',strokeWidthMm:.4}}]}];
 const input=batch(session.revision,commands),first=await session.execute([call('creation_apply',input)]);assert.equal(first.results[0].ok,true,JSON.stringify(first.results));
 const before=worldBox(session.document.page,'paper');
 assert.equal((await session.execute([call('creation_apply',input)])).results[0].data.replayed,true);
 const update=await session.execute([call('creation_apply',batch(session.revision,[{op:'layer.update',target:'cluster',place:{reference:'page',at:[90,80],unit:'mm'}},{op:'layer.update',target:'table',geometry:{kind:'weeklyTable',options:{rows:6,columns:2,showOuterBorder:false}}}],'adjust'))]);
 assert.equal(update.results[0].ok,true,JSON.stringify(update.results));assert.equal(worldBox(session.document.page,'paper').w,before.w);assert.notEqual(worldBox(session.document.page,'paper').cx,before.cx);
 assert.equal(session.draft.primitives[0].shapeOptions.rows,6);
 const denied=await session.execute([call('creation_apply',batch(session.revision,[{op:'layer.update',target:'paper',size:{width:50,unit:'mm'}}],'illegal'))]);assert.equal(denied.results[0].ok,false);
});
test('finish rejects a stale revision and the removed legacy tool protocol',async()=>{
 const session=await createCreationAgentSession({draft:draft(),assets:[]}),stale=session.revision;
 await session.execute([call('creation_apply',batch(stale,[text()]))]);
 const r=await session.execute([call('upsert_text',{items:[]}),call('creation_finish',{sceneRevision:stale})]);assert.ok(r.results.every(x=>!x.ok));assert.equal(r.finishRequested,false);
});
test('required material inside a translated local group is validated at its world position',async()=>{
 const asset={id:'a',title:'纸片',physicalWidthMM:20,physicalHeightMM:30,supply:{quantity:1}},session=await createCreationAgentSession({draft:draft(),assets:[asset],aliases:{m1:'a'},requiredAssetIDs:['a']});
 const made=await session.execute([call('creation_apply',batch(session.revision,[{op:'group.compose',id:'g',place:{reference:'page',at:[80,80],unit:'mm'},layoutBox:{width:60,height:60,unit:'mm'},children:[{op:'material.add',id:'paper',asset:'m1',place:{reference:'parent',at:[.2,.2],unit:'ratio'}}]}]))]);
 assert.equal(made.results[0].ok,true);assert.ok(session.draft.items[0].x<0);
 const completed=await session.execute([call('creation_finish',{sceneRevision:session.revision})]);assert.equal(completed.finishRequested,true,JSON.stringify(completed.results));
});
test('material observation cannot expand the selected source set',async()=>{
 const assets=['allowed','private'].map(id=>({id,title:id,physicalWidthMM:20,physicalHeightMM:20})),session=await createCreationAgentSession({draft:draft(),assets,aliases:{m1:'allowed'}});
 const r=await session.execute([call('inspect_materials',{keys:['private']})]);assert.equal(r.results[0].ok,false);assert.match(r.results[0].detail,/不在本次授权来源/);
});
