import test from 'node:test';import assert from 'node:assert/strict';
import {projectSummary,mergeProjectSummary} from '../src/project-document.js';
test('cloud summary strips large v2 layers while preserving complete source document',()=>{
 const full={id:'p',title:'before',editHistory:{undo:[{}]},manualArchiveStore:{huge:{chunks:['SENSITIVE_COMPRESSED_HISTORY']}},drafts:[{id:'d',canvas:{width:700,height:1000},coverBlobId:'cover',
 layers:[{id:'t',type:'text',content:'private',x:5,y:5,width:30,height:30}]}]};
 const summary=projectSummary(full,'owner/hash-project.json');
 assert.equal(JSON.stringify(summary).includes('private'),false);
 assert.equal(Object.hasOwn(summary,'manualArchiveStore'),false);
 assert.deepEqual(mergeProjectSummary(full,summary).manualArchiveStore,full.manualArchiveStore);
 assert.deepEqual(summary.drafts[0].layers,[]);
 summary.title='after';
 const merged=mergeProjectSummary(full,summary);
 assert.equal(merged.title,'after');
 assert.equal(merged.drafts[0].layers[0].content,'private');
});
