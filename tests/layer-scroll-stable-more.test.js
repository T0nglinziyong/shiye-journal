import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=name=>readFile(new URL('../src/'+name,import.meta.url),'utf8');

test('the layer picker has its own touch-scroll container below a fixed header',async()=>{
 const [css,editor]=await Promise.all([read('swift-controls.css'),read('canvas-editor-ui.js')]);
 assert.match(editor,/p\.surface\.classList\.add\('swift-layer-popover'\)/);
 assert.match(css,/\.swift-layer-popover \.canvas-layer-list\s*\{[\s\S]*?overflow-y:auto;/);
 assert.match(css,/\.swift-layer-popover \.canvas-layer-list\s*\{[\s\S]*?touch-action:pan-y;/);
 assert.match(css,/\.swift-layer-popover \.canvas-layer-row,\s*\.swift-layer-popover \.canvas-layer-row \[data-layer-pick\]/);
 assert.match(css,/\.swift-layer-popover \.canvas-layer-row \[data-layer-move\]\s*\{\s*touch-action:none;/);
});

test('ordinary finger movement stays native scroll, while the grip enables reordering',async()=>{
 const editor=await read('canvas-editor-ui.js');
 assert.match(editor,/const grip=!!event\.target\.closest\('\[data-layer-move\]'\);/);
 assert.match(editor,/if\(event\.pointerType!=='mouse'&&!grip\)return;/);
 assert.match(editor,/if\(pending\.grip\)beginDrag\(\);/);
 assert.match(editor,/row\.onpointercancel=\(\)=>\{pending=null;stopDrag\(\);\};/);
});

test('no dynamic More shape-change styles remain while a child opens',async()=>{
 const css=await read('selection-menu.css');
 const panels=await read('selection-side-panels.js');
 assert.doesNotMatch(css,/\.selection-more-menu\.selection-side-open \.popover-content\s*\{/);
 assert.doesNotMatch(css,/\.selection-more-menu\.selection-side-open \.popover-content > button/);
 assert.doesNotMatch(panels,/menu\.surface\.style\.(?:width|left|top)\s*=/);
 assert.match(panels,/reserveSelectionMenuSpace/);
});
