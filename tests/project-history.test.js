import test from 'node:test';
import assert from 'node:assert/strict';
import {historyTitle,renameHistory,deleteDraft,captureHistory,restoreHistoryDraft} from '../src/project-history.js';
import {draft as createDraft} from '../src/domain.js';
import {attachSceneV2} from '../src/scene-v2.js';
test('initial history is named, rename persists and delete keeps a valid active draft',()=>{
  const p={drafts:[{id:'a'},{id:'b'}],activeDraftID:'a'};
  assert.equal(historyTitle(p.drafts[0]),'最初版本');renameHistory(p.drafts[1],' 新排版 ');assert.equal(historyTitle(p.drafts[1],1),'新排版');
  assert.throws(()=>renameHistory(p.drafts[0],''));deleteDraft(p,'a');assert.equal(p.activeDraftID,'b');assert.throws(()=>deleteDraft(p,'b'));assert.equal(p.drafts.length,1);
});
test('current history snapshots remain immutable across editing, restoring and reopening',()=>{
  const a=createDraft(),b=createDraft();a.id='a';b.id='b';
  a.items.push({id:'m',assetID:'real',x:10,y:20,width:20,height:20});
  a.textBlocks.push({id:'t',x:40,y:80,width:110,height:40,content:'initial',color:'#224466',fontSize:24});
  const p={drafts:[a,b],activeDraftID:'a',initialEditorSnapshot:{drafts:[structuredClone(a),structuredClone(b)],activeDraftID:'a'},draftHistorySnapshots:{a:structuredClone(a),b:structuredClone(b)}};
  assert.equal(captureHistory(p),false);attachSceneV2(p.drafts[0]).items[0].x=80;attachSceneV2(p.drafts[0]).textBlocks[0].content='edited';
  assert.equal(captureHistory(p),false);renameHistory(p.drafts[0],'原版');
  const restored=restoreHistoryDraft(p,'a');assert.equal(restored.items[0].x,10);assert.equal(restored.textBlocks[0].content,'initial');assert.equal(restored.title,'原版');
  restored.items[0].x=99;const reopened=structuredClone(p);restoreHistoryDraft(reopened,'a');assert.equal(attachSceneV2(reopened.drafts[0]).items[0].x,10);
  assert.throws(()=>restoreHistoryDraft(p,'missing'));deleteDraft(p,'b');assert.equal(p.draftHistorySnapshots.b,undefined);
});
