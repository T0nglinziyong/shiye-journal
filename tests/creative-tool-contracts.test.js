import test from 'node:test';
import assert from 'node:assert/strict';
import {harnessTools} from '../creative-agent/runtime/tools.mjs';
import {validateValue} from '../src/creative-contract.js';
import {compileTitleOperations} from '../creative-agent/runtime/title-tool.mjs';
import {describeTechnique,techniqueCatalog,compileTechnique} from '../creative-agent/library/techniques.js';
import {publicRecipeDescription,internalRecipeParameters} from '../creative-agent/runtime/recipe-contract.mjs';
const contract=name=>harnessTools.find(tool=>tool.function.name===name).function.parameters;

test('editing tools share current revision and title uses the same text style at each level',()=>{
 for(const name of ['creation_apply','creation_paper','creation_title','creation_recipe','creation_apply_crops'])assert.match('current',new RegExp(contract(name).properties.baseSceneRevision.pattern));
 const title={id:'title',content:'春日笔记',place:{reference:'page',at:[45,35],unit:'mm'},size:{width:100,unit:'mm'},style:{fontFamily:'Xiaolai',fontSizePt:16,color:'#445566'},order:{edge:'front'},layout:'stagger',effect:'none',runs:[{content:'春日',style:{fontSizePt:26}},{content:'笔记',style:{fontSizePt:11}}]};
 validateValue({transactionId:'title',baseSceneRevision:'current',titles:[title]},contract('creation_title'));
 const letters=compileTitleOperations({titles:[title]})[0].children.filter(op=>op.op==='text.add');
 assert.deepEqual(letters.map(op=>op.style.fontSizePt),[26,11]);
 assert.deepEqual(letters.map(op=>op.content),['春日','笔记']);
 assert.throws(()=>validateValue({transactionId:'wrong',baseSceneRevision:'current',titles:[{...title,widthMm:100}]},contract('creation_title')));
});

test('every method description uses canonical fields and its example still compiles',()=>{
 for(const method of techniqueCatalog.methods){
  for(const variant of [undefined,...(method.variants||[]).map(v=>v.key)]){
   const raw=describeTechnique(method.id,{variant}),detail=publicRecipeDescription(raw);
   for(const key of ['at','reference','rotationDeg','widthMm','heightMm','text','fontSizePt','fontFamily','fill','strokeWidthMm','opacity']){assert.ok(!(key in detail.parameters),method.id+': '+key);assert.ok(!(key in (detail.defaults||{})),method.id+' default: '+key);}
   const normalized=internalRecipeParameters(detail.tool.arguments.parameters,{title:method.recipe==='title'});
   // Both compile against the same example assets; existing-node operations
   // are compiled here and transaction/source validation stays in the harness.
   const original=compileTechnique({methodId:method.id,parameters:raw.tool.arguments.parameters,materials:raw.example.materials});
   const result=compileTechnique({methodId:method.id,parameters:normalized.parameters,materials:raw.example.materials});
   assert.equal(result.operations.length,original.operations.length,method.id);
  }
 }
 assert.throws(()=>internalRecipeParameters({id:'x',widthMm:30}),/统一使用/);
});
