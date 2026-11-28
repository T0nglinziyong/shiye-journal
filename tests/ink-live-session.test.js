import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {mountLiveInkStroke} from '../src/ink-live-svg.js';
import {newEditorSession,editorSessionHasEdits} from '../src/editor-session-policy.js';

test('pen-up publishes an editable smooth SVG without remounting the canvas',()=>{
 const before=globalThis.document,dom=new Window({url:'http://localhost/'});
 globalThis.document=dom.document;
 try{
  const page=dom.document.createElement('div');
  page.innerHTML='<canvas class="paper-layer"></canvas><canvas id="ink"></canvas>';
  dom.document.body.append(page);
  const canvas=page.querySelector('#ink');
  const stroke={id:'s1',width:4,color:'#112233',points:[
    {x:0,y:0,p:.5},{x:10,y:20,p:.5},{x:20,y:30,p:.5},{x:40,y:60,p:.5}
  ]};
  const ink=mountLiveInkStroke(page,{canvas:{width:700,height:1000}},stroke);
  assert.equal(ink.tagName.toLowerCase(),'svg');
  assert.equal(ink.getAttribute('data-render-key'),'s1');
  assert.match(ink.innerHTML,/ Q/i);
  assert.equal(ink.nextElementSibling,page.querySelector('.paper-layer'));
  assert.equal(page.querySelector('#ink'),canvas);
  assert.equal(mountLiveInkStroke(page,{canvas:{width:700,height:1000}},stroke),ink);
 }finally{
  globalThis.document=before;void dom.happyDOM.abort();
 }
});
test('readonly editor entry/exit has no save intent even with old snapshot count',()=>{
 const project={id:'saved',sceneOperationsSinceSnapshot:12},
   versions=new Map(),session=newEditorSession(project,versions);
 assert.equal(editorSessionHasEdits(project,session,versions),false);
 // Remote metadata changes should not be mistaken for local modifications.
 project.updatedAt='2026-10-13T15:30:00Z';
 assert.equal(editorSessionHasEdits(project,session,versions),false);
 versions.set(project.id,1);
 assert.equal(editorSessionHasEdits(project,session,versions),true);
 assert.equal(editorSessionHasEdits({id:'different'},session,versions),false);
});
