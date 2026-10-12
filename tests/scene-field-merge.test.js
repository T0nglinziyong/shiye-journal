import test from 'node:test';
import assert from 'node:assert/strict';
import {project} from '../src/domain.js';
import {recordSceneOperation,makeAutoSceneSnapshot,restoreAutoSceneSnapshot} from '../src/scene-persistence.js';
import {mergeEditableSceneProjects} from '../src/scene-field-merge.js';

const date=i=>new Date(Date.UTC(2026,9,13,0,0,i)).toISOString();
function scene(){
 const p=project('test');p.updatedAt=date(0);
 p.drafts[0].items.push({id:'a',assetID:'asset',x:20,y:40,width:150,height:180});
 p.drafts[0].textBlocks.push({id:'b',content:'old',x:60,y:70,width:120,height:50});
 return p;
}
function change(p,fn,second){
 const old=structuredClone(p.drafts[0]);
 fn(p.drafts[0]);
 recordSceneOperation(p,old,p.drafts[0],{at:date(second),actor:'device'+second});
 p.updatedAt=date(second);
 return p;
}
test('independent layers from two devices merge',()=>{
 const l=change(scene(),d=>d.items[0].x=70,10);
 const r=change(scene(),d=>d.textBlocks[0].content='phone',20);
 const merged=mergeEditableSceneProjects(l,r);
 assert.equal(merged.drafts[0].items[0].x,70);
 assert.equal(merged.drafts[0].textBlocks[0].content,'phone');
});
test('same layer, different properties combine',()=>{
 const l=change(scene(),d=>d.items[0].rotation=33,10);
 const r=change(scene(),d=>d.items[0].x=90,20);
 const merged=mergeEditableSceneProjects(l,r);
 assert.equal(merged.drafts[0].items[0].rotation,33);
 assert.equal(merged.drafts[0].items[0].x,90);
});
test('same attribute uses last explicit edit',()=>{
 const early=change(scene(),d=>d.items[0].x=1,10);
 const late=change(scene(),d=>d.items[0].x=2,20);
 assert.equal(mergeEditableSceneProjects(early,late).drafts[0].items[0].x,2);
 assert.equal(mergeEditableSceneProjects(late,early).drafts[0].items[0].x,2);
});
test('completing the work saves a verified editable archive',()=>{
 const p=scene();
 assert.equal(makeAutoSceneSnapshot(p,{reason:'completed',force:true}),true);
 assert.equal(p.autoSceneSnapshots[0].reason,'completed');
 assert.equal(restoreAutoSceneSnapshot(p,p.autoSceneSnapshots[0].id).drafts[0].items[0].x,20);
});

test('different newly added layers remain independently editable',()=>{
 const l=change(scene(),d=>d.textBlocks.push({
   id:'mobile',content:'phone',x:90,y:100,width:120,height:40}),10);
 const r=change(scene(),d=>d.textBlocks.push({
   id:'desktop',content:'mac',x:120,y:80,width:120,height:40}),20);
 const merged=mergeEditableSceneProjects(l,r);
 assert.ok(merged);
 assert.equal(merged.drafts[0].textBlocks.length,3);
 assert.deepEqual(new Set(merged.drafts[0].textBlocks.map(n=>n.id)),
   new Set(['b','mobile','desktop']));
});
test('remote delete is not undone by a concurrent local position change',()=>{
 const l=change(scene(),d=>d.items[0].x=77,10);
 const r=change(scene(),d=>{d.items.splice(0,1);},20);
 const merged=mergeEditableSceneProjects(l,r);
 assert.ok(merged);
 assert.equal(merged.drafts[0].items.length,0);
});
