import test from 'node:test';
import assert from 'node:assert/strict';
import {renderMatchingPage} from '../src/matching-view.js';
import {matchingSnapshot,restoreMatchingSession} from '../src/matching-session.js';

const state=()=>({
 assets:[],basket:[],coreIDs:[],excludedAssetIDs:[],matchStyles:[],matchPurposes:[],
 matchContentPolicy:'documentary',matchTextPresentation:'handwritten',
 matchUserText:'',matchFacts:'',matchMode:'spread',matchRatio:'a4',matchProcessing:'不预设',
 matchIntent:'给猫咪写下生日小记',materialUseHints:{},materialUseRequired:{},
 recommendFilter:'全部',customPaperWidth:210,customPaperHeight:297,
 aiSettings:{requireAllCandidates:false,autoIncludeRecommendations:false}
});
test('matching text content and lettering controls align above page settings',()=>{
 const s=state(),html=renderMatchingPage({state:s,head:()=>'<header></header>',imgTag:()=>'<img>',esc:String,kindName:String,session:{render:()=>''}});
 assert.match(html,/>文字内容<\/select>|>文字内容<select/);
 assert.match(html,/文字表现方式/);
 assert.match(html,/自由手写/);
 assert.match(html,/混合编排/);
 assert.match(html,/创作要求和内容/);
 assert.match(html,/给猫咪写下生日小记/);
 assert.doesNotMatch(html,/补充原文或已知事实/);
 assert.ok(html.indexOf('id="match-content-policy"')<html.indexOf('id="match-mode"'));
 assert.ok(html.indexOf('id="match-text-presentation"')<html.indexOf('id="match-ratio"'));
});
test('matching session preserves explicit handwriting choice',()=>{
 const s=state(),snapshot=matchingSnapshot(s,[]),after={...state(),matchTextPresentation:'type'};
 restoreMatchingSession(snapshot,after);
 assert.equal(after.matchTextPresentation,'handwritten');
 assert.equal(after.matchIntent,'给猫咪写下生日小记');
});
