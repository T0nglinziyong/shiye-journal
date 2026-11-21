import test from 'node:test';
import assert from 'node:assert/strict';
import {project} from '../src/domain.js';
import {createEditorLettering,reflowEditorLettering,letteringEditorState} from '../src/editor-lettering.js';
import {copyEditableScene} from '../src/scene-structure-edit.js';
import {findSceneNode} from '../src/scene-v2.js';
import {applySceneNodePatch} from '../src/scene-edit-kernel.js';
import {USER_SCENE_POLICY} from '../src/scene-edit-policy.js';
import {applyScenePlacement} from '../src/scene-layout.js';
import {worldBox} from '../src/scene-spatial.js';
import {renderSceneCanvas} from '../src/scene-renderer.js';
import {createCanvas} from 'canvas';
const user={policy:USER_SCENE_POLICY};
const fixture=()=>{const page=project('标题').drafts[0];createEditorLettering(page,'title',{content:'去看看',style:{fontSizePt:22,fontPreset:'serif'},letters:[{index:1,style:{color:'#aa5533'},rotationDeg:8,offsetMm:[1,2]}]});return page;};
const png=async page=>(await renderSceneCanvas(page,{createCanvas:()=>createCanvas(1,1),waitForFonts:false})).canvas.toBuffer('image/png');
test('manual title reflow preserves individual style and edits until explicitly overridden',async()=>{
 const d=fixture(),group=findSceneNode(d,'title'),old=group.children.map(n=>n.id),pose=worldBox(d,'title');
 applySceneNodePatch(d,'title-g2',{color:'#335599',rotation:12,y:group.children[1].y+4},user);
 const state=letteringEditorState(d,'title');assert.equal(state.letters[1].rotationDeg,12);assert.ok(state.letters[1].offsetMm[1]>2);
 reflowEditorLettering(d,'title',{content:'去走走吧',gapMm:2});
 assert.deepEqual(group.children.slice(0,3).map(n=>n.id),old);assert.equal(group.children[1].color,'#335599');assert.equal(group.children[1].rotation,12);
 assert.equal(worldBox(d,'title').cx,pose.cx);assert.equal(worldBox(d,'title').cy,pose.cy);
 reflowEditorLettering(d,'title',{style:{fontSizePt:30,color:'#112233'}});assert.ok(group.children.every(n=>n.color==='#112233'));
 assert.deepEqual(await png(d),await png(JSON.parse(JSON.stringify(d))));
});
test('manual title copies remap metadata slots and reflow without touching original',async()=>{
 const d=fixture(),original=JSON.stringify(findSceneNode(d,'title'));let next=0;
 const [copy]=copyEditableScene(d,['title'],()=>`copy-${++next}`,user);
 const copied=findSceneNode(d,copy);assert.deepEqual(copied.lettering.slots,copied.children.map(n=>n.id));assert.doesNotThrow(()=>letteringEditorState(d,copy));
 reflowEditorLettering(d,copy,{content:'新标题',gapMm:3});assert.equal(JSON.stringify(findSceneNode(d,'title')),original);assert.equal(letteringEditorState(d,copy).content,'新标题');
 assert.deepEqual(await png(d),await png(JSON.parse(JSON.stringify(d))));
});
test('invalid title edits, locks and linked child removal are atomic',()=>{
 const d=fixture();
 for(const request of [{content:'\n'},{gapMm:-1},{style:{fontSizePt:-5}},{letters:[{index:0,rotationDeg:NaN}]},{letters:[{index:0,offsetMm:[Infinity,0]}]}]){
  const before=structuredClone(d);assert.throws(()=>reflowEditorLettering(d,'title',request));assert.deepEqual(d,before);
 }
 findSceneNode(d,'title-g1').locked=true;let before=structuredClone(d);assert.throws(()=>reflowEditorLettering(d,'title',{content:'新的标题'}),/锁定/);assert.deepEqual(d,before);
 findSceneNode(d,'title-g1').locked=false;
 createEditorLettering(d,'second',{content:'字'});applyScenePlacement(d,'second',{reference:'node:title-g3',referenceAnchor:'bottom-center',behavior:'linked'});before=structuredClone(d);
 assert.throws(()=>reflowEditorLettering(d,'title',{content:'去'}),/linked/);assert.deepEqual(d,before);
});
