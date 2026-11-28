import test from 'node:test';
import assert from 'node:assert/strict';
import {partitionProjectList,isLegacySceneProject,attachSceneV2} from '../src/scene-v2.js';

const legacy=(id='old')=>({id,title:'旧作品',updatedAt:'2026-09-29T00:00:00Z',
 projectDocumentPath:'account/legacy-project.json.gz',
 drafts:[{id:'page',canvas:{width:707,height:1000},items:[],primitives:[],textBlocks:[],strokes:[]}]});
const current=()=>({id:'new',title:'新作品',drafts:[{id:'page',sceneVersion:2,
 canvas:{width:707,height:1000},layers:[]}]});
const snapshot=()=>({id:'image',isSnapshot:true,drafts:[{id:'snapshot',canvas:{width:707,height:1000},items:[]}]});

test('legacy editable project summaries are held aside without conversion or deletion',()=>{
 const old=legacy(),saved=JSON.stringify(old);
 const result=partitionProjectList([snapshot(),old,current()]);
 assert.equal(result.projects.length,2);
 assert.deepEqual(result.projects.map(r=>r.id),['image','new']);
 assert.deepEqual(result.quarantined,[{id:'old',title:'旧作品',
  updatedAt:'2026-09-29T00:00:00Z',hasDocument:true}]);
 assert.equal(JSON.stringify(old),saved,'cloud project record must remain untouched');
 assert.equal(isLegacySceneProject(old),true);
 assert.throws(()=>attachSceneV2(old.drafts[0]),/仅支持 Scene v2/);
});

test('invalid v2 and incomplete records must still fail instead of hiding damaged scenes',()=>{
 const broken=current();broken.drafts[0].layers=null;
 assert.throws(()=>partitionProjectList([broken]),/仅支持 Scene v2/);
 const mixed=current();mixed.drafts[0].items=[];
 assert.throws(()=>partitionProjectList([mixed]),/禁止保存旧版并行/);
 assert.equal(isLegacySceneProject(snapshot()),false);
});

test('legacy detection is data-shape based, not a title or age filter',()=>{
 const valid=current();valid.title='CeCe 的寒假手帐 · 第1页';valid.updatedAt='2020-01-01T00:00:00Z';
 assert.equal(isLegacySceneProject(valid),false);
 const old=legacy();old.title='新作品';assert.equal(isLegacySceneProject(old),true);
});
