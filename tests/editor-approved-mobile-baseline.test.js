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
test('approved mobile CSS plus gesture selection fix remains stable before desktop overrides',async()=>{
  const css=await read('src/swift-controls.css');
  const marker='/* Same approved 28509aa9 top action order at every device width.';
  const cut=css.indexOf(marker);
  assert.ok(cut>0,'Must keep desktop changes below the approved mobile style');
  const unchanged=css.slice(0,cut);
  // Only the separator newline precedes the isolated desktop enhancement.
  assert.equal(unchanged.length,48464);
  assert.equal(hash(unchanged.slice(0,-1)),'1f1c2df0');
  assert.match(unchanged,/\.canvas-page textarea,\.canvas-page input,\.canvas-page \[contenteditable="true"\]\{user-select:text/);
  assert.match(css.slice(cut),/@media\(min-width:900px\)/);
  assert.doesNotMatch(css.slice(cut),/@media\(max-width:699px\)/);
});
test('history, undo and redo remain in the original top header on ALL displays',async()=>{
  const editor=await read('src/canvas-editor-ui.js'),css=await read('src/swift-controls.css');
  const history=editor.indexOf("actions.append(history,topAction('undo','↶'),topAction('redo','↷'))");
  const done=editor.indexOf('actions.append(done)'),share=editor.indexOf('actions.append(share)');
  assert.ok(history>=0&&done>history&&share>done,'Top actions must keep the original order');
  assert.match(editor,/history\.setAttribute\('aria-label','历史记录'\)/);
  assert.doesNotMatch(editor,/mobile-editor-head-only|canvas-editor-utilities/);
  assert.doesNotMatch(css,/canvas-editor-utilities|mobile-editor-head-only/);
  assert.match(css,/@media\(min-width:900px\)/);
});
test('trash selection uses regular three-column buttons and only one wide danger action',async()=>{
  const css=await read('src/selection-menu.css');
  assert.match(css,/\.swift-tray\.manage\.library-management-tray > button \{[\s\S]*?width:90px/);
  assert.match(css,/\.swift-tray\.manage\.deleted-selection-tray > button\[data-trash-remove\][\s\S]*?width:132px/);
  assert.match(css,/\.deleted-selection-tray:not\(\[hidden\]\)\s*\{\s*display:grid;\s*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css,/button\[data-trash-remove\]\s*\{\s*grid-column:span 2/);
});
