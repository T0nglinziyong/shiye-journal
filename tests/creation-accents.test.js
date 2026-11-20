import test from 'node:test';
import assert from 'node:assert/strict';
import {compileTechnique} from '../src/creation-library/techniques.js';
import {exampleMaterials} from '../src/creation-library/examples.js';
import {draft} from '../src/domain.js';
import {createCreationDocument} from '../src/creation-document.js';
import {applyCreationTransaction,creationSceneRevision} from '../src/creation-transaction.js';
const compile=p=>compileTechnique({methodId:'accent-rings',parameters:{id:'marks',widthMm:100,heightMm:100,motifSizeMm:10,clearanceMm:2,...p}});
test('accents omit protected, overlapping and out-of-bounds elements deterministically',()=>{
 const args={positions:[[.5,.5],[.51,.5],[.2,.2],[0,0],[.8,.8]],protectedBoxes:[[.15,.15,.1,.1]]};
 const result=compile(args);
 assert.deepEqual(result.report.skipped,[{index:1,reason:'occupied'},{index:2,reason:'protected'},{index:3,reason:'outside'}]);
 assert.equal(result.operations[0].children.length,2);
 assert.deepEqual(compile(args),result);
 assert.throws(()=>compile({protectedBoxes:[[0,0,1,1]]}),/没有可用空间/);
});
test('real accents preserve size and source through Scene, omit oversized material instead of shrinking',async()=>{
 const assets=exampleMaterials.slice(0,2),source=structuredClone(assets);
 const result=compileTechnique({methodId:'accent-materials',parameters:{id:'real',aliases:['m1','m2'],widthMm:90,heightMm:60,positions:[[.25,.5],[.75,.5]]},materials:assets});
 assert.ok(result.operations[0].children.every(c=>c.op==='material.add'&&!c.size));
 const doc=await createCreationDocument({draft:draft({ratio:'a5'}),assets,aliases:Object.fromEntries(assets.map(a=>[a.alias,a.id]))});
 const done=applyCreationTransaction(doc,{protocolVersion:2,transactionId:'accents-test',baseSceneRevision:creationSceneRevision(doc),operations:result.operations},assets).document;
 assert.deepEqual(done.source,doc.source);assert.deepEqual(assets,source);
 const mm=done.page.physicalPageHeightMM/done.page.canvas.height;
 const layers=done.page.layers.find(n=>n.id==='real').children;
 layers.forEach((n,i)=>{assert.ok(Math.abs(n.width*mm-assets[i].physicalWidthMM)<1e-6);assert.ok(Math.abs(n.height*mm-assets[i].physicalHeightMM)<1e-6);});
 assert.throws(()=>compileTechnique({methodId:'accent-materials',parameters:{id:'large',aliases:['m1'],widthMm:10,heightMm:10},materials:assets}),/不会自动缩小/);
});
test('invalid accent inputs cannot silently generate decorative noise or consume unapproved assets',()=>{
 for(const p of [{count:25},{count:1.2},{motifSizeMm:0},{positions:[[NaN,0]]},{positions:[]},{protectedBoxes:[[0,0,2,1]]},{clearanceMm:-1},{motif:'bow'},{arrangement:'random'},{aliases:['m1']}])assert.throws(()=>compile(p));
 for(const aliases of [['m1','m1'],['not-authorized']])assert.throws(()=>compileTechnique({methodId:'accent-materials',parameters:{id:'bad',aliases},materials:exampleMaterials}));
});

test('default edge placement accounts for actual motif extents instead of losing edge leaves',()=>{
 const r=compileTechnique({methodId:'accent-sprig',parameters:{id:'leaves'}});
 assert.equal(r.operations[0].children.length,2);assert.deepEqual(r.report.skipped,[]);
});
