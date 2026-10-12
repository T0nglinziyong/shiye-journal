import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=name=>readFile(new URL('../src/'+name,import.meta.url),'utf8');

test('persistent recursive layer tree is independently scrollable and has a touch-only drag grip',async()=>{
 const [css,tree,editor]=await Promise.all([read('canvas-editor-fixes.css'),read('editor-layer-tree.js'),read('canvas-editor-ui.js')]);
 assert.match(editor,/openEditorLayerTree\(anchor/);
 assert.match(tree,/p\.surface\.classList\.add\('swift-layer-popover','scene-layer-tree-popover'\)/);
 assert.match(tree,/setAttribute\('role','tree'\)/);
 assert.match(tree,/setAttribute\('role','treeitem'\)/);
 assert.match(tree,/children\.setAttribute\('role','group'\)/);
 assert.match(css,/\.scene-layer-tree-popover \.scene-layer-tree\s*\{/);
 assert.match(css,/touch-action:pan-y/);
 assert.match(css,/\.scene-layer-tree-popover \.scene-layer-node>button\.scene-layer-grip\s*\{[\s\S]*?touch-action:none/);
});
test('layer click selects immediately; movement keeps the popover open and group style/rotation controls are gone',async()=>{
 const [tree,editor]=await Promise.all([read('editor-layer-tree.js'),read('canvas-editor-ui.js')]);
 assert.match(tree,/state\.selected=node\.id/);
 assert.match(tree,/view\.editorRefresh\?\.\(\)/);
 assert.match(tree,/saveProject\(\);[\s\S]*?render\(\);draw\(\)/);
 assert.doesNotMatch(tree,/组合旋转|组合外观/);
 assert.doesNotMatch(editor,/组合旋转|组合外观/);
});
test('no dynamic More shape-change styles remain while a child opens',async()=>{
 const css=await read('selection-menu.css');
 const panels=await read('selection-side-panels.js');
 assert.doesNotMatch(css,/\.selection-more-menu\.selection-side-open \.popover-content\s*\{/);
 assert.doesNotMatch(css,/\.selection-more-menu\.selection-side-open \.popover-content > button/);
 assert.doesNotMatch(panels,/menu\.surface\.style\.(?:width|left|top)\s*=/);
 assert.match(panels,/reserveSelectionMenuSpace/);
});
