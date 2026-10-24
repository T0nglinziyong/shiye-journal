import test from 'node:test';
import assert from 'node:assert/strict';
import {materialMaskGeometry,materialMaskArea,materialMaskCSS,clipMaterial,cutMaterialDiagonal,addMaterialWindow} from '../src/material-mask.js';
import {draft,project} from '../src/domain.js';
import {applyToolCalls} from '../src/creative.js';
import {createNativeProjectPackage,importNativeProjectPackage} from '../src/native-project-package.js';

const diagonal={op:'diagonal',from:[0,.3],to:[.3,0],keep:'left'};
const windowCut={op:'window',shape:'rectangle',box:[.3,.3,.35,.25]};
const item={width:200,height:300};

test('diagonal cut and real transparent window share CSS and even-odd canvas geometry',()=>{
  const slanted=cutMaterialDiagonal(null,diagonal.from,diagonal.to,diagonal.keep);
  const mask=addMaterialWindow(slanted,{shape:windowCut.shape,box:windowCut.box});
  const geometry=materialMaskGeometry(mask),css=materialMaskCSS({...item,materialMask:mask});
  assert.equal(mask.shape,'compound');assert.equal(geometry.holes.length,1);
  assert.ok(geometry.outer.every(([x,y])=>x+y>=.3-1e-7));
  assert.ok(Math.abs(materialMaskArea(mask)-(1-.3*.3/2-.35*.25))<1e-5);
  assert.match(css,/mask-image:url\('data:image\/svg\+xml,/);
  assert.match(css,/fill-rule%3D%22evenodd%22/);
  assert.ok(!css.includes('"'),'inline HTML style cannot contain unescaped double quotes');
  const calls=[],ctx={beginPath(){calls.push('begin');},moveTo(...v){calls.push(['move',...v]);},lineTo(...v){calls.push(['line',...v]);},closePath(){calls.push('close');},clip(rule){calls.push(['clip',rule]);}};
  clipMaterial(ctx,{...item,materialMask:mask});assert.deepEqual(calls.at(-1),['clip','evenodd']);
  assert.equal(calls.filter(x=>x==='close').length,2);
  assert.ok(calls.some(x=>Array.isArray(x)&&x[0]==='move'&&x[1]<0&&x[2]<0));
});

test('openings cannot escape or overlap the remaining physical cutout',()=>{
  const mask=cutMaterialDiagonal(null,[0,.4],[.4,0],'left');
  assert.throws(()=>addMaterialWindow(mask,{shape:'rectangle',box:[.05,.05,.2,.2]}),/可见区域/);
  assert.throws(()=>addMaterialWindow(null,{shape:'rectangle',box:[0,.2,.2,.2]}),/材料内部/);
  assert.throws(()=>addMaterialWindow(null,{shape:'ellipse',box:[.2,.2,1,.2]}),/材料内部/);
  const one=addMaterialWindow(null,{shape:'rectangle',box:[.2,.2,.2,.2]});
  assert.throws(()=>addMaterialWindow(one,{shape:'ellipse',box:[.3,.3,.2,.2]}),/不能重叠/);
  assert.throws(()=>cutMaterialDiagonal(null,[.1,.1],[.1,.1],'left'),/裁切线无效/);
  assert.throws(()=>cutMaterialDiagonal(one,[0,.5],[.5,0],'right'),/开窗必须留在/);
});

test('AI direct editable page, tool edits and project ZIP preserve slanted windows',async()=>{
  const asset={id:'paper',title:'纸片',kind:'paper',physicalWidthMM:80,physicalHeightMM:100,supply:{quantity:1}};
  const p=project('开窗斜裁');
  const page={version:2,style:'自由构图',intent:'透明镂空',paper:{color:'#faf8ef',pattern:'plain'},layers:[{type:'material',id:'cut-paper',asset:'paper',piece:'cut-paper',unit:0,operations:[{op:'crop',box:{unit:'ratio',mode:'keep',values:[.1,.1,.8,.8]}},diagonal,windowCut],placement:{x:.5,y:.5,rotation:0,z:1}}]};
  let result=applyToolCalls(page,p.drafts[0],[asset],{},{processing:'自由拆解'});assert.equal(result.results[0].ok,true,JSON.stringify(result.results));
  const piece=result.draft.items[0];assert.equal(piece.cropRect.width,.8);assert.equal(piece.materialMask.shape,'compound');assert.equal(piece.materialMask.holes.length,1);
  assert.equal(piece.width,80*.8*result.draft.canvas.height/result.draft.physicalPageHeightMM);
  const edited=applyToolCalls([{name:'edit_materials',arguments:{items:[{piece:'cut-paper',mode:'replace',operations:[{op:'whole'},diagonal,{op:'window',shape:'ellipse',box:[.3,.3,.3,.3]}]}]}}],result.draft,[asset],{},{processing:'自由拆解'});
  assert.equal(edited.results[0].ok,true,JSON.stringify(edited.results));assert.equal(edited.draft.items[0].materialMask.holes[0].shape,'ellipse');
  p.drafts[0]=result.draft;const restored=importNativeProjectPackage(new Uint8Array(await createNativeProjectPackage(p).arrayBuffer()),[asset]);
  assert.deepEqual(restored.drafts[0].items[0].materialMask,piece.materialMask);
  const invalid=structuredClone(page);invalid.layers[0].operations[2].box=[.8,.8,.3,.3];
  const rejected=applyToolCalls(invalid,draft(),[asset]);assert.equal(rejected.results[0].ok,false);assert.equal(rejected.draft.items.length,0);
});
