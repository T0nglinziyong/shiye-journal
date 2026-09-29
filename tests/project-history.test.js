import test from 'node:test';
import assert from 'node:assert/strict';
import {historyTitle,renameHistory,deleteDraft} from '../src/project-history.js';
test('initial history is named, rename persists and delete keeps a valid active draft',()=>{
  const p={drafts:[{id:'a'},{id:'b'}],activeDraftID:'a'};
  assert.equal(historyTitle(p.drafts[0]),'最初方案');renameHistory(p.drafts[1],' 新排版 ');assert.equal(historyTitle(p.drafts[1],1),'新排版');
  assert.throws(()=>renameHistory(p.drafts[0],''));deleteDraft(p,'a');assert.equal(p.activeDraftID,'b');assert.throws(()=>deleteDraft(p,'b'));assert.equal(p.drafts.length,1);
});
