import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {reconcileCanvasText} from '../src/canvas-text-content.js';
import {ensureEditorHistory,resetEditorHistory,takeEditorHistoryStep} from '../src/editor-history-scope.js';

test('R-01/R-04: paragraph content has one owner after 20 local refreshes',()=>{
  const document=new Window().document;
  const value='Coffee <3\n\nA < B 与「春天」🌿';
  const node=document.createElement('div');
  node.className='canvas-object text';
  node.innerHTML='<div data-text-content><span style="display:block">Coffee &lt;3</span><span style="display:block;margin-top:5px">&#8203;</span><span style="display:block;margin-top:5px">A &lt; B 与「春天」🌿</span></div>';
  const original=node.querySelector('[data-text-content]');
  for(let index=0;index<20;index++){
    const next=node.cloneNode(true);
    assert.equal(reconcileCanvasText(node,next),false);
    assert.strictEqual(node.querySelector('[data-text-content]'),original);
    assert.equal(node.querySelectorAll('[data-text-content]').length,1);
  }
  assert.equal(node.querySelectorAll('span').length,3);
  assert.equal(node.querySelector('script'),null);
  assert.equal(node.textContent.replaceAll('\u200b',''),value.replaceAll('\n',''));
  const changed=node.cloneNode(true);
  changed.querySelector('span').textContent='新标题';
  assert.equal(reconcileCanvasText(node,changed),true);
  assert.equal(node.querySelectorAll('[data-text-content]').length,1);
});

test('R-03: IME textarea remains the same node during a canvas refresh',()=>{
  const document=new Window().document;
  const node=document.createElement('div');
  node.className='canvas-object text typing';
  const input=document.createElement('textarea');
  input.className='canvas-inline-text';
  input.value='输入中的中文';
  node.append(input);
  const next=document.createElement('div');
  next.innerHTML='<div data-text-content>新文本</div>';
  assert.equal(reconcileCanvasText(node,next),false);
  assert.strictEqual(node.firstChild,input);
  assert.equal(input.value,'输入中的中文');
});

test('E-01: undo snapshots cannot cross project or draft identity',()=>{
  const first={id:'draft-A',textBlocks:[{content:'A'}]};
  const second={id:'draft-B',textBlocks:[{content:'B'}]};
  const state={activeProject:{id:'project-A'},activeDraft:'draft-A',undo:[],redo:[]};
  resetEditorHistory(state);
  state.undo.push(structuredClone(first));
  state.activeProject={id:'project-B'};
  state.activeDraft='draft-B';
  assert.equal(takeEditorHistoryStep(state,'undo','redo',second),null);
  assert.deepEqual(state.undo,[]);
  assert.equal(state.editorHistoryScope,'project-B:draft-B');
  state.undo.push(structuredClone(first));
  assert.equal(takeEditorHistoryStep(state,'undo','redo',second),null);
  assert.deepEqual(state.undo,[]);
  state.undo.push(structuredClone(second));
  const restored=takeEditorHistoryStep(state,'undo','redo',second);
  assert.equal(restored.id,'draft-B');
  assert.equal(state.redo[0].id,'draft-B');
  state.activeDraft='draft-C';
  ensureEditorHistory(state);
  assert.deepEqual(state.redo,[]);
});
