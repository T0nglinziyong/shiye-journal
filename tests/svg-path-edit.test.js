import test from 'node:test';
import assert from 'node:assert/strict';
import paper from 'paper';
import {createCanvas,loadImage} from 'canvas';
import {editableSVGCommands,vectorEditorState,editVectorSegment,applyInspectorVectorGeometry} from '../src/editor-vector-geometry.js';
import {svgPathSegments,editSVGSegment} from '../src/svg-path-edit.js';
import {renderSceneCanvas} from '../src/scene-renderer.js';
import {project} from '../src/domain.js';
import {createNativeProjectDocument,importNativeProjectDocument} from '../src/native-project-package.js';
const encode=c=>c.map(p=>p.join(' ')).join(' ');
const shape=d=>({id:'v',type:'shape',kind:'vector',x:300,y:330,width:340,height:240,rotation:0,fill:null,stroke:'#265441',lineWidth:3,svgViewBox:[0,0,100,100],svgPaths:[{d,opacity:.8},{d:'M20 95 L80 95',stroke:'#bb6633'}]});
const make=d=>{const p=project('曲线编辑');p.drafts[0].layers=[shape(d)];return p;};
const pixels=async p=>{
 const result=await renderSceneCanvas(p,{createCanvas:()=>createCanvas(1,1),loadShapeImage:(url,f)=>loadImage(Buffer.from(decodeURIComponent(url.split(',').slice(1).join(',')).replace('<svg ',`<svg width="${f.width}" height="${f.height}" `))),waitForFonts:false});
 return result.canvas.getContext('2d').getImageData(0,0,result.canvas.width,result.canvas.height).data;
};
function maxCurveDistance(a,b){
 const scope=new paper.PaperScope();scope.setup(new scope.Size(100,100));const first=new scope.Path(a),second=new scope.Path(b);let max=0;
 for(let i=0;i<=100;i++){const t=i/100,u=first.getPointAt(first.length*t),v=second.getPointAt(second.length*t);assert.ok(u&&v,'curve sampling stays within path length');max=Math.max(max,u.getDistance(v));}
 scope.project.remove();return max;
}
test('segment splitting preserves line, Bezier and elliptical arc geometry, actual pixels and import',async()=>{
 for(const d of ['M10 30 L90 60','M10 50 Q50 5 90 50','M10 50 C20 5 70 95 90 50','M10 50 A40 25 30 0 1 90 50','M10 50 A50 35 30 1 0 90 50','M10 50 A2 3 -30 1 1 90 50']){
  const p=make(d),page=p.drafts[0],original=await pixels(page),before=structuredClone(page.layers[0]);
  const state=editVectorSegment(vectorEditorState(before),0,1,{action:'split'});applyInspectorVectorGeometry(page,'v',state);
  const changed=page.layers[0],distance=maxCurveDistance(d,changed.svgPaths[0].d);assert.ok(distance<.035,`${d}: independent curve deviation ${distance}`);
  assert.deepEqual(changed.svgPaths[1],before.svgPaths[1]);assert.equal(changed.svgPaths[0].opacity,.8);
  const after=await pixels(page);let total=0;for(let i=0;i<after.length;i++)total+=Math.abs(after[i]-original[i]);assert.ok(total/after.length<.1,`actual render deviation ${total/after.length}`);
  const reloaded=importNativeProjectDocument(createNativeProjectDocument(p),[]);assert.deepEqual(await pixels(reloaded.drafts[0]),after);
 }
});
test('splitting a closing edge retains closure and other subpaths',()=>{
 const commands=editableSVGCommands('M10 10 L90 10 L90 90 Z M30 30 L40 40'),next=editSVGSegment(commands,3,{action:'split'});
 assert.deepEqual(next,[['M',10,10],['L',90,10],['L',90,90],['L',50,50],['Z'],['M',30,30],['L',40,40]]);
 const open=editSVGSegment(next,1,{action:'close',closed:false});assert.deepEqual(open.slice(-2),next.slice(-2));assert.equal(open.some(c=>c[0]==='Z'),false);
 const closed=editSVGSegment(open,1,{action:'close',closed:true});assert.deepEqual(closed,next);
});
test('explicit type changes keep endpoints; quadratic elevation is exact',()=>{
 const initial=editableSVGCommands('M10 20 Q50 5 90 80 L20 90 Z'),cubic=editSVGSegment(initial,1,{action:'convert',kind:'C'});
 assert.ok(maxCurveDistance(encode(initial),encode(cubic))<1e-6);
 for(const kind of ['L','Q','C','A']){
  const changed=editSVGSegment(initial,1,{action:'convert',kind});assert.deepEqual(changed[1].slice(-2),[90,80]);assert.deepEqual(changed.slice(2),initial.slice(2));
 }
 assert.equal(editSVGSegment(initial,3,{action:'convert',kind:'Q'}).at(-1)[0],'Z');
});
test('arc controls keep fixed endpoints and canonical radii, reject invalid inputs atomically',()=>{
 const initial=editableSVGCommands('M10 50 A40 25 30 0 1 90 50 L90 90');
 const edited=editSVGSegment(initial,1,{action:'arc',values:{radiusX:10,radiusY:20,rotation:-20,large:1,sweep:0}});
 assert.ok(edited[1][1]>=10);assert.ok(edited[1][2]>=20);assert.deepEqual(edited[1].slice(3),[-20,1,0,90,50]);assert.deepEqual(edited[2],initial[2]);
 for(const values of [{radiusX:-1},{rotation:NaN},{large:2},{sweep:-1},{radiusY:Infinity},{unknown:3}]){const snapshot=structuredClone(initial);assert.throws(()=>editSVGSegment(initial,1,{action:'arc',values}));assert.deepEqual(initial,snapshot);}
 assert.throws(()=>editSVGSegment(initial,2,{action:'arc',values:{radiusX:2}}));
});
test('deleting a segment keeps following endpoints and rejects empty subpaths',()=>{
 const initial=editableSVGCommands('M10 10 L20 20 Q30 40 50 60 L80 80 Z M20 10 L30 10');
 const next=editSVGSegment(initial,2,{action:'remove'});assert.deepEqual(next,[['M',10,10],['L',20,20],['L',80,80],['Z'],['M',20,10],['L',30,10]]);
 assert.throws(()=>editSVGSegment(next,5,{action:'remove'}),/至少保留/);assert.throws(()=>editSVGSegment(next,3,{action:'remove'}),/打开轮廓/);
 assert.equal(svgPathSegments(next).length,4);
});
test('point arcs are not divided into fake shapes and zero radius arcs remain lines',()=>{
 assert.throws(()=>editSVGSegment(editableSVGCommands('M10 10 A30 30 0 1 1 10 10'),1,{action:'split'}),/重合端点/);
 assert.deepEqual(editSVGSegment(editableSVGCommands('M10 10 A0 30 0 1 1 90 90'),1,{action:'split'}),[['M',10,10],['L',50,50],['L',90,90]]);
 assert.throws(()=>editableSVGCommands(' '));
});
