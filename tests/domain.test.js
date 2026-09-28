import test from 'node:test';import assert from 'node:assert/strict';
import {canvasSize,draft,physicalPlacement,validatePhysicalDraft,recommend} from '../src/domain.js';
const a={id:'a',title:'主角',kind:'sticker',role:'focal',reviewStatus:'ready',tags:['暖色'],palette:['#dd5533'],physicalWidthMM:28,physicalHeightMM:35,supply:{quantity:1}};
const b={id:'b',title:'背景',kind:'paper',role:'background',reviewStatus:'ready',tags:['暖色'],palette:['#dd5533'],physicalWidthMM:48,physicalHeightMM:55,supply:{quantity:1}};
test('A4 dimensions match physical ratio',()=>{const s=canvasSize('single','a4');assert.ok(Math.abs(s.width/s.height-210/297)<1e-9);});
test('physical draft never duplicates a quantity-one item',()=>{const d=draft();d.items=physicalPlacement(d,[a,b],['a','a','b']);assert.equal(d.items.filter(x=>x.assetID==='a').length,1);assert.deepEqual(validatePhysicalDraft(d,[a,b]),[]);assert.ok(Math.abs(d.items[0].width-28/297*1000)<1e-6);});
test('oversized source is not silently resized to fit',()=>{const d=draft(),huge={...a,id:'huge',physicalWidthMM:500};assert.equal(physicalPlacement(d,[huge],['huge']).length,0);});
test('recommendations preserve role and color evidence',()=>{const r=recommend(a,[a,b]);assert.equal(r[0].asset.id,'b');assert.ok(r[0].reasons.some(x=>x.includes('配色')));});
