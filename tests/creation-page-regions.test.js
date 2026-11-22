import test from 'node:test';
import assert from 'node:assert/strict';
import {creationPageRegions} from '../src/creation-page-regions.js';
import {auditCreationDesign} from '../src/creation-design-audit.js';
const page=()=>({pageMode:'spread',canvas:{width:250,height:176},physicalPageHeightMM:176,layers:[]});
test('double pages expose physical safe rectangles; single pages have no gutter',()=>{
 const p=page(),regions=creationPageRegions(p);
 assert.deepEqual(regions.gutter,{x:120,width:10,center:125,insetPerPage:5});
 assert.equal(regions.safeRegions[0].x+regions.safeRegions[0].width,120);
 assert.equal(regions.safeRegions[1].x,130);
 assert.equal(creationPageRegions({...p,pageMode:'single'}).gutter,undefined);
});
test('gutter advice uses world frames of rotated nested groups without mutating the Scene',()=>{
 const p=page();p.layers=[{id:'g',type:'group',localTransform:[0,1,-1,0,124,50],children:[{id:'text',type:'text',x:0,y:0,width:20,height:12,fontSize:12,content:'字'}]},{id:'hidden',type:'material',hidden:true,x:125,y:50,width:30,height:40},{id:'safe',type:'material',x:50,y:50,width:40,height:40}];
 const before=JSON.stringify(p),report=auditCreationDesign(p);
 assert.deepEqual(report.gutterIntersections,[{id:'text',type:'text',crossesSeam:true}]);assert.match(report.observations.join('\n'),/中缝安全带/);assert.equal(JSON.stringify(p),before);
 assert.deepEqual(auditCreationDesign({...p,pageMode:'single'}).gutterIntersections,[]);
});
test('paper grounds do not conceal weak foreground accents or disconnected body text',()=>{
 const p=page();p.layers=[
  {id:'left-ground',type:'shape',kind:'rectangle',x:62.5,y:88,width:125,height:176,fill:'#F5EFE3'},
  {id:'right-ground',type:'shape',kind:'rectangle',x:187.5,y:88,width:125,height:176,fill:'#F1EBE0'},
  {id:'image',type:'material',x:68,y:65,width:68,height:85},
  {id:'body',type:'text',x:28,y:145,width:60,height:30,content:'一段长度足够的正文，被放在主图左边很远的位置，因此图文读起来脱节，还需要多写几个字。',fontSize:10}
 ];
 const report=auditCreationDesign(p,{styles:['丰富层叠']});
 assert.equal(report.estimatedGraphicPaintFraction,0);
 assert.equal(report.clusterAlignment[0].material,'image');
 assert.ok(report.observations.some(note=>note.includes('长正文与最大素材')));
 assert.ok(report.observations.some(note=>note.includes('装饰笔触')));
});
test('a later solid colour card warns when it covers a paragraph',()=>{
 const p={...page(),pageMode:'single',canvas:{width:148,height:210},physicalPageHeightMM:210,layers:[
  {id:'body',type:'text',x:74,y:120,width:85,height:65,content:'这一段正文要留在纸面上，后放的卡纸不应遮住字。',fontSize:4},
  {id:'card',type:'shape',kind:'path',x:103,y:144,width:65,height:53,fill:'#EAB362'}
 ]};
 assert.ok(auditCreationDesign(p).observations.some(note=>note.includes('后放的实心纸层')));
 assert.ok(!auditCreationDesign({...p,layers:[...p.layers].reverse()}).observations.some(note=>note.includes('后放的实心纸层')));
});
