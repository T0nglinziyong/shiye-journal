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
   assert.equal(detail.tool.name,'creation_apply');
   const normalized=internalRecipeParameters(detail.tool.arguments.operations[0].params,{title:method.recipe==='title'});
   // Both compile against the same example assets; existing-node operations
   // are compiled here and transaction/source validation stays in the harness.
   const original=compileTechnique({methodId:method.id,parameters:raw.tool.arguments.parameters,materials:raw.example.materials});
   const result=compileTechnique({methodId:method.id,parameters:normalized.parameters,materials:raw.example.materials});
   assert.equal(result.operations.length,original.operations.length,method.id);
   if(method.recipe==='title')assert.deepEqual(result.operations[0].children,original.operations[0].children,method.id+':'+variant);
  }
 }
 assert.throws(()=>internalRecipeParameters({id:'x',widthMm:30}),/统一使用/);
 const stroke=internalRecipeParameters({id:'ring',style:{stroke:'#A45C63'},size:{width:18,height:18,unit:'mm'}},{title:false});
 assert.equal(stroke.parameters.colors[0],'#A45C63');
 assert.equal(stroke.parameters.widthMm,18);
 assert.throws(()=>internalRecipeParameters({id:'ring',style:{stroke:'red'}},{title:false}),/六位 HEX/);
 const implicitUnits=internalRecipeParameters({id:'ring',place:{at:[40,60],offset:{value:[2,3]}},size:{width:18,height:18}},{title:false});
 assert.deepEqual(implicitUnits.placement,{reference:'page',at:[40,60],unit:'mm',offset:{value:[2,3],unit:'mm'}});
 assert.equal(implicitUnits.parameters.widthMm,18);
 assert.equal(implicitUnits.parameters.heightMm,18);
 const requiredPlacement=techniqueCatalog.methods.find(method=>method.recipe==='paper');
 assert.equal(publicRecipeDescription(describeTechnique(requiredPlacement.id)).parameters.place.required,true);
});


test('initial crop tool accepts valid tuples and rejects invalid dimensions before execution',()=>{
 const validate=region=>validateValue({transactionId:'cut',baseSceneRevision:'current',operations:[{op:'material.cut',target:'paper',mode:'keep',region}]},contract('creation_apply'));
 for(const shape of ['rect','ellipse']){
  const region={shape,space:'local',unit:'ratio',box:[0,.1,.8,.9]};
  assert.doesNotThrow(()=>validate(region));
  for(const box of [[0,0,0,1],[0,0,1,-1],[0,0,1],[0,0,1,1,1],[0,0,'1',1]])assert.throws(()=>validate({...region,box}));
 }
 assert.doesNotThrow(()=>validate({shape:'edge',edge:'left',space:'local',amount:5,unit:'mm'}));
 assert.doesNotThrow(()=>validate({shape:'polygon',space:'local',unit:'ratio',points:[[0,0],[1,0],[1,1]]}));
});


test('paper and title omission of order follows ordinary creation paint order',async()=>{
 const {draft}=await import('../src/domain.js');
 const {createCreationDocument}=await import('../src/creation-document.js');
 const {applyCreationTransaction,creationSceneRevision}=await import('../src/creation-transaction.js');
 const {compilePaperOperations}=await import('../creative-agent/runtime/paper-tool.mjs');
 const base=await createCreationDocument({draft:draft(),assets:[]});
 const paper={id:'paper',place:{reference:'page',at:[30,30],unit:'mm'},size:{width:50,height:50,unit:'mm'},style:{fill:'#ffffff'},texture:'medium',edge:'torn'};
 const title={id:'heading',content:'测试',place:paper.place,size:{width:60,unit:'mm'},style:{fontSizePt:18,color:'#112233'}};
 validateValue({transactionId:'p',baseSceneRevision:'current',papers:[paper]},contract('creation_paper'));
 validateValue({transactionId:'t',baseSceneRevision:'current',titles:[title]},contract('creation_title'));
 const apply=operations=>applyCreationTransaction(base,{protocolVersion:2,transactionId:'order',baseSceneRevision:creationSceneRevision(base),operations},[]).document.page.layers.sort((a,b)=>a.zIndex-b.zIndex).map(n=>n.id);
 assert.deepEqual(apply([...compilePaperOperations({papers:[paper]}),...compileTitleOperations({titles:[title]})]),['paper','heading']);
 assert.deepEqual(apply([...compileTitleOperations({titles:[title]}),...compilePaperOperations({papers:[paper]})]),['heading','paper']);
 assert.deepEqual(apply([...compileTitleOperations({titles:[title]}),...compilePaperOperations({papers:[{...paper,order:{before:'heading'}}]})]),['paper','heading']);
});
