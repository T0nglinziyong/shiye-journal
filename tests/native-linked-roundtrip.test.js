import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas,loadImage} from 'canvas';
import {project} from '../src/domain.js';
import {createNativeProjectDocument,importNativeProjectDocument} from '../src/native-project-package.js';
import {applyInspectorLayout,inspectorSizeControls} from '../src/editor-layout-model.js';
import {applySceneWorldPatch} from '../src/scene-edit-kernel.js';
import {USER_SCENE_POLICY} from '../src/scene-edit-policy.js';
import {createLetteringGroup,reflowLettering} from '../src/scene-lettering.js';
import {saveManualArchive,restoreManualArchive} from '../src/scene-archive.js';
import {validateSceneLayout} from '../src/scene-layout.js';
import {renderSceneCanvas} from '../src/scene-renderer.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const pixels=async page=>(await renderSceneCanvas(page,{createCanvas:()=>createCanvas(1,1),loadShapeImage:(url,f)=>loadImage(Buffer.from(decodeURIComponent(url.split(',').slice(1).join(',')).replace('<svg ',`<svg width="${f.width}" height="${f.height}" `))),waitForFonts:false})).canvas.toBuffer('image/png');
function fixture(){
 const p=project('导入关系验证'),page=p.drafts[0];
 page.layers=[{id:'ref',type:'shape',kind:'rect',x:240,y:200,width:240,height:160,fill:'#d7dccc'},
  {id:'follow',type:'shape',kind:'ellipse',x:500,y:350,width:90,height:60,fill:'#e2b9ad'}];
 applyInspectorLayout(page,'follow',{action:'place',reference:'node:ref',position:'right',gap:2});
 applyInspectorLayout(page,'follow',{action:'size',reference:'node:ref',axes:'width',width:.5});
 const title=createLetteringGroup(page,{id:'title',content:'拾页',style:{fontPreset:'sans'}});
 title.localTransform[4]=500;title.localTransform[5]=500;page.layers.push(title);
 applyInspectorLayout(page,'follow',{action:'place',reference:'node:title',position:'below',gap:2});
 saveManualArchive(p,{id:'before'});p.draftHistorySnapshots[page.id]=structuredClone(page);
 return p;
}
test('native import remaps leaf/group links and title slots in current page, history and compressed archives',async()=>{
 const source=fixture(),before=await pixels(source.drafts[0]),envelope=JSON.parse(JSON.stringify(createNativeProjectDocument(source)));
 const imported=importNativeProjectDocument(envelope,[]),restored=restoreManualArchive(imported,imported.manualArchives[0].id);
 for(const page of [imported.drafts[0],imported.initialEditorSnapshot.drafts[0],...Object.values(imported.draftHistorySnapshots),restored.drafts[0]]){
  const [ref,follow,title]=page.layers;
  assert.notEqual(ref.id,'ref');assert.notEqual(title.id,'title');
  assert.equal(follow.layoutConstraint.size.reference,'node:'+ref.id);assert.equal(follow.layoutConstraint.place.reference,'node:'+title.id);
  assert.deepEqual(title.lettering.slots,title.children.map(n=>n.id));assert.doesNotThrow(()=>validateSceneLayout(page));
  assert.equal(inspectorSizeControls(page,follow.id).reference,'node:'+ref.id);
  assert.deepEqual(await pixels(page),before,'import and archive restoration preserve the real rendering');
  const beforeSize=follow.width;applySceneWorldPatch(page,ref.id,{width:ref.width*2},{policy:USER_SCENE_POLICY});near(follow.width,beforeSize*2);
  reflowLettering(page,title.id,{content:'拾页新章'},{policy:USER_SCENE_POLICY});assert.equal(title.children.map(n=>n.content).join(''),'拾页新章');
 }
});
test('native import rejects broken or cyclic links before creating an imported project',()=>{
 for(const invalid of ['missing','follow']){
  const source=fixture();source.drafts[0].layers[1].layoutConstraint.size.reference='node:'+invalid;
  assert.throws(()=>importNativeProjectDocument(createNativeProjectDocument(source),[]),/不存在|循环/);
 }
});
