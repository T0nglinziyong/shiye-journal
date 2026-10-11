import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=file=>readFile(new URL('../src/'+file,import.meta.url),'utf8');

test('import navigation keeps back at start and progress/cancel centered in one wrapper',async()=>{
  const app=await source('app.js');
  const nav=app.slice(app.indexOf('function importSteps()'),app.indexOf('function renderImport()'));
  assert.match(nav,/<div class="import-nav"><button class="import-back"/);
  assert.match(nav,/<div class="import-nav-center"><strong>/);
  assert.match(nav,/class="import-progress"/);
  assert.match(nav,/class="import-cancel"/);
  assert.ok(nav.indexOf('class="import-back"')<nav.indexOf('class="import-nav-center"'));
  assert.ok(nav.indexOf('class="import-nav-center"')<nav.indexOf('class="import-progress"'));
});

test('whole-width import bar uses centered three-track layout; phone falls back gracefully',async()=>{
  const css=await source('layout-refinements.css');
  assert.match(css,/grid-template-columns:minmax\(38px,1fr\) max-content minmax\(38px,1fr\)!important/);
  assert.match(css,/\.import-nav-center\{/);
  assert.match(css,/grid-column:2/);
  assert.match(css,/@media\(max-width:699px\)/);
  assert.match(css,/grid-template-columns:36px minmax\(0,1fr\)!important/);
  assert.match(css,/\.import-nav-center>strong/);
  assert.match(css,/\.import-nav-center>\.import-progress/);
});

test('top and right visible grips are longer in BOTH import and creative editors',async()=>{
  const css=await source('layout-refinements.css');
  for(const marker of [
    '.multi-box-editor .box-grip.top::after',
    '.multi-box-editor .box-grip.right::after',
    '.canvas-page .selected-object-overlay .object-handle.top::after',
    '.canvas-page .selected-object-overlay .object-handle.right::after'
  ])assert.ok(css.includes(marker),marker);
  assert.match(css,/width:22px;height:6px/);
  assert.match(css,/width:6px;height:22px/);
  assert.match(css,/width:22px!important;height:6px!important/);
  assert.match(css,/width:6px!important;height:22px!important/);
  assert.match(css,/\.multi-box-editor \.box-delete::after/);
  assert.match(css,/width:14px;height:14px/);
});

test('editor back arrow uses centered geometry while keeping original navigation action',async()=>{
  const [editor,css]=await Promise.all(['canvas-editor-ui.js','layout-refinements.css'].map(source));
  assert.match(editor,/head\.prepend\(back\);back\.textContent='返回'/);
  assert.doesNotMatch(editor,/shiye-back-glyph/);
  assert.match(editor,/back\.setAttribute\('aria-label','返回作品'\)/);
  assert.match(css,/\.swift-editor-head>\[data-act="back-works"\]/);
  assert.match(css,/\[data-act="back-works"\]>\.shiye-icon\{/);
  assert.match(css,/\.import-nav>\.import-back::before/);
});
