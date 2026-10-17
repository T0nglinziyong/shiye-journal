import test from 'node:test';
import assert from 'node:assert/strict';
import {project} from '../src/domain.js';
import {createNativeProjectDocument,importNativeProjectDocument} from '../src/native-project-package.js';

test('editable work round-trips as JSON without a ZIP or matching session',()=>{
  const source=project('可编辑作品');
  const document=createNativeProjectDocument(source);
  const reopened=importNativeProjectDocument(JSON.parse(JSON.stringify(document)),[]);
  assert.equal(reopened.title,source.title);
  assert.equal(reopened.isDraft,true);
  assert.notEqual(reopened.id,source.id);
  assert.equal(reopened.drafts.length,source.drafts.length);
});

test('JSON work import checks referenced library assets',()=>{
  const source=project('素材作品');
  source.drafts[0].items.push({id:'item-1',assetID:'missing-asset',x:50,y:50,width:40,height:40,rotation:0,zIndex:1,opacity:1});
  const document=createNativeProjectDocument(source);
  assert.throws(()=>importNativeProjectDocument(document,[]),/不存在的素材/);
});

test('imported project starts its own history at the imported artwork',()=>{
  const source=project('外部作品');
  source.drafts[0].layers.push({id:'title',type:'text',content:'导入后',color:'#334455',fontSize:22,
    x:70,y:90,width:200,height:50});
  const imported=importNativeProjectDocument(createNativeProjectDocument(source),[]);
  assert.equal(source.initialEditorSnapshot.drafts[0].textBlocks.length,0);
  assert.equal(imported.initialEditorSnapshot.drafts[0].layers[0].content,'导入后');
  assert.deepEqual(imported.draftHistorySnapshots[imported.activeDraftID].layers,
    imported.drafts[0].layers);
});
