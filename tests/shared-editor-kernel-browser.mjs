// Actual Chromium and the real Fabric stage. Synthetic fixtures are not a
// substitute for physical Safari/Pencil testing.
import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';
const url=process.env.SHIYE_TEST_URL||'http://127.0.0.1:5193';
const b=await browserHarness('shiye-shared-editor',url+'/tests/fixtures/fabric-preview.html');
try{
 await b.wait('.upper-canvas');await b.sleep(500);
 // Real browser input must retain the same IME textarea and editing object.
 await b.evaluate(`(()=>{const c=window.__fabricCanvas,o=c.getObjects().find(n=>n.sceneID==='paper-text');c.setActiveObject(o);o.enterEditing();o.selectAll();window.__inputObject=o;window.__inputElement=o.hiddenTextarea;window.__textBefore=structuredClone(window.__fabricFixture.draft.layers.find(n=>n.id==='paper-text'));})()`);
 for(const value of ['统一编辑',' and text','\n第二行']){
  await b.command('Input.insertText',{text:value});
  assert.equal(await b.evaluate('window.__inputObject.isEditing&&window.__inputObject.hiddenTextarea===window.__inputElement'),true);
 }
 const parity=await b.evaluate(`(async()=>{const {applySceneNodePatch}=await import('/src/scene-edit-kernel.js'),{USER_SCENE_POLICY}=await import('/src/scene-edit-policy.js');const actual=window.__fabricFixture.draft.layers.find(n=>n.id==='paper-text');const p={...window.__fabricFixture.draft,layers:[structuredClone(window.__textBefore)]};applySceneNodePatch(p,actual.id,{content:actual.content},{policy:USER_SCENE_POLICY});const expected=p.layers[0];window.__inputObject.exitEditing();return {actual:[actual.width,actual.height,actual.fontSize,actual.content],expected:[expected.width,expected.height,expected.fontSize,expected.content]};})()`);
 assert.deepEqual(parity.actual,parity.expected);
 // A gesture changes only the projection until release, then one commit.
 await b.evaluate('window.__fabricFixture.select(["paper-shape"])');
 for(let i=0;i<80;i++){if(await b.evaluate('!!window.__fabricCanvas.getActiveObject()?.sceneMultiIDs'))break;await b.sleep(20);}
 const start=await b.evaluate(`(()=>{const r=document.querySelector('.upper-canvas').getBoundingClientRect();return {x:r.left+190*r.width/600,y:r.top+160*r.height/800};})()`);
 const before=await b.evaluate('JSON.stringify(window.__fabricFixture.draft.layers)'),count=await b.evaluate('window.__fabricFixture.commits.length');
 await b.command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...start});
 await b.command('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,x:start.x+30,y:start.y+15});
 assert.equal(await b.evaluate('JSON.stringify(window.__fabricFixture.draft.layers)'),before,'pointer preview must not mutate Scene');
 await b.command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,x:start.x+30,y:start.y+15});
 assert.notEqual(await b.evaluate('JSON.stringify(window.__fabricFixture.draft.layers)'),before);
 assert.equal(await b.evaluate('window.__fabricFixture.commits.length'),count+1);
 // Declined visual resizing cannot modify a single saved field or emit commit.
 await b.evaluate(`(()=>{window.__confirmOriginal=window.confirm;window.__confirmCount=0;window.confirm=()=>{window.__confirmCount++;return false;};const c=window.__fabricCanvas,o=c.getObjects().find(n=>n.sceneID==='paper-material');window.__materialBefore=JSON.stringify(window.__fabricFixture.draft.layers.find(n=>n.id==='paper-material'));o.set({scaleX:o.scaleX*1.2});c.fire('object:modified',{target:o});})()`);
 assert.equal(await b.evaluate('JSON.stringify(window.__fabricFixture.draft.layers.find(n=>n.id==="paper-material"))===window.__materialBefore'),true);
 await b.sleep(200);
 await b.evaluate(`(()=>{window.confirm=()=>{window.__confirmCount++;return true;};const c=window.__fabricCanvas,o=c.getObjects().find(n=>n.sceneID==='paper-material');o.set({scaleX:o.scaleX*1.2});c.fire('object:modified',{target:o});window.confirm=window.__confirmOriginal;})()`);
 const resized=await b.evaluate('({node:window.__fabricFixture.draft.layers.find(n=>n.id==="paper-material"),count:window.__confirmCount})');
 assert.equal(resized.node.manualVisualResize,true);assert.equal(resized.node.assetID,'fabric-sample');assert.equal(resized.count,2);
 for(const [width,height] of [[390,844],[768,1024],[1024,768],[1440,900]]){
  await b.command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<700});
  assert.equal(await b.evaluate('document.querySelectorAll(".upper-canvas").length'),1);
 }
 assert.deepEqual(b.errors,[]);
 console.log('SHARED_EDITOR_KERNEL_BROWSER_PASS: live preview, one commit, input identity, canonical reflow, explicit permission accept/cancel; four viewport simulations');
}finally{await b.close();}
