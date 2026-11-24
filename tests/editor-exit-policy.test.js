import test from 'node:test';
import assert from 'node:assert/strict';
import {editorExitDecision,isBlankEditableProject} from '../src/editor-exit-policy.js';
import {workInTab} from '../src/work-collections.js';

test('Back saves a new blank/AI work as draft and lists it under Drafts',()=>{
 const project={id:'new-work',isDraft:true,isSnapshot:false};
 const policy=editorExitDecision(project,'back-works');
 assert.deepEqual(policy,{isDraft:true,tab:'draft',publish:false,discard:false});
 assert.equal(workInTab({...project,isDraft:policy.isDraft},policy.tab),true);
 assert.equal(workInTab({...project,isDraft:policy.isDraft},'all'),false);
});
test('Complete publishes a new draft to Editable Works',()=>{
 const project={id:'new-work',isDraft:true,isSnapshot:false};
 const policy=editorExitDecision(project,'editor-done');
 assert.deepEqual(policy,{isDraft:false,tab:'all',publish:true,discard:false});
 assert.equal(workInTab({...project,isDraft:policy.isDraft},'all'),true);
 assert.equal(workInTab({...project,isDraft:policy.isDraft},'draft'),false);
});
test('leaving an empty new page discards it; a page with content remains a draft',()=>{
 const blank={id:'blank',isDraft:true,drafts:[{layers:[],items:[],strokes:[],textBlocks:[]}]};
 assert.equal(isBlankEditableProject(blank),true);
 assert.deepEqual(editorExitDecision(blank,'back-works'),{isDraft:false,tab:'all',publish:false,discard:true});
 assert.deepEqual(editorExitDecision(blank,'editor-done'),{isDraft:false,tab:'all',publish:false,discard:true});
 assert.equal(editorExitDecision({...blank,drafts:[{layers:[{id:'text'}]}]},'back-works').discard,false);
 assert.equal(editorExitDecision({...blank,isDraft:false},'back-works').discard,false);
});
test('Back never demotes an existing editable work',()=>{
 const policy=editorExitDecision({id:'saved',isDraft:false},'back-works');
 assert.equal(policy.isDraft,false);
 assert.equal(policy.tab,'all');
});
