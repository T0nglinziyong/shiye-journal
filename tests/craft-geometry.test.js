import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCraftEdge, sourceIntersectionArea, sourceFootprint, craftPermission, craftUsage, CRAFT_EDGE_STYLES} from '../src/craft-geometry.js';
import {solveCraftRelations} from '../src/craft-relations.js';
const rect = (x, y, w, h) => ({outer: [[x, y], [x+w, y], [x+w, y+h], [x, y+h]], holes: []});
const area = ring => Math.abs(ring.reduce((sum,a,i)=>{const b=ring[(i+1)%ring.length];return sum+a[0]*b[1]-a[1]*b[0];},0))/2;

for (const style of CRAFT_EDGE_STYLES) test(`craft edge ${style} creates bounded real geometry, retaining physical frame`, () => {
  const m=buildCraftEdge({style,edges:['bottom'],depth_mm:2,period_mm:8,seed:12},100,80);
  assert.equal(m.shape,'polygon');assert.ok(m.points.length<=256);
  assert.ok(m.points.every(p=>p.every(v=>v>=0&&v<=1)));
  assert.ok(area(m.points)<1&&area(m.points)>.8);
  assert.deepEqual(m.points.slice(0,3),[[0,0],[1,0],[1,1]]);
  assert.ok(Math.abs(sourceIntersectionArea({outer:m.points,holes:[]},rect(0,0,1,1))-area(m.points))<1e-9);
});
test('torn edges reproduce exactly for the same seed and vary with different seeds',()=>{
  const op={style:'torn',edges:['bottom','left'],depth_mm:1,period_mm:10,seed:42};
  const a=buildCraftEdge(op,100,80);
  assert.deepEqual(buildCraftEdge(op,100,80),a);
  assert.notDeepEqual(buildCraftEdge({...op,seed:43},100,80),a);
});
test('invalid/overdense geometry fails before allocating unbounded work',()=>{
  for(const op of [{style:'fake'},{style:'torn',depth_mm:NaN},{style:'torn',period_mm:0},{style:'torn',depth_mm:30},{style:'torn',seed:-1},{style:'fringe',edges:['left','left']}])assert.throws(()=>buildCraftEdge(op,100,80));
  assert.throws(()=>buildCraftEdge({style:'postage',edges:['top','bottom','left','right'],period_mm:.5},100,80),/密|256/);
  assert.throws(()=>buildCraftEdge({style:'ticket_notch',position:0,period_mm:8},100,80),/角部/);
});
test('policy is opt-in and per-asset whole-only always wins',()=>{
  const a={id:'a',kind:'paper'};
  assert.equal(craftPermission({processing:'AI 自主加工'},a),'自由拆解');
  assert.equal(craftPermission({processing:'AI 自主加工'},{...a,kind:'photo'}),'少量裁剪');
  assert.equal(craftPermission({processing:'AI 自主加工',assetProcessing:{a:'保留完整'}},a),'保留完整');
  assert.equal(craftPermission({processing:'保留完整'},a),'保留完整');
  assert.equal(craftPermission({},a),undefined,'legacy API default is not silently reinterpreted');
});
test('a window frame and its offcut have zero source intersection despite identical bounds',()=>{
  const frame={...rect(0,0,100,80),holes:[rect(30,20,40,30).outer]};
  assert.equal(sourceIntersectionArea(frame,rect(30,20,40,30)),0);
  assert.equal(sourceIntersectionArea(frame,rect(30,20,40.5,30)),15);
  assert.equal(sourceIntersectionArea(frame,rect(0,0,100,80)),6800);
});
test('complementary triangles touch but do not duplicate; actual overlap is detected',()=>{
  const a={outer:[[0,0],[100,0],[100,100]],holes:[]};
  const b={outer:[[0,0],[100,100],[0,100]],holes:[]};
  assert.equal(sourceIntersectionArea(a,b),0);
  assert.equal(sourceIntersectionArea(a,a),5000);
  assert.equal(sourceIntersectionArea(a,rect(40,40,20,20)),200);
});
test('rotated diamond crosses a square between vertices and has exact area',()=>{
  const diamond={outer:[[0,1],[1,0],[2,1],[1,2]],holes:[]};
  assert.ok(Math.abs(sourceIntersectionArea(diamond,rect(.5,.5,1,1))-1)<1e-9);
  assert.equal(sourceIntersectionArea(diamond,rect(2,0,1,1)),0);
});
test('source footprint ignores page rotation, z, opacity, and parking',()=>{
  const a={physicalWidthMM:100,physicalHeightMM:80};
  const item={cropRect:{x:.2,y:.25,width:.5,height:.5}};
  const expected=rect(20,20,50,40);
  assert.deepEqual(sourceFootprint(item,a),expected);
  assert.deepEqual(sourceFootprint({...item,x:500,y:-200,rotation:90,isParked:true,opacity:0,zIndex:999},a),expected);
});
test('self crossing and malformed rings are rejected, not treated as free material',()=>{
  assert.throws(()=>sourceIntersectionArea({outer:[[0,0],[3,3],[0,3],[2,0]],holes:[]},rect(0,0,3,3)),/自交/);
  assert.throws(()=>sourceIntersectionArea({outer:[[0,0],[1,NaN],[1,1]],holes:[]},rect(0,0,3,3)));
});
const objects=()=>[
  {id:'a-id',creativePieceID:'a',x:100,y:100,width:40,height:60,rotation:90,zIndex:10},
  {id:'b-id',creativePieceID:'b',x:0,y:0,width:30,height:50,rotation:0,zIndex:1},
  {id:'c-id',creativePieceID:'c',x:160,y:100,width:10,height:10,rotation:0,zIndex:5}
];
test('peek resolves in a rotated target local coordinate space without scaling',()=>{
  const o=objects(),before=structuredClone(o);
  const r=solveCraftRelations(o,[{piece:'b',relation:{kind:'peek',target:'a',edge:'right',exposed_mm:5}}],1).get('b');
  assert.equal(r.rotation,90);assert.ok(Math.abs(r.x-100)<1e-9);assert.equal(r.y,110);assert.equal(r.zIndex,9);
  assert.equal(r.width,undefined);assert.equal(r.height,undefined);assert.deepEqual(o,before);
});
test('underlay offsets use millimetres and target rotation',()=>{
  const r=solveCraftRelations(objects(),[{piece:'b',relation:{kind:'underlay',target:'a',offset_mm:[10,0]}}],2).get('b');
  assert.ok(Math.abs(r.x-100)<1e-9);assert.equal(r.y,120);
});
test('bridge rejects short segments and aligns a long piece without changing dimensions',()=>{
  assert.throws(()=>solveCraftRelations(objects(),[{piece:'b',relation:{kind:'bridge',target:'a',target2:'c',contact_mm:3}}],1),/长度不足/);
  const o=objects();o[1].width=80;o[1].height=8;
  const r=solveCraftRelations(o,[{piece:'b',relation:{kind:'bridge',target:'a',target2:'c',contact_mm:3}}],1).get('b');
  assert.equal(r.x,130);assert.equal(r.y,100);assert.equal(r.rotation,0);assert.equal(r.zIndex,11);
});
test('relations resolve dependencies regardless of input order and reject cycles atomically',()=>{
  const o=objects();o[0].rotation=0;
  const list=[{piece:'c',relation:{kind:'underlay',target:'b',offset_mm:[5,0]}},{piece:'b',relation:{kind:'underlay',target:'a',offset_mm:[5,0]}}];
  assert.equal(solveCraftRelations(o,list,1).get('c').x,110);
  const before=structuredClone(o);
  assert.throws(()=>solveCraftRelations(o,[{piece:'a',relation:{kind:'underlay',target:'b'}},{piece:'b',relation:{kind:'underlay',target:'a'}}],1),/循环/);
  assert.deepEqual(o,before);
});
test('locked subjects are never repositioned but can be reference targets',()=>{
  const o=objects();o[0].isLocked=true;
  assert.ok(solveCraftRelations(o,[{piece:'b',relation:{kind:'underlay',target:'a'}}],1).has('b'));
  assert.throws(()=>solveCraftRelations(o,[{piece:'a',relation:{kind:'underlay',target:'b'}}],1),/锁定/);
});
test('craft diagnostics describe actual operations without prescribing minimum counts',()=>{
  assert.deepEqual(craftUsage({items:[{materialSteps:[{op:'whole'}]}]}),{pieces:1,processedPieces:0,wholePieces:1,relationPieces:0,operationKinds:[],allWhole:true});
  assert.deepEqual(craftUsage({items:[{materialSteps:[{op:'edge',style:'torn'}],materialRelation:{kind:'peek'}}]}).operationKinds,['edge:torn']);
});
