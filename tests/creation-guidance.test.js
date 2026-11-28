import test from 'node:test';
import assert from 'node:assert/strict';
import {creationMethods,creationMaterialContext,creationGuidanceRoute,creationGuidanceText,describeCreationGuidance,creationTaskBrief} from '../src/creation-guidance.js';
import {creationCommandRegistry} from '../src/creation-v2-contract.js';
import {createEditablePackageGuide} from '../src/offline-creation.js';
import {matchingViewModel} from '../src/matching-view.js';
import {creativePageBrief} from '../src/creative-page-brief.js';

test('presets and supporting tape do not masquerade as a rich main-material selection',()=>{
  const presets=Array.from({length:27},(_,i)=>({id:'preset'+i,isCreativePreset:true,kind:i<9?'tape':i<18?'stamp':'sticker'}));
  assert.deepEqual(creationMaterialContext([...presets,{kind:'tape'},{kind:'paper'}]),{mainCount:1,presetCount:27,supportingCount:1,mode:'sparse'});
  assert.equal(creationMaterialContext(presets).mode,'support-only');
  assert.equal(creationMaterialContext(Array.from({length:5},()=>({kind:'paper'}))).mode,'rich');
  const source={styles:['日系文具'],purposes:['自由创作'],contentPolicy:'original'};
  const guide=createEditablePackageGuide(source,[...presets,{kind:'paper'}],{includeStructureReference:false});
  assert.match(guide,/本次素材较少/);assert.doesNotMatch(guide,/本次素材较多/);assert.ok(guide.length<5000);
});
test('style, purpose and content policy select methods without overriding user intent',()=>{
  const american=creationGuidanceRoute({styles:['美式拼贴'],materials:[{kind:'paper'}]});
  const stationery=creationGuidanceRoute({styles:['日系文具'],materials:[{kind:'paper'}]});
  assert.ok(american.methods.includes('cutwork'));assert.ok(stationery.methods.includes('tape'));assert.notDeepEqual(american.methods,stationery.methods);
  for(const options of [{contentPolicy:'visual'},{textMode:'none'},{textMode:'requested'}]){
    const route=creationGuidanceRoute({...options,styles:['美式拼贴']});
    assert.equal(route.writes,false);assert.ok(!route.methods.includes('writing'));assert.ok(!route.methods.includes('lettering'));assert.match(route.textAdvice,/不新增文字/);
  }
  assert.equal(creationGuidanceRoute({textMode:'requested',intent:'写一页给自己的提醒'}).writes,true);
  const diary=creationGuidanceRoute({contentPolicy:'documentary'});assert.ok(!diary.methods.includes('writing'));assert.match(diary.textAdvice,/没有事实/);
  const planner=creationGuidanceRoute({purposes:['清单计划']});assert.ok(planner.methods.includes('planner'));assert.match(planner.textAdvice,/不假造已完成/);
});
test('every method links to an executable command and unknown topics fail explicitly',()=>{
  for(const method of Object.values(creationMethods))for(const op of method.operations)assert.equal(creationCommandRegistry[op]?.available,true,op);
  const selected=describeCreationGuidance(['tape','stamps']);assert.equal(selected.guides.length,2);assert.ok(!JSON.stringify(selected).includes('随想书写'));
  assert.equal(describeCreationGuidance(['美式拼贴']).guides[0].title,'美式拼贴');
  assert.throws(()=>describeCreationGuidance(['../../TASK.json']),{code:'GUIDE_TOPIC_UNKNOWN'});
});
test('brief omits bulky private source internals while preserving facts and selection',()=>{
  const task={title:'本次',intent:'主题',providedFacts:'已知事实',styles:['复古旧物'],materials:[{alias:'m1',selection:'required',title:'照片',image:'assets/m1.png',physicalWidthMM:30,physicalHeightMM:40,sha256:'hash'}],sourceContext:{textMode:'none',sourceSnapshots:[{privateBlobId:'do-not-expose'}]}};
  const brief=creationTaskBrief(task);assert.equal(brief.providedFacts,'已知事实');assert.equal(brief.materials[0].selection,'required');assert.equal(brief.route.writes,false);
  assert.doesNotMatch(JSON.stringify(brief),/sourceSnapshots|privateBlobId|do-not-expose/);
});
test('matching and both AI briefs share guidance for the actual selected scope',()=>{
  const assets=[{id:'a',title:'照片',kind:'paper',usageStatus:'ready',physicalWidthMM:30,physicalHeightMM:40},{id:'p',title:'预设',kind:'sticker',isCreativePreset:true,usageStatus:'ready'}];
  const state={assets,basket:['a','p'],coreIDs:[],excludedAssetIDs:[],aiSettings:{autoIncludeRecommendations:false,requireAllCandidates:false},matchStyles:['杂志排版'],matchPurposes:['主题封面'],matchContentPolicy:'original'};
  const view=matchingViewModel(state);assert.equal(view.guidance.context.mainCount,1);assert.equal(view.guidance.context.presetCount,1);assert.equal(view.guidance.purpose,'主题封面');
  const opts={styles:state.matchStyles,purposes:state.matchPurposes,materials:assets};
  const shared=creationGuidanceText(opts);
  for(const delivery of ['editable','image'])assert.ok(creativePageBrief({...opts,delivery}).includes(shared));
  assert.ok(createEditablePackageGuide({...opts,contentPolicy:'original'},assets,{includeStructureReference:false}).includes(shared));
});
