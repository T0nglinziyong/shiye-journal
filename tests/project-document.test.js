import test from 'node:test';import assert from 'node:assert/strict';
import {projectSummary,mergeProjectSummary} from '../src/project-document.js';
test('metadata summaries omit large geometry and merge edits without losing the private document',()=>{
  const full={id:'p',title:'before',editHistory:{undo:[{}]},manualArchives:[{}],drafts:[{id:'d',canvas:{width:100,height:100},coverBlobId:'cover',items:[{id:'i'}],primitives:[{id:'v',vectorLayers:[{}]}],textBlocks:[{content:'private'}],strokes:[{}],makingSteps:[]}]};
  const summary=projectSummary(full,'owner/hash-project.json');assert.equal(JSON.stringify(summary).includes('private'),false);assert.equal(summary.drafts[0].coverBlobId,'cover');summary.title='after';const merged=mergeProjectSummary(full,summary);assert.equal(merged.title,'after');assert.deepEqual(merged.drafts[0].primitives,full.drafts[0].primitives);assert.deepEqual(merged.editHistory,full.editHistory);assert.equal('projectDocumentPath' in merged,false);
});
