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
