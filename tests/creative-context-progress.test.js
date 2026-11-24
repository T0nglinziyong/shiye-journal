import test from 'node:test';
import assert from 'node:assert/strict';
import {updateCreativeProgress,creativeProgressSnapshot} from '../creative-agent/runtime/progress.mjs';
import {harnessTools,selectHarnessTools} from '../creative-agent/runtime/tools.mjs';
import {modelContext,failureGuidance} from '../creative-agent/runtime/context.mjs';
import {createCreationDocument} from '../src/creation-document.js';
import {draft} from '../src/domain.js';
const env={sceneRevision:'r1',preview:{sceneRevision:'r1'},needsRender:false,turn:2};
const issue={id:'paper-link',problem:'右页小纸孤立',status:'open',evidence:'小纸四周无连接',nextAction:'增加与底纸重叠'};
const check={dimension:'accents',status:'satisfied',evidence:'纸边星纹形成蓝色呼应，不需新增星星'};
test('editing cannot be mistaken for visual verification, and failure leaves prior progress unchanged',()=>{
 const initial=updateCreativeProgress(null,{issues:[issue]},env),before=structuredClone(initial);
 for(const invalid of [{...env,needsRender:true},{...env,sceneRevision:'r2'},{...env,preview:null}]){
  assert.throws(()=>updateCreativeProgress(initial,{issues:[{...issue,status:'verified'}]},invalid),/当前预览/);
  assert.throws(()=>updateCreativeProgress(initial,{checks:[check]},invalid),/当前预览/);
 }
 assert.deepEqual(initial,before);
 const next=updateCreativeProgress(initial,{issues:[{...issue,status:'verified',evidence:'小纸现已跨在蓝色底纸边缘'}],checks:[check]},env);
 assert.equal(next.issues.length,1);assert.equal(next.issues[0].status,'verified');assert.equal(next.checks.accents.sceneRevision,'r1');
});
test('progress retains unresolved problems and marks old visual judgments as stale without fabricating new issues',()=>{
 const progress=updateCreativeProgress(null,{issues:[issue],checks:[check]},env);
 const state={creativeProgress:progress,document:{page:{pageMode:'single'},source:{textMode:'none'}},results:[{name:'creation_apply',ok:false,detail:'bad parameter'},{name:'read_skill',ok:true}]};
 const snapshot=creativeProgressSnapshot(state,'r2');
 assert.equal(snapshot.issues[0].status,'open');assert.match(snapshot.issues[0].verification,/需看图/);
 assert.equal(snapshot.checks.accents.current,false);assert.equal(snapshot.checks.lettering,undefined);assert.equal(snapshot.checks.spread,undefined);
 assert.equal(snapshot.recentExecution[0].ok,false);assert.equal(snapshot.recentExecution[1].ok,true);
});
test('progress updates replace only the current snapshot, preserving the cached history prefix',async()=>{
 const document=await createCreationDocument({draft:draft(),assets:[]});
 const messages=[{role:'system',content:'rules'},{role:'user',content:'immutable task'},{role:'assistant',content:'inspect'}];
 const before=modelContext(messages,{document});
 const after=modelContext(messages,{document,creativeProgress:updateCreativeProgress(null,{focus:'检查纸边点缀',issues:[issue]},env)});
 assert.deepEqual(before.slice(0,-1),after.slice(0,-1));
 const summary=JSON.parse(after.at(-1).content.replace('当前创作状态（由检查点生成）：',''));
 assert.equal(summary.taskState.focus,'检查纸边点缀');assert.ok(Array.isArray(summary.scene.layers));assert.equal(messages.length,3);
});
test('progress is a resident tool and does not require a separate phase or tool-discovery round',()=>{
 assert.ok(selectHarnessTools(harnessTools,{}).some(tool=>tool.function.name==='creation_progress'));
});
test('bounded task memory keeps every unresolved issue and rejects overflow atomically',()=>{
 const open=Array.from({length:8},(_,i)=>({...issue,id:'issue-'+i}));
 const progress=updateCreativeProgress(null,{issues:open},env);
 assert.throws(()=>updateCreativeProgress(progress,{issues:[{...issue,id:'extra'}]},env),/最多保留/);
 assert.equal(progress.issues.length,8);
 const closed=updateCreativeProgress(progress,{issues:open.map(item=>({...item,status:'verified'}))},env);
 assert.equal(closed.issues.length,4);
 const reopened=updateCreativeProgress(closed,{issues:[open[7]]},env);
 assert.equal(reopened.issues.find(item=>item.id===open[7].id).status,'open');
});

test('tail names unchecked dimensions and the executable progress entry, parameter failures give exact corrections',()=>{
 const state={document:{page:{pageMode:'single'},source:{textMode:'none'}}};
 const snapshot=creativeProgressSnapshot(state,'r1');
 assert.match(snapshot.nextFocus,/creation_progress.checks/);assert.match(snapshot.nextFocus,/accents/);
 assert.doesNotMatch(snapshot.nextFocus,/lettering|spread/);
 assert.match(failureGuidance('creation_apply',{},new Error('$/protocolVersion 合同不合法')).hint,/数字 2/);
 assert.match(failureGuidance('creation_title',{},new Error('$/baseSceneRevision must match pattern')).hint,/逐字复制/);
});
test('a checked dimension needing work is never presented as ready to deliver',()=>{
 const creativeProgress=updateCreativeProgress(null,{checks:[{...check,dimension:'composition',status:'satisfied'},{...check,status:'needs_work'}]},env);
 const snapshot=creativeProgressSnapshot({creativeProgress,document:{page:{pageMode:'single'},source:{textMode:'none'}}},'r1');
 assert.match(snapshot.nextFocus,/仍需处理：accents/);assert.doesNotMatch(snapshot.nextFocus,/若无待修缺陷可以交付/);
});
