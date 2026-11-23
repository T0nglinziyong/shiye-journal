import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePageReferenceCoordinates,creationBoundaryIssues,creationMarginIssues,assertNoWorseningBoundary,constrainCreationToPages} from '../src/creation-layout-guard.js';

const page={pageMode:'spread',canvas:{width:1420.4545454545455,height:1000},physicalPageHeightMM:176,layers:[]};
const document=layers=>({page:{...page,layers},source:{sourceSnapshots:[{assetID:'card',kind:'paper'}]}});

test('normalizes full spread x accidentally paired with page.right',()=>{
  const operations=[{op:'material.add',place:{reference:'page.right',at:[206,52],unit:'mm'}},{op:'material.add',place:{reference:'page.right',at:[80,52],unit:'mm'}}];
  normalizePageReferenceCoordinates(operations,page);
  assert.equal(operations[0].place.reference,'page');
  assert.equal(operations[1].place.reference,'page.right');
});

test('rejects a large writing card moved off the paper and allows an improving move',()=>{
  const layer=x=>({id:'writing-card',type:'material',assetID:'card',x,y:450,width:300,height:450,rotation:0});
  const inside=document([layer(1050)]),outside=document([layer(1370)]);
  assert.equal(creationBoundaryIssues(inside).length,0);
  assert.equal(creationBoundaryIssues(outside)[0].edge,'右');
  assert.throws(()=>assertNoWorseningBoundary(inside,outside),/越出所属单页/);
  assert.doesNotThrow(()=>assertNoWorseningBoundary(outside,inside));
});

test('crossing the middle seam is blocked with local leaf coordinates',()=>{
  const crossing=document([{id:'wide-title',type:'text',content:'跨页标题',x:710,y:300,width:220,height:70,rotation:0},{id:'wide-shape',type:'shape',x:710,y:460,width:180,height:50,rotation:0}]);
  const issue=creationBoundaryIssues(crossing).find(item=>item.edge==='中缝');
  assert.equal(issue.location,'左页');
  assert.ok(issue.bounds.xMax<125);
  assert.throws(()=>assertNoWorseningBoundary(document([]),crossing),/中缝跨页/);
  assert.ok(creationBoundaryIssues(crossing).some(item=>item.id==='wide-shape'&&item.edge==='中缝'));
});

test('a clipped material is translated onto its leaf without changing size',()=>{
  const layer={id:'card',type:'material',assetID:'card',x:690,y:100,width:270,height:350,rotation:0};
  const next=document([layer]);
  const corrections=constrainCreationToPages(document([]),next);
  assert.equal(corrections.length,1);
  assert.equal(layer.width,270);
  assert.equal(layer.height,350);
  assert.equal(creationBoundaryIssues(next).length,0);
  assert.ok(layer.x<690&&layer.y>100);
});

test('reports a title near the outer rim without trusting a material source label',()=>{
  const title={id:'title',type:'text',content:'周末小记',x:24,y:230,width:120,height:60,rotation:0};
  const backing={id:'backing',type:'material',assetID:'card',x:22,y:390,width:200,height:400,rotation:0};
  const issues=creationMarginIssues(document([title,backing]));
  assert.ok(issues.some(issue=>issue.id==='title'&&issue.edge==='左'));
  assert.ok(issues.some(issue=>issue.id==='backing'));
});

test('reports clipped writing, cards and small stickers at the outer edge',()=>{
  const title={id:'title',type:'text',content:'记录',x:8,y:180,width:90,height:45,rotation:0};
  const card={id:'major',type:'material',assetID:'other',x:1390,y:440,width:280,height:420,rotation:0};
  const sticker={id:'tiny',type:'material',assetID:'other',x:1410,y:130,width:30,height:30,rotation:0};
  const issues=creationBoundaryIssues(document([title,card,sticker]));
  assert.ok(issues.some(issue=>issue.id==='title'));
  assert.ok(issues.some(issue=>issue.id==='major'));
  assert.ok(issues.some(issue=>issue.id==='tiny'));
});
