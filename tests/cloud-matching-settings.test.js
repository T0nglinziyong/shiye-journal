import test from 'node:test';
import assert from 'node:assert/strict';
import {CLOUD_MATCHING_SETTINGS_ID,cloudMatchingSettingsRecord,cloudMatchingSettingsFromMeta,applyMatchingDefaults} from '../src/cloud-matching-settings.js';
import {matchingSnapshot,restoreMatchingSession} from '../src/matching-session.js';

test('account cloud matching defaults retain non-content creative direction only',()=>{
 const state={matchMode:'spread',matchRatio:'a5',matchStyle:'杂志网格',matchStyles:['杂志网格','复古旧物'],matchPurposes:['旅途记录'],matchPurpose:'旅途记录',matchProcessing:'少量裁剪',matchContentPolicy:'documentary',matchTextPresentation:'handwritten',customPaperWidth:210,customPaperHeight:297,materialUseHints:{asset_1:'保留完整'},materialUseRequired:{asset_1:true},assetProcessing:{asset_1:'少量裁剪'},recommendFilter:'材质',matchIntent:'私密的创作要求与内容',basket:['asset_1'],coreIDs:['asset_1'],apiKey:'secret'};
 const row=cloudMatchingSettingsRecord(state);
 assert.equal(row.id,CLOUD_MATCHING_SETTINGS_ID);
 const raw=JSON.stringify(row);
 for(const secret of ['私密的创作要求与内容','"basket"','"coreIDs"','apiKey','secret'])assert.ok(!raw.includes(secret));
 const next={matchIntent:'本机新内容',basket:['other'],matchMode:'single'};
 applyMatchingDefaults(next,cloudMatchingSettingsFromMeta([row]));
 assert.equal(next.matchMode,'spread');assert.equal(next.matchRatio,'a5');assert.equal(next.matchTextPresentation,'handwritten');
 assert.deepEqual(next.materialUseHints,{asset_1:'保留完整'});
 assert.equal(next.matchIntent,'本机新内容');assert.deepEqual(next.basket,['other']);
});

test('cloud matching defaults reject malformed and extra fields',()=>{
 assert.equal(cloudMatchingSettingsFromMeta([{id:CLOUD_MATCHING_SETTINGS_ID,settings:[]}]),null);
 const record=cloudMatchingSettingsRecord({matchRatio:'a4',matchIntent:'never',materialUseRequired:{safe:true,bad:'yes'},customPaperWidth:Infinity,matchStyles:['自然植物',3,'自然植物'],bogus:true});
 assert.deepEqual(record.settings,{matchRatio:'a4',matchStyles:['自然植物'],materialUseRequired:{safe:true}});
});

test('cloud controls override stale device defaults only after local matching restore',()=>{
 const accountRecord=cloudMatchingSettingsRecord({matchMode:'spread',matchRatio:'a5',matchStyle:'手写日记',matchTextPresentation:'handwritten'});
 const oldDevice=matchingSnapshot({matchMode:'single',matchRatio:'a4',matchIntent:'仅此设备的正文',basket:['material-1']},[]);
 const fresh={matchMode:'single',matchRatio:'a4',matchIntent:'',basket:[]};
 restoreMatchingSession(oldDevice,fresh);
 applyMatchingDefaults(fresh,cloudMatchingSettingsFromMeta([accountRecord]));
 assert.equal(fresh.matchMode,'spread');assert.equal(fresh.matchRatio,'a5');
 assert.equal(fresh.matchTextPresentation,'handwritten');
 assert.equal(fresh.matchIntent,'仅此设备的正文');assert.deepEqual(fresh.basket,['material-1']);
});
