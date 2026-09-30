import test from 'node:test';
import assert from 'node:assert/strict';
import {recommendForDirection,buildMaterialScope} from '../src/matching-materials.js';
import {matchingRecommendations,renderMatchingPage} from '../src/matching-view.js';
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
test('matching view places direction above recommendations and explains AI inclusion',()=>{
 const state={assets,basket:[],coreIDs:[],excludedAssetIDs:['flower'],matchStyle:'旅行票据',matchStyles:['旅行票据'],matchPurpose:'旅途记录',matchPurposes:['旅途记录'],matchMode:'single',matchRatio:'a4',matchProcessing:'保留完整',matchIntent:'',materialUseHints:{},materialUseRequired:{},recommendFilter:'全部',customPaperWidth:210,customPaperHeight:297,aiSettings:{autoIncludeRecommendations:true}};
 assert.ok(matchingRecommendations(state).length);
 const html=renderMatchingPage({state,head:()=>'<header></header>',imgTag:()=>'<img>',esc:String,kindName:String,session:{render:()=>'<footer></footer>'}});
 assert.ok(html.indexOf('match-direction')<html.indexOf('match-recommendations'));
 assert.match(html,/可以使用 · AI 备选/);
 assert.doesNotMatch(html,/花朵贴纸/);
});
