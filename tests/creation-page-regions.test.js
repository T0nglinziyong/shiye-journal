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
