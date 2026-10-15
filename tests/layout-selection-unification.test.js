import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const src=async file=>readFile(new URL('../src/'+file,import.meta.url),'utf8');
test('import recognition internals unchanged while manual UI is a separate adapter',async()=>{
  const [app,manual,cv]=await Promise.all(['app.js','react-manual-box-editor.jsx','opencv-worker.js'].map(src));
  assert.match(app,/await detectPaperCandidates\(source,b,6/);
  assert.match(manual,/transformSelectedFrame/);
  assert.match(manual,/isObjectDeleteKey/);
  assert.match(cv,/if\(operation==='process-material-boxes'\)/);
  assert.doesNotMatch(cv,/detectWhitePaperQuad/);
});
test('three matching GoodNotes grips, no independent upper rotation grip',async()=>{
 const [manual,editor,css]=await Promise.all(['react-manual-box-editor.jsx','canvas-editor-ui.js','layout-refinements.css'].map(src));
 for(const mode of ['top','right','corner']){
  assert.match(manual,new RegExp('data-mode="'+mode+'"'));
  assert.ok(editor.includes("'"+mode+"'"),'Missing grip '+mode);
 }
 assert.doesNotMatch(manual,/class="box-rotate"/);
 assert.doesNotMatch(editor,/for\(const corner of \['nw','ne','sw','se','rotate'\]/);
 assert.match(css,/\.import-region\.active/);
 assert.match(css,/\.object-handle\.corner/);
});
test('Delete and Backspace guarded by editor mode and active focused inputs',async()=>{
 const [manual,editor]=await Promise.all(['react-manual-box-editor.jsx','canvas-editor-ui.js'].map(src));
 assert.match(manual,/document\.addEventListener\('keydown',keydown\)/);
 assert.match(manual,/document\.removeEventListener\('keydown',keydown\)/);
 assert.match(editor,/document\.addEventListener\('keydown',deleteSelected\)/);
 assert.match(editor,/document\.removeEventListener\('keydown',deleteSelected\)/);
 assert.match(editor,/handle\('delete-object'\)/);
});
test('layout CSS is loaded last; status remains visible and selectors are responsive',async()=>{
 const [app,css]=await Promise.all(['app.js','layout-refinements.css'].map(src));
 assert.match(app,/import '\.\/layout-refinements\.css'/);
 assert.match(css,/\.import-nav\{/);
 assert.match(css,/max-width:none!important/);
 assert.match(css,/min-width:700px/);
 assert.match(css,/orientation:portrait/);
 assert.match(css,/p:not\(\.import-processing\)/);
 assert.match(css,/\.settings-detail label:not\(\.toggle-row\)/);
});
