import test from 'node:test';
import assert from 'node:assert/strict';
import {creationCompositionPriority,detectCompositionLinks,trackCompositionAnchors,compositionRotationAdvice} from '../src/creation-composition-feedback.js';

test('structural gaps are repaired before decorative marks',()=>{
 const advisory={estimatedGraphicPaintFraction:0,layers:{material:4},clusterAlignment:[{page:'page.left',verticalGapFraction:.14,leftEdgeOffsetFraction:.12}]};
 const balanced={pages:[{page:'page.left',share:.49,quadrants:[.4,.2,.25,.15]},{page:'page.right',share:.51,quadrants:[.56,.25,.16,.03]}]};
 assert.match(creationCompositionPriority(balanced,advisory),/右下/);
 assert.match(creationCompositionPriority({pages:[{page:'page.left',share:.5,quadrants:[.25,.25,.25,.25]},{page:'page.right',share:.5,quadrants:[.25,.25,.25,.25]}]},advisory),/正文与主素材相隔/);
 assert.match(creationCompositionPriority({pages:[{page:'page.left',share:.2},{page:'page.right',share:.8}]},advisory),/只有内容确实孤立时才重分两页承重/);
 assert.equal(creationCompositionPriority({pages:[{page:'page.left',share:.29},{page:'page.right',share:.71}]},{}),null);
});

test('the same empty corner and low graphic coverage are judged against selected density',()=>{
 const balance={pages:[{page:'page',share:1,quadrants:[.56,.25,.16,.03]}]};
 const advisory={estimatedGraphicPaintFraction:0,layers:{material:4}};
 assert.equal(creationCompositionPriority(balance,advisory,['美式拼贴','疏朗留白']),null);
 assert.match(creationCompositionPriority(balance,advisory,['美式拼贴','丰富层叠']),/画面疏密/);
 const full={pages:[{page:'page',share:1,quadrants:[.25,.25,.25,.25]}]};
 assert.equal(creationCompositionPriority(full,advisory,['均衡编排']),null);
 assert.match(creationCompositionPriority(full,advisory,['丰富层叠']),/材料自身纹样/);
});

test('one backing sheet and one foreground object can connect the same two materials',()=>{
  const layer=(id,type,x,y,w,h)=>({id,alias:id,type,surface:'page',world:{centerMm:[x,y],sizeMm:[w,h],rotationDeg:0}});
  const scene={layers:[layer('paper','shape',80,80,50,90),layer('upper','material',85,50,30,40),layer('lower','material',75,110,35,40),layer('stamp','material',80,80,15,25)]};
  const links=detectCompositionLinks(scene);
  assert.ok(links.links.some(link=>link.id==='paper'&&link.role==='underlay'));
  assert.ok(links.links.some(link=>link.id==='stamp'&&link.role==='bridge'));
  assert.deepEqual(links.motifs,[{underlay:'paper',bridge:'stamp',materials:['upper','lower']}]);
  const anchored=trackCompositionAnchors(null,links);
  assert.deepEqual(anchored.anchors[0],{underlay:'paper',materials:['upper','lower'],bridge:'stamp'});
  scene.layers.at(-1).world.centerMm=[140,80];
  assert.equal(detectCompositionLinks(scene).motifs.length,0);
  assert.match(trackCompositionAnchors(anchored.anchors,detectCompositionLinks(scene)).notes[0],/连接对象已移开/);
  scene.layers[0].world.centerMm=[140,80];
  assert.match(trackCompositionAnchors(anchored.anchors,detectCompositionLinks(scene)).notes[0],/共同承托两个素材的关系已消失/);
});

test('only a repeated field of tilted materials prompts an angle check',()=>{
  const layer=(id,rotationDeg)=>({id,type:'material',surface:'page',world:{rotationDeg,sizeMm:[30,40]}});
  assert.equal(compositionRotationAdvice({layers:[layer('a',0),layer('b',4),layer('c',-3)]}),null);
  assert.match(compositionRotationAdvice({layers:[layer('a',4),layer('b',-3),layer('c',6)]}),/放正/);
});
