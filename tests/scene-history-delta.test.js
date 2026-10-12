import test from 'node:test';
import assert from 'node:assert/strict';
import {draft} from '../src/domain.js';
import {checkpointEditorHistory,resetEditorHistory,takeEditorHistoryStep} from '../src/editor-history-scope.js';
import {createSceneTransition,applySceneTransition} from '../src/scene-history-delta.js';

const setup=()=>{const d=draft();d.id='D';return d;};
test('40 text edits use compact reversible transactions instead of 40 full drafts',()=>{
 const d=setup(),state={activeProject:{id:'P'},activeDraft:d.id,undo:[],redo:[]};
 d.textBlocks.push({id:'text',content:'',color:'#445566',x:100,y:120,width:200,height:80});
 d.items.push({id:'photo',assetID:'asset',x:100,y:300,width:300,height:300,stockId:4,metadata:'X'.repeat(10000)});
 resetEditorHistory(state);
 for(let index=0;index<40;index++){checkpointEditorHistory(state,d);d.textBlocks[0].content+='字';}
 assert.equal(state.undo.length,40);
 assert.equal(state.undo.filter(x=>x.kind==='scene-pending-v2').length,1);
 assert.ok(JSON.stringify(state.undo).length<JSON.stringify(d).length*3,'history must not multiply large unaffected image metadata');
 let current=d;
 for(let n=0;n<40;n++)current=takeEditorHistoryStep(state,'undo','redo',current);
 assert.equal(current.textBlocks[0].content,'');
 for(let n=0;n<40;n++)current=takeEditorHistoryStep(state,'redo','undo',current);
 assert.equal(current.textBlocks[0].content,'字'.repeat(40));
});
test('nested structural edits, undo and redo retain tree and stroke pressure',()=>{
 const before=setup();before.strokes.push({id:'ink',color:'#445566',width:3,points:[{x:10,y:20,p:.5}]});
 const after=structuredClone(before);
 after.layers=[{id:'group',type:'group',name:'书写组',children:[after.layers[0]]}];
 after.layers[0].children[0].points[0].x=80;
 const t=createSceneTransition(before,after);
 const restored=applySceneTransition(after,t,'before');
 assert.deepEqual(JSON.parse(JSON.stringify(restored)),JSON.parse(JSON.stringify(before)));
 const again=applySceneTransition(restored,t,'after');
 assert.deepEqual(JSON.parse(JSON.stringify(again)),after);
});
test('edit-free checkpoint contributes no undoable action',()=>{
 const d=setup(),state={activeProject:{id:'P'},activeDraft:'D',undo:[],redo:[]};
 resetEditorHistory(state);checkpointEditorHistory(state,d);
 assert.equal(takeEditorHistoryStep(state,'undo','redo',d),null);
 assert.equal(state.undo.length,0);
});

test('moving a heavy material stores only geometry fields in the history transaction',()=>{
 const before=setup();before.items.push({id:'a',assetID:'paper',x:20,y:60,width:100,height:90,source:'X'.repeat(200000)});
 const after=structuredClone(before);after.layers[0].x=70;
 const change=createSceneTransition(before,after);
 assert.deepEqual(change.nodes[0].fields.map(item=>item.key),['x']);
 assert.ok(JSON.stringify(change).length<2000);
 assert.equal(applySceneTransition(after,change,'before').layers[0].x,20);
});
