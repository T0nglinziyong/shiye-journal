import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=file=>readFile(new URL('../src/'+file,import.meta.url),'utf8');
test('import and creative return buttons each have one chevron',async()=>{
 const [react,editor,css]=await Promise.all(['react-routes.jsx','canvas-editor-ui.js','layout-refinements.css'].map(source));
 const steps=react.slice(react.indexOf('function ImportNavigation('),react.indexOf('export function ImportInspectionPage('));
 assert.equal((steps.match(/data-act="import-back"/g)||[]).length,1);
 assert.equal((steps.match(/class="shiye-back-glyph"/g)||[]).length,0);
 assert.match(editor,/head\.prepend\(back\)/);
 assert.doesNotMatch(editor,/shiye-back-glyph/);
 assert.match(css,/\.import-back::before\{\s*content:none!important/);
 assert.match(css,/\.import-nav>\.import-back>\.shiye-icon/);
 assert.doesNotMatch(css,/\.editor-back-chevron/);
});
