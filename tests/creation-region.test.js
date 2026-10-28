import test from 'node:test';
import assert from 'node:assert/strict';
import {creationRegionGeometry,flattenCreationPath} from '../src/creation-region.js';
import {geometryArea} from '../src/craft-topology.js';

test('closed SVG curves and arcs are flattened into bounded physical geometry',()=>{
 const rings=flattenCreationPath('M 0 0 C 4 0 6 8 10 8 A 5 5 0 0 1 10 18 L 0 18 Z');
 assert.equal(rings.length,1);assert.ok(rings[0].length>12);
 const geometry=creationRegionGeometry({shape:'path',space:'source',unit:'mm',d:'M 0 0 C 4 0 6 8 10 8 A 5 5 0 0 1 10 18 L 0 18 Z'},
  {sourceSize:[100,80],localSize:[100,80],crop:{x:0,y:0,width:1,height:1}});
 assert.ok(geometryArea(geometry)>50);
 assert.throws(()=>flattenCreationPath('M0 0 L5 0 L5 5'),/闭合/);
 assert.throws(()=>flattenCreationPath('M0 0 L5 0 L5 5 Z script'),/字符无效/);
});

test('source and local region units map through the current crop',()=>{
 const geometry=creationRegionGeometry({shape:'polygon',space:'local',unit:'ratio',points:[[0,0],[.5,0],[.5,1],[0,1]]},
  {sourceSize:[100,80],localSize:[40,40],crop:{x:.2,y:.25,width:.4,height:.5}});
 assert.ok(Math.abs(geometryArea(geometry)-800)<1e-7);
});

test('multi-contour SVG paths honor evenodd holes and disjoint islands',()=>{
 const context={sourceSize:[100,80],localSize:[100,80],crop:{x:0,y:0,width:1,height:1}};
 const region={shape:'path',space:'source',unit:'mm',fillRule:'evenodd',d:'M0 0 H30 V30 H0 Z M5 5 H15 V15 H5 Z M40 0 H50 V10 H40 Z'};
 assert.ok(Math.abs(geometryArea(creationRegionGeometry(region,context))-900)<1e-7);
 assert.ok(Math.abs(geometryArea(creationRegionGeometry({...region,fillRule:'nonzero'},context))-1000)<1e-7);
});
