import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=file=>readFile(new URL('../src/'+file,import.meta.url),'utf8');
test('import and creative return buttons each have one chevron',async()=>{
 const [app,editor,css]=await Promise.all(['app.js','canvas-editor-ui.js','layout-refinements.css'].map(source));
 const steps=app.slice(app.indexOf('function importSteps(){'),app.indexOf('function renderImport(){'));
 assert.equal((steps.match(/data-act="import-back"/g)||[]).length,1);
 assert.equal((steps.match(/class="shiye-back-glyph"/g)||[]).length,1);
 assert.match(editor,/head\.prepend\(back\)/);
 assert.match(editor,/class="shiye-back-glyph"/);
 assert.match(css,/\.import-back::before\{\s*content:none!important/);
 assert.doesNotMatch(css,/\.editor-back-chevron/);
});
