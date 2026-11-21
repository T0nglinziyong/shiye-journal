import test from 'node:test';
import assert from 'node:assert/strict';
import {captureVisualState} from '../compute-server/harness/observation.mjs';
import {createHarnessRenderer} from '../compute-server/harness/renderer.mjs';
import {createCreationDocument} from '../src/creation-document.js';
import {applyCreationTransaction,creationSceneRevision} from '../src/creation-transaction.js';
import {draft} from '../src/domain.js';
import {createHash} from 'node:crypto';

const image='data:image/png;base64,cGFnZQ==';
const spaces=[{id:'page'},{id:'tray'}];
const fingerprint=value=>'sha256:'+createHash('sha256').update(value).digest('hex');
const preview=(page='page-a',tray='tray-a')=>({pngHash:fingerprint(page),imageURL:image,spaceViews:[
  {id:'page',signature:fingerprint(page),imageURL:image,items:['title']},
  {id:'tray',signature:tray,imageURL:image,items:[{alias:'m1'}]}
]});

test('visual observations retain an unchanged page while sending only the changed tray image',()=>{
  const first=captureVisualState({preview:preview(),spaces,turn:1});
  assert.deepEqual(first.changed.map(view=>view.id),['page','tray']);
  const next=captureVisualState({preview:preview('page-a','tray-b'),spaces,previous:first.observations,turn:2});
  assert.deepEqual(next.changed.map(view=>view.id),['tray']);
  assert.equal(next.observations.page.lastSeenTurn,1);
  assert.equal(next.observations.tray.lastSeenTurn,2);
  assert.deepEqual(next.observations.page.items,['title']);
});

test('visual observation rejects missing, duplicated or contradictory space frames',()=>{
  const first=captureVisualState({preview:preview(),spaces,turn:1});
  assert.throws(()=>captureVisualState({preview:{...preview(),spaceViews:preview().spaceViews.slice(0,1)},spaces,turn:2}),/空间与当前 Scene 不一致/);
  assert.throws(()=>captureVisualState({preview:{...preview(),spaceViews:[preview().spaceViews[0],preview().spaceViews[0]]},spaces,turn:2}),/空间与当前 Scene 不一致/);
  const wrongPage=preview();wrongPage.spaceViews[0].signature='sha256:'+'0'.repeat(64);
  assert.throws(()=>captureVisualState({preview:wrongPage,spaces,turn:2}),/纸面预览图与图像指纹不一致/);
  const noPixels=preview();noPixels.spaceViews[1].imageURL=null;
  assert.throws(()=>captureVisualState({preview:noPixels,spaces,turn:2}),/空间图像或版本无效/);
  const empty=preview();empty.spaceViews[1]={id:'tray',signature:'tray-a',imageURL:null,items:[]};
  assert.throws(()=>captureVisualState({preview:empty,spaces,previous:first.observations,turn:2}),/版本状态冲突/);
});

test('real page screenshot version follows rendered pixels through an edit',async()=>{
  const document=await createCreationDocument({draft:draft(),assets:[]});
  const renderer=await createHarnessRenderer({source:document.source,images:{},saveArtifact:async()=>null});
  const before=await renderer.render(document);
  assert.equal(before.spaceViews[0].signature,before.pngHash);
  assert.equal(before.spaceViews[0].imageURL,null);
  const changed=applyCreationTransaction(document,{protocolVersion:2,transactionId:'title',baseSceneRevision:creationSceneRevision(document),operations:[
    {op:'text.add',id:'title',content:'手帐',place:{reference:'page',at:[40,50],unit:'mm'},size:{width:50,unit:'mm'}}
  ]},[]).document;
  const after=await renderer.render(changed);
  assert.equal(after.spaceViews[0].signature,after.pngHash);
  assert.match(after.spaceViews[0].imageURL,/^data:image\/jpeg;base64,/);
  assert.notEqual(after.spaceViews[0].signature,before.spaceViews[0].signature);
  assert.equal((await renderer.render(changed)).spaceViews[0].signature,after.spaceViews[0].signature);
});
