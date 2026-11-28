import test from 'node:test';
import assert from 'node:assert/strict';
import {visibleCropRegion,visibleSourceBoundsMm} from '../creative-agent/library/template-crop-region.js';
import {compileMeasuredD146} from '../creative-agent/library/measured-d146.js';
import {scoreSixSpreadSlot,matchSixSpreadMaterials,compileSixSpreadTemplate} from '../creative-agent/library/six-spread-templates.js';
import {scoreThreeLayoutSlot,matchThreeLayoutSpread,compileThreeLayoutSpread} from '../creative-agent/library/three-layout-template-matcher.js';
import {materialImageAttributes} from '../src/material-image-attributes.js';
import {loadOfflineCanvas} from '../src/offline-node-preview.mjs';

test('image analysis records the visible bounds of a paper with transparent margins',async()=>{
 const canvas=await loadOfflineCanvas(),image=canvas.createCanvas(100,60),context=image.getContext('2d');
 context.fillStyle='#EFDDAA';context.fillRect(10,5,80,50);
 const blob=new Blob([image.toBuffer('image/png')],{type:'image/png'});
 const attributes=await materialImageAttributes(blob,{decode:async source=>canvas.loadImage(Buffer.from(await source.arrayBuffer())),
  createCanvas:()=>canvas.createCanvas(1,1)});
 assert.deepEqual(attributes.visualBoundsRatio,[.1,5/60,.9,55/60]);
});

test('rectangular paper crops within visible bounds instead of transparent padding',()=>{
 const asset={physicalWidthMM:100,physicalHeightMM:70,visualBoundsRatio:[.08,.1,.93,.9]};
 assert.deepEqual(visibleSourceBoundsMm(asset),[8,7,93,63]);
 const region=visibleCropRegion(asset,50,30);
 assert.deepEqual(region.box,[25.5,20,50,30]);
 assert.ok(region.box[0]>=8&&region.box[0]+region.box[2]<=93);
});

test('invalid visual bounds fall back to physical source size',()=>{
 const asset={physicalWidthMM:60,physicalHeightMM:40,visualBoundsRatio:[.7,.7,.2,.2]};
 assert.deepEqual(visibleCropRegion(asset,30,20).box,[15,10,30,20]);
});

test('measured template cuts oversized plain paper inside its visible area and keeps the remainder',()=>{
 const asset={id:'paper',alias:'paper',kind:'paper',title:'素色纸',physicalWidthMM:100,physicalHeightMM:80,
  visualBoundsRatio:[.08,.1,.92,.9]};
 const draft=compileMeasuredD146({assets:[asset],slotValues:{'dark-top':{asset:'paper',fit:'crop'}}});
 const cut=draft.operations.find(op=>op.op==='material.split'&&op.asset==='paper');
 assert.ok(cut);
 assert.equal(cut.keepRemainder,true);
 const [x,y,w,h]=cut.pieces[0].region.box;
 assert.ok(x>=8&&y>=8&&x+w<=92&&y+h<=72);
 assert.ok(w>0&&h>0);
});

test('six-case and three-layout spreads can crop regular paper but keep the remainder',()=>{
 const base={id:'paper',alias:'paper',title:'绿色素色纸',kind:'paper',preservation:'repeatable',
  visualRoles:['plain-paper'],mainColor:'#9DB64A',writableAreaRatio:.8,visualBoundsRatio:[.03,.04,.97,.96]};
 const sixAsset={...base,physicalWidthMM:50,physicalHeightMM:55};
 assert.equal(scoreSixSpreadSlot('S01-苹果绿白','R-lime-back',sixAsset)?.method,'crop');
 const sixPlan=matchSixSpreadMaterials('S01-苹果绿白',[sixAsset],{overrides:{'R-lime-back':'paper'}});
 const six=compileSixSpreadTemplate({templateId:'S01-苹果绿白',assets:[sixAsset],plan:sixPlan});
 assert.ok(six.operations.some(op=>op.op==='material.split'&&op.pieces.some(piece=>piece.id==='R-lime-back')&&op.keepRemainder));

 const threeAsset={...base,physicalWidthMM:70,physicalHeightMM:80};
 assert.equal(scoreThreeLayoutSlot('XHS-满满当当','L-upper-note',threeAsset)?.method,'crop');
 const threeChoice=scoreThreeLayoutSlot('XHS-满满当当','L-upper-note',threeAsset);
 const threePlan={...matchThreeLayoutSpread('XHS-满满当当',[]),
  assignments:[{...threeChoice,slot:'L-upper-note'}],used:['paper'],splitGroups:[]};
 const three=compileThreeLayoutSpread({templateId:'XHS-满满当当',assets:[threeAsset],plan:threePlan});
 assert.ok(three.operations.some(op=>op.op==='material.split'&&op.pieces.some(piece=>piece.id==='L-upper-note')&&op.keepRemainder));
});
