import test from 'node:test';
import assert from 'node:assert/strict';
import {recommendForDirection,buildMaterialScope} from '../src/matching-materials.js';
import {matchingRecommendations,matchingViewModel} from '../src/matching-view.js';
const make=(id,kind,title,tags=[])=>({id,kind,title,tags,reviewStatus:'ready',physicalWidthMM:30,physicalHeightMM:40,supply:{quantity:1}});
const assets=[make('paper','paper','浅绿方格纸',['清单']),make('photo','photo','旅途照片',['旅行']),make('ticket','paper','车票',['旅途']),make('flower','sticker','花朵贴纸',['植物']),make('hidden','photo','私人照片')];
test('recommendations begin with style and purpose before any basket selection',()=>{
 const travel=recommendForDirection({assets,styles:['旅行票据'],purposes:['旅途记录']});
 const list=recommendForDirection({assets,styles:['清单手帐'],purposes:['清单计划']});
 assert.ok(travel.findIndex(x=>x.asset.id==='ticket')<travel.findIndex(x=>x.asset.id==='flower'));
 assert.equal(list[0].asset.id,'paper');
 assert.notDeepEqual(travel.map(x=>x.asset.id),list.map(x=>x.asset.id));
});
test('four material states are disjoint and excluded records never enter model input',()=>{
 const scope=buildMaterialScope({basket:['photo','paper'],coreIDs:['photo'],recommendations:[{asset:assets[2]},{asset:assets[3]}],excluded:['flower'],autoIncludeRecommendations:true});
 assert.deepEqual(scope.required,['photo']);assert.deepEqual(scope.preferred,['paper']);assert.deepEqual(scope.available,['ticket']);assert.deepEqual(scope.excluded,['flower']);assert.deepEqual(scope.candidateAssetIDs,['photo','paper','ticket']);
 assert.deepEqual(buildMaterialScope({...scope,basket:['photo','paper'],coreIDs:['photo'],recommendations:[{asset:assets[2]}],autoIncludeRecommendations:false}).candidateAssetIDs,['photo','paper']);
});
test('all candidates become required by default setting, while off keeps pinned required and others preferred',()=>{
 const options={basket:['photo','paper'],coreIDs:['photo'],recommendations:[{asset:assets[2]},{asset:assets[3]}],excluded:['flower'],autoIncludeRecommendations:true};
 const all=buildMaterialScope({...options,requireAllCandidates:true});
 assert.deepEqual(all.required,['photo','paper','ticket']);assert.deepEqual(all.preferred,[]);assert.deepEqual(all.available,[]);
 assert.deepEqual(all.candidateAssetIDs,['photo','paper','ticket']);
 const relaxed=buildMaterialScope({...options,requireAllCandidates:false});
 assert.deepEqual(relaxed.required,['photo']);assert.deepEqual(relaxed.preferred,['paper']);assert.deepEqual(relaxed.available,['ticket']);
});
test('matching model excludes rejected materials from recommendations and AI input',()=>{
 const state={assets,basket:[],coreIDs:[],excludedAssetIDs:['flower'],matchStyle:'旅行票据',matchStyles:['旅行票据'],matchPurpose:'旅途记录',matchPurposes:['旅途记录'],matchMode:'single',matchRatio:'a4',matchProcessing:'保留完整',matchIntent:'',recommendFilter:'全部',customPaperWidth:210,customPaperHeight:297,aiSettings:{autoIncludeRecommendations:true}};
 assert.ok(matchingRecommendations(state).length);
 const model=matchingViewModel(state);
 assert.ok(model.filtered.length);
 assert.ok(!model.filtered.some(item=>item.asset.id==='flower'));
 assert.ok(!model.scope.candidateAssetIDs.includes('flower'));
});
test('recommendations use all semantic tags and selected basket context',()=>{
 const selected=make('base','photo','旅行照片',['旅途']);selected.semanticColorNames=['蓝色'];selected.materialTags=['光面'];
 const related=make('related','tape','浅蓝胶带');related.semanticColorNames=['蓝色'];related.placementHints=['旅途'];related.materialTags=['光面'];
 const unrelated=make('unrelated','tape','纯红胶带');unrelated.semanticColorNames=['红色'];
 const result=recommendForDirection({assets:[selected,related,unrelated],basket:['base'],purposes:['旅途记录']});
 assert.equal(result[0].asset.id,'related');assert.ok(result[0].reasons.includes('配色关系'));
});

test('personal materials retain priority over equally relevant current built-ins',()=>{
 const builtin=make('builtin','paper','蓝色书写卡',['日常']);builtin.isBuiltinMaterial=true;
 const personal=make('personal','paper','蓝色书写卡',['日常']);
 const result=recommendForDirection({assets:[builtin,personal],purposes:['日常记录']});
 assert.equal(result[0].asset.id,'personal');
});

test('exclude 30 of 40 ranked assets before applying the 18-card view limit',()=>{
 const many=Array.from({length:40},(_,i)=>make('a'+i,'sticker','候选 '+String(i).padStart(2,'0')));
 const state={assets:many,basket:[],coreIDs:[],excludedAssetIDs:many.slice(0,30).map(a=>a.id),
   matchStyles:[],matchPurposes:[],recommendFilter:'全部',aiSettings:{autoIncludeRecommendations:true}};
 const view=matchingViewModel(state);
 assert.equal(view.filtered.length,10);assert.equal(view.recommendations.length,10);
});

test('older successfully AI-organized pending assets are still eligible for matching',()=>{
 const legacy={...make('legacy','paper','旧批次'),autoOrganized:true,reviewStatus:'pendingReview'};
 const unorganized={...make('unorganized','paper','刚导入'),reviewStatus:'pendingReview'};
 const rejected={...make('rejected','paper','被拒绝'),autoOrganized:true,reviewStatus:'rejected'};
 const ids=recommendForDirection({assets:[legacy,unorganized,rejected]}).map(row=>row.asset.id);
 assert.deepEqual(ids,['legacy']);
});

test('generic type and role do not count as content affinity; intent changes the shortlist',async()=>{
 const {creativePresetAssets}=await import('../src/creative-presets.js');
 const base={...make('base','sticker','素材1'),role:'accent',texture:'贴纸纸'};
 const generic={...make('plain','sticker','素材2'),role:'accent',texture:'贴纸纸'};
 const result=recommendForDirection({assets:[base,generic],basket:['base']});
 assert.ok(!result[0].reasons.includes('呼应已选素材'));
 const cats=recommendForDirection({assets:creativePresetAssets,intent:'想和猫待在一起'});
 const coffee=recommendForDirection({assets:creativePresetAssets,intent:'喝一杯咖啡'});
 assert.match(cats[0].asset.title,/猫/);assert.match(coffee[0].asset.title,/咖啡/);
 assert.notDeepEqual(cats.slice(0,6).map(r=>r.asset.id),coffee.slice(0,6).map(r=>r.asset.id));
});
test('automatic supplies are bounded, optional, persistent choices win, and UI/export scope agrees',async()=>{
 const {creativePresetAssets}=await import('../src/creative-presets.js');
 const {matchingScopeForState}=await import('../src/matching-view.js');
 const {normalizeMatchingDefaults}=await import('../src/cloud-matching-settings.js');
 const state={assets:[...assets,...creativePresetAssets],basket:['photo'],coreIDs:[],excludedAssetIDs:[creativePresetAssets[0].id],matchAutoUsePresets:true,matchIntent:'咖啡',matchStyles:[],matchPurposes:[],aiSettings:{autoIncludeRecommendations:false,requireAllCandidates:true}};
 const scope=matchingScopeForState(state);
 assert.deepEqual(scope.required,['photo']);assert.equal(scope.available.length,6);
 assert.ok(!scope.candidateAssetIDs.includes(creativePresetAssets[0].id));
 const byKind=scope.available.map(id=>state.assets.find(a=>a.id===id).kind);
 for(const kind of new Set(byKind))assert.ok(byKind.filter(k=>k===kind).length<=2);
 assert.deepEqual(matchingViewModel(state).scope,scope);
 assert.equal(normalizeMatchingDefaults(state).matchAutoUsePresets,true);
 assert.equal(normalizeMatchingDefaults({matchAutoUsePresets:'true'}).matchAutoUsePresets,undefined);
 const off=matchingScopeForState({...state,matchAutoUsePresets:false});assert.deepEqual(off.candidateAssetIDs,['photo']);
 const pinned=matchingScopeForState({...state,basket:['photo',scope.available[0]]});assert.ok(pinned.required.includes(scope.available[0]));
});
test('automatic recommendations use the same finite 18 rows in view and export',async()=>{
 const {matchingScopeForState}=await import('../src/matching-view.js');
 const state={assets:Array.from({length:80},(_,i)=>make('a'+i,'sticker','素材'+i)),basket:[],coreIDs:[],excludedAssetIDs:[],aiSettings:{autoIncludeRecommendations:true,requireAllCandidates:false},matchStyles:[],matchPurposes:[]};
 const scope=matchingScopeForState(state);assert.equal(scope.candidateAssetIDs.length,18);assert.deepEqual(scope,matchingViewModel(state).scope);
});
test('recommendation front avoids redundant roles and warns when an intact item does not fit',()=>{
 const selected={...make('s','photo','蓝色山景',['山景']),semanticColorNames:['浅蓝']};
 const papers=Array.from({length:8},(_,i)=>({...make('p'+i,'paper','蓝色山景纸',['山景']),role:'background',semanticColorNames:['天空蓝']}));
 const tape={...make('t','tape','蓝色连接带',['山景']),role:'connector',semanticColorNames:['蓝色']};
 const oversized={...make('big','photo','大照片'),physicalWidthMM:300,physicalHeightMM:100};
 const rows=recommendForDirection({assets:[selected,...papers,tape,oversized],basket:['s'],pageSize:{width:105,height:148}});
 assert.ok(rows.slice(0,4).some(row=>row.asset.id==='t'));
 assert.ok(rows.find(row=>row.asset.id==='big').reasons.includes('整件偏大，需裁取'));
});
