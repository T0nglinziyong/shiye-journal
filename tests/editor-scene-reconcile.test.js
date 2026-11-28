import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {reconcileEditorScene} from '../src/editor-scene-reconcile.js';

test('recursive scene updates preserve the actual canvas page, editable text, image and sibling order',()=>{
 const w=new Window(),root=w.document.createElement('div');w.document.body.append(root);
 root.innerHTML='<div data-scene-group="g" class="scene-v2-group"><div data-render-key="text" data-object="text" data-kind="text" class="canvas-object text"><div data-text-content>hello</div></div><div data-render-key="mat" data-object="mat" data-kind="material" class="canvas-object material"><img src="/a.webp"></div></div><canvas class="paper-layer"></canvas><canvas id="ink"></canvas>';
 const paper=root.querySelector('canvas.paper-layer'),ink=root.querySelector('#ink');
 const text=root.querySelector('[data-object="text"]'),image=root.querySelector('img');
 const input=w.document.createElement('textarea');input.className='canvas-inline-text';text.replaceChildren(input);text.classList.add('typing');input.value='正在输入';
 const markup='<div data-scene-group="g" class="scene-v2-group" style="opacity:.6"><div data-render-key="mat" data-object="mat" data-kind="material" class="canvas-object material" style="left:10px"><img src="/a.webp"></div><div data-render-key="text" data-object="text" data-kind="text" class="canvas-object text"><div data-text-content>REWRITTEN</div></div></div><canvas class="paper-layer"></canvas>';
 const result=reconcileEditorScene(root,markup,{onText:(old,n)=>old.querySelector('[data-text-content]')?.replaceWith(n.querySelector('[data-text-content]')),onImage:(old,n)=>{const img=old.querySelector('img');if(img?.getAttribute('src')!==n.querySelector('img')?.getAttribute('src'))img.src=n.querySelector('img').src;}});
 assert.equal(result.preserved,3);assert.equal(result.created,0);
 assert.equal(root.querySelector('canvas.paper-layer'),paper);assert.equal(root.querySelector('#ink'),ink);
 assert.equal(root.querySelector('[data-object="text"]'),text);assert.equal(root.querySelector('img'),image);
 assert.equal(root.querySelector('.canvas-inline-text'),input);assert.equal(input.value,'正在输入');
 assert.deepEqual([...root.querySelector('[data-scene-group="g"]').children].map(el=>el.dataset.object),['mat','text']);
});

test('removing and regrouping just one leaf does not recreate unaffected siblings',()=>{
 const w=new Window(),root=w.document.createElement('div');w.document.body.append(root);
 root.innerHTML='<div data-object="A" data-render-key="A" class="canvas-object material" data-kind="material"><img src="/a"></div><div data-object="B" data-render-key="B" class="canvas-object material" data-kind="material"><img src="/b"></div><canvas class="paper-layer"></canvas>';
 const keep=root.querySelector('[data-object="A"]');
 const markup='<div data-object="A" data-render-key="A" class="canvas-object material" data-kind="material"><img src="/a"></div><div data-scene-group="G" class="scene-v2-group"><div data-object="B" data-render-key="B" class="canvas-object material" data-kind="material"><img src="/b"></div></div>';
 const result=reconcileEditorScene(root,markup);
 assert.equal(root.querySelector('[data-object="A"]'),keep);
 assert.ok(root.querySelector('[data-scene-group="G"] [data-object="B"]'));
 assert.equal(result.created,1);assert.equal(result.removed,1);
});
