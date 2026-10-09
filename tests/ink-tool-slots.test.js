import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureInkSlots,inkSlot,activeInkSlot,selectInkSlot,editInkSlot} from '../src/ink-tool-slots.js';

test('ink presets migrate from the existing pen, marker and eraser settings',()=>{
 const prefs={penWidth:7,markerWidth:5,eraserWidth:30,penColor:'#ABCDEF',markerColor:'#112233'};
 ensureInkSlots(prefs);
 assert.deepEqual(prefs.penWidthSlots,[2,7,9]);
 assert.deepEqual(prefs.highlighterWidthSlots,[2,5,9]);
 assert.deepEqual(prefs.eraserWidthSlots,[8,30,40]);
 assert.deepEqual(prefs.penColorSlots,['#2b5245','#abcdef','#ff3348']);
 assert.equal(activeInkSlot(prefs,'pen','width'),1);
 assert.equal(inkSlot(prefs,'highlighter','color',1),'#112233');
});
test('editing a selected slot changes its visible preset and actual brush setting',()=>{
 const prefs={penWidth:4,penColor:'#2b5245',markerWidth:4,markerColor:'#2b5245',eraserWidth:20};
 ensureInkSlots(prefs);
 editInkSlot(prefs,'pen','width',1,11.5);
 assert.equal(inkSlot(prefs,'pen','width',1),11.5);
 assert.equal(prefs.penWidth,11.5);
 selectInkSlot(prefs,'pen','width',0);
 assert.equal(prefs.penWidth,2);
 selectInkSlot(prefs,'pen','width',1);
 assert.equal(prefs.penWidth,11.5);
 editInkSlot(prefs,'highlighter','color',1,'#0AbCdE');
 assert.equal(prefs.markerColor,'#0abcde');
 assert.equal(inkSlot(prefs,'highlighter','color',1),'#0abcde');
 editInkSlot(prefs,'eraser','width',2,66);
 assert.equal(prefs.eraserWidth,66);
 assert.equal(prefs.eraserStyle,'fine');
 assert.equal(prefs.wholeStroke,false);
 assert.equal(inkSlot(prefs,'eraser','width',2),66);
});
test('editing a preset never changes the other two icons',()=>{
 const prefs={penWidth:4,penColor:'#2b5245',markerWidth:4,markerColor:'#2b5245',eraserWidth:20};
 ensureInkSlots(prefs);
 const before=prefs.penColorSlots.slice();
 editInkSlot(prefs,'pen','color',1,'#654321');
 assert.deepEqual([prefs.penColorSlots[0],prefs.penColorSlots[2]],[before[0],before[2]]);
 assert.throws(()=>editInkSlot(prefs,'pen','color',1,'garbage'),/无效/);
 assert.throws(()=>selectInkSlot(prefs,'pen','width',4),/编号/);
});
