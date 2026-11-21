import test from 'node:test';
import assert from 'node:assert/strict';
import {editorExitDecision} from '../src/editor-exit-policy.js';
import {workInTab} from '../src/work-collections.js';

test('Back saves a new blank/AI work as draft and lists it under Drafts',()=>{
 const project={id:'new-work',isDraft:true,isSnapshot:false};
 const policy=editorExitDecision(project,'back-works');
 assert.deepEqual(policy,{isDraft:true,tab:'draft',publish:false});
 assert.equal(workInTab({...project,isDraft:policy.isDraft},policy.tab),true);
 assert.equal(workInTab({...project,isDraft:policy.isDraft},'all'),false);
});
test('Complete publishes a new draft to Editable Works',()=>{
 const project={id:'new-work',isDraft:true,isSnapshot:false};
 const policy=editorExitDecision(project,'editor-done');
 assert.deepEqual(policy,{isDraft:false,tab:'all',publish:true});
 assert.equal(workInTab({...project,isDraft:policy.isDraft},'all'),true);
 assert.equal(workInTab({...project,isDraft:policy.isDraft},'draft'),false);
});
test('Back never demotes an existing editable work',()=>{
 const policy=editorExitDecision({id:'saved',isDraft:false},'back-works');
 assert.equal(policy.isDraft,false);
 assert.equal(policy.tab,'all');
});
