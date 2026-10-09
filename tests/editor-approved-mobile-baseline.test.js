import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const hash=text=>{
  let value=0x811c9dc5;
  for(let i=0;i<text.length;i++){
    value^=text.charCodeAt(i);
    value=Math.imul(value,0x01000193);
  }
  return (value>>>0).toString(16);
};
test('all approved 28509aa9 mobile CSS is byte-for-byte intact',async()=>{
  const css=await read('src/swift-controls.css');
  const marker='/* 28509aa9 is the validated phone editor.';
  const cut=css.indexOf(marker);
  assert.ok(cut>0,'Must keep desktop changes below the approved mobile style');
  const unchanged=css.slice(0,cut);
  // Only the separator newline precedes the isolated desktop enhancement.
  assert.equal(unchanged.length,48123);
  assert.equal(hash(unchanged.slice(0,-1)),'ff5b907');
  assert.match(css.slice(cut),/@media\(min-width:900px\)/);
  assert.doesNotMatch(css.slice(cut),/@media\(max-width:699px\)/);
});
test('phone header retains history, undo and redo while desktop alone relocates them',async()=>{
  const editor=await read('src/canvas-editor-ui.js'),css=await read('src/swift-controls.css');
  const history=editor.indexOf('actions.append(mobileHistory,mobileUndo,mobileRedo)');
  const done=editor.indexOf('actions.append(done)'),share=editor.indexOf('actions.append(share)');
  assert.ok(history>=0&&done>history&&share>done);
  assert.match(editor,/mobileHistory\.setAttribute\('aria-label','历史记录'\)/);
  assert.match(css,/@media\(min-width:900px\)[\s\S]*\.editing \.swift-editor-head \.mobile-editor-head-only\{display:none!important\}/);
  assert.match(css,/@media\(min-width:900px\)[\s\S]*\.canvas-editor-utilities/);
  assert.match(css,/\.canvas-editor-utilities\{display:none\}/);
});
test('trash selection uses regular three-column buttons and only one wide danger action',async()=>{
  const css=await read('src/selection-menu.css');
  assert.match(css,/\.swift-tray\.manage\.library-management-tray > button \{[\s\S]*?width:90px/);
  assert.match(css,/\.swift-tray\.manage\.deleted-selection-tray > button\[data-trash-remove\][\s\S]*?width:132px/);
  assert.match(css,/\.deleted-selection-tray:not\(\[hidden\]\)\s*\{\s*display:grid;\s*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css,/button\[data-trash-remove\]\s*\{\s*grid-column:span 2/);
});
