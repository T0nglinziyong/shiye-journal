import test from 'node:test';
import assert from 'node:assert/strict';
import {projectSemanticFingerprint} from '../src/project-semantic.js';

const work=()=>({id:'work',title:'一页',isDraft:false,updatedAt:'2026-10-15',
  drafts:[{id:'page',sceneVersion:2,coverImageID:'old-cover',coverSceneHash:'old-hash',
    layers:[{id:'shape',type:'shape',x:20,y:30,width:40,height:50}]}],
  activeDraftID:'page',manualArchives:[]});

test('derived cover, session history and timestamps do not create a new work version',()=>{
  const a=work(),b=work();
  b.updatedAt='2026-10-16';b.lastOpenedAt='2026-10-16';
  b.drafts[0].coverImageID='new-cover';b.drafts[0].coverSceneHash='new-hash';
  b.coverStaticPath='new-private-cover.webp';b.coverBaselineUpdatedAt='2026-10-16';
  b.sceneOperations=[{id:'last-undo-step'}];b.autoSceneSnapshots=[{id:'recovery'}];
  b.editHistory={undo:[{}],redo:[]};b.__cloudSessionId='session';
  assert.equal(projectSemanticFingerprint(a),projectSemanticFingerprint(b));
});

test('geometry, title, draft status, manual archives and significant order are edits',()=>{
  const baseline=projectSemanticFingerprint(work());
  for(const edit of [
    p=>{p.drafts[0].layers[0].x=21;},
    p=>{p.title='另一个名称';},
    p=>{p.isDraft=true;},
    p=>{p.manualArchives.push({id:'saved',title:'手动存档'});},
    p=>{p.drafts[0].layers.push({id:'other',type:'shape',x:0});p.drafts[0].layers.reverse();}
  ]){const p=work();edit(p);assert.notEqual(projectSemanticFingerprint(p),baseline);}
  assert.throws(()=>projectSemanticFingerprint({...work(),drafts:[{...work().drafts[0],layers:[{x:NaN}]}]}),/无效数值/);
});
