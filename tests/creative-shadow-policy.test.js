import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCanvasOperations,canvasGuide} from '../creative-agent/runtime/canvas-interface.mjs';
import {assertNoShadowInput,assertNoNewSceneShadows} from '../creative-agent/runtime/shadow-policy.mjs';
import {publicRecipeDescription} from '../creative-agent/runtime/recipe-contract.mjs';
import {describeTechnique} from '../creative-agent/library/techniques.js';
test('model contracts exclude shadows while retaining outlines and texture',()=>{
 const guide=canvasGuide();assert.ok(!JSON.stringify(guide).includes('"shadow"'));
 const paper={op:'create',kind:'paper',id:'p',size:{width:60,height:80,unit:'mm'},style:{fill:'#EEDDCC'}};
 assert.doesNotThrow(()=>validateCanvasOperations([paper]));
 assert.throws(()=>validateCanvasOperations([{...paper,style:{...paper.style,shadow:{color:'#000000',offsetMm:[1,1],blurMm:2}}}]),/关闭阴影/);
 assert.throws(()=>validateCanvasOperations([{op:'update',target:'t',effect:'shadow'}]),/关闭阴影/);
 assert.throws(()=>validateCanvasOperations([{op:'group',id:'g',children:[{op:'create',kind:'text',id:'t',content:'12',size:{width:40,unit:'mm'},runs:[{content:'12',style:{shadow:{color:'#000000'}}}]}]}]),/关闭阴影/);
});
test('recipe parameters and nested companions cannot request shadow variants',()=>{
 assert.throws(()=>assertNoShadowInput({with:[{methodId:'title-art',parameters:{variant:'gap-shadow'}}]}),/关闭阴影/);
 assert.doesNotThrow(()=>assertNoShadowInput({content:'shadow',style:{outline:{color:'#112233',widthMm:.3}}}));
 const method=publicRecipeDescription(describeTechnique('title-art'));
 assert.ok(!JSON.stringify(method).includes('"shadow":'));
 assert.ok(!method.variants.some(v=>v.key.includes('shadow')));
});
test('compiled recipes and copied groups cannot introduce shadows; existing work remains intact',()=>{
 const shadow={color:'#000000',blur:2,offsetX:1,offsetY:1};
 const before={page:{layers:[{id:'old',shadow}]}};
 assert.doesNotThrow(()=>assertNoNewSceneShadows(before,structuredClone(before)));
 assert.throws(()=>assertNoNewSceneShadows(before,{page:{layers:[...before.page.layers,{id:'g',children:[{id:'copy',shadow}]}]}}),/关闭阴影/);
 assert.throws(()=>assertNoNewSceneShadows(before,{page:{layers:[{id:'old',shadow:{...shadow,blur:10}}]}}),/关闭阴影/);
 assert.deepEqual(before.page.layers[0].shadow,shadow);
});
