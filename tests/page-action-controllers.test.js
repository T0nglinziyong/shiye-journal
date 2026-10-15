import test from 'node:test';
import assert from 'node:assert/strict';
import {createActionStore} from '../src/ui-action-store.js';
import {createPageControllerHost} from '../src/page-controller-host.js';
import {registerLibraryActions} from '../src/page-controllers/library-controller.js';
import {registerImportActions} from '../src/page-controllers/import-controller.js';
import {registerSettingsActions} from '../src/page-controllers/settings-controller.js';
import {registerEditorActions} from '../src/page-controllers/editor-controller.js';

test('Action/State publishes explicit changes with scoped subscriptions',async()=>{
  const state={query:'',sort:'newest'},actions=createActionStore(state);
  const messages=[];
  actions.register('library/query',({value})=>({
    changes:{query:value},scope:'library',ids:['record-1']
  }));
  const off=actions.subscribe(e=>messages.push(e),{scope:'library'});
  await actions.dispatch({type:'library/query',payload:{value:'照片'}});
  assert.equal(state.query,'照片');
  assert.equal(messages.length,1);
  assert.deepEqual(messages[0].keys,['query']);
  assert.deepEqual(messages[0].ids,['record-1']);
  assert.equal(messages[0].scope,'library');
  assert.equal(messages[0].revision,1);
  off();
  await actions.dispatch({type:'library/query',payload:{value:'贴纸'}});
  assert.equal(messages.length,1);
});
test('Action/store emits no notification on failed persistence',async()=>{
  const state={assets:[{id:'a',isFavorite:false}]},actions=createActionStore(state);
  let count=0;
  const db={put:async()=>{throw Error('write failed')}};
  registerLibraryActions(actions,{db,state,asset:id=>state.assets.find(a=>a.id===id)});
  actions.subscribe(()=>count++);
  await assert.rejects(actions.dispatch({type:'library/favorite',payload:{id:'a'}}),/write failed/);
  assert.equal(state.assets[0].isFavorite,false);
  assert.equal(count,0);
});
test('Library controller reports favorite and filters without touching DOM',async()=>{
  const state={assets:[{id:'a',isFavorite:false}],query:''},actions=createActionStore(state);
  const saved=[];
  registerLibraryActions(actions,{state,db:{put:async(_type,record)=>saved.push(record)},
    asset:id=>state.assets.find(a=>a.id===id)});
  await actions.dispatch({type:'library/filter',payload:{key:'query',value:'春日'}});
  await actions.dispatch({type:'library/favorite',payload:{id:'a'}});
  assert.equal(state.query,'春日');
  assert.equal(state.assets[0].isFavorite,true);
  assert.equal(saved.length,1);
  await assert.rejects(actions.dispatch({type:'library/filter',payload:{key:'secret',value:'x'}}),/未知/);
});
test('Import candidate selection publishes one event and preserves source records',async()=>{
  const state={importCandidates:[{},{}],importIndex:0,
    importRecords:[{confirmed:true,selectedCandidates:[{selected:true}]}],
    importCandidateSelection:new Set()},actions=createActionStore(state);
  let saves=0,events=[];
  registerImportActions(actions,{state,saveActiveImportRecord:()=>saves++});
  actions.subscribe(e=>events.push(e));
  await actions.dispatch({type:'import/candidate/toggle',payload:{index:1}});
  assert.ok(state.importCandidateSelection.has(1));
  assert.equal(state.importRecords[0].confirmed,false);
  assert.equal(saves,1);
  assert.equal(events[0].scope,'import');
  await actions.dispatch({type:'import/review/toggle',payload:{record:0,index:0}});
  assert.equal(state.importRecords[0].selectedCandidates[0].selected,false);
  assert.equal(events.length,2);
  await assert.rejects(actions.dispatch({type:'import/candidate/toggle',payload:{index:99}}),/序号无效/);
  assert.equal(events.length,2);
});
test('Settings section transition is independent of DOM',async()=>{
  const state={},actions=createActionStore(state);
  registerSettingsActions(actions);
  await actions.dispatch({type:'settings/section',payload:{section:'AI 与创作'}});
  assert.equal(state.settingsSection,'AI 与创作');
});
test('Editor undo action requests a render only when a history step exists',async()=>{
  const actions=createActionStore({}),events=[];
  registerEditorActions(actions,{historyStep:from=>from==='undo'});
  actions.subscribe(e=>events.push(e),{scope:'editor'});
  await actions.dispatch({type:'editor/undo'});
  await actions.dispatch({type:'editor/redo'});
  assert.deepEqual(events.map(e=>e.type),['editor/undo']);
});
test('Page host mounts once, patches same controller, disposes on remount',()=>{
  const host=createPageControllerHost(),target=new EventTarget();
  let count=0,events=0;
  host.register('library',{
    patch:()=>true,
    mount(lifetime){count++;lifetime.on(target,'change',()=>events++);}
  });
  host.register('works',{
    patch:()=>false,mount(){count++;}});
  host.mount('library');
  assert.equal(host.patch('library'),true);
  target.dispatchEvent(new Event('change'));assert.equal(events,1);
  host.dispose();
  target.dispatchEvent(new Event('change'));assert.equal(events,1);
  assert.equal(host.patch('library'),false);
  host.mount('works');assert.equal(count,2);
  host.dispose();host.dispose();
});
