import test from 'node:test';import assert from 'node:assert/strict';
import {projectSummary,mergeProjectSummary} from '../src/project-document.js';
import {pinProjectMaterialImages} from '../src/scene-material-references.js';
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

test('large project summary protects the exact image version used by its scene',()=>{
 const full={id:'pinned',drafts:[{id:'d',layers:[
   {id:'m',type:'material',assetID:'asset-1',sourceBlobId:'first-image'}]}]};
 const summary=projectSummary(full,'owner/work.json');
 assert.deepEqual(summary.sceneAssetIDs,['asset-1']);
 assert.deepEqual(summary.sceneBlobIDs,['first-image']);
 assert.deepEqual(summary.drafts[0].layers,[]);
});

test('an older work pins its current image once and keeps it after the library changes',()=>{
 const node={id:'m',type:'material',assetID:'a'};
 const work={drafts:[{id:'d',layers:[node]}]},source={id:'a',blobId:'first'};
 assert.equal(pinProjectMaterialImages(work,()=>source),true);
 assert.equal(node.sourceBlobId,'first');
 source.blobId='second';
 assert.equal(pinProjectMaterialImages(work,()=>source),false);
 assert.equal(node.sourceBlobId,'first');
 assert.deepEqual(projectSummary(work,'work.json').sceneBlobIDs,['first']);
});
