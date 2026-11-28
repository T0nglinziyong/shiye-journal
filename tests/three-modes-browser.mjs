import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {browserHarness} from './browser-harness.mjs';
const b=await browserHarness('shiye-three-modes',(process.env.SHIYE_TEST_URL||'http://127.0.0.1:5192')+'/tests/fixtures/three-modes.html');
try{
 for(let i=0;i<600;i++){if(await b.evaluate('window.__threeReady===true'))break;await b.sleep(30);}
 assert.equal(await b.evaluate('window.__threeReady===true'),true,JSON.stringify({errors:b.errors,console:b.consoleMessages}));
 const check=await b.evaluate(`(async()=>{const t=window.__three,again=await t.calculateGraphics(t.query),node=t.findSceneNode(t.doc.page,'star-1');await t.apply([{op:'layer.update',target:'star-1',style:{stroke:'#A35E40'}}]);return {seed:again.svg===t.result.svg,editable:node.type==='shape'&&!!node.svgPaths,updated:t.findSceneNode(t.doc.page,'star-1').stroke,children:t.findSceneNode(t.doc.page,'star').children.length};})()`);
 assert.equal(check.seed,true);assert.equal(check.editable,true);assert.equal(check.updated,'#A35E40');assert.ok(check.children>=2);
 const rejected=await b.evaluate(`(async()=>{try{await window.__three.calculateGraphics({...window.__three.query,seed:undefined});return false;}catch(error){return error.code==='GRAPHICS_SEED';}})()`);assert.equal(rejected,true);
 const exports=await b.evaluate('window.__three.exports()');assert.deepEqual(exports,[{mode:'edit',delivery:'tools',scene:true,graphics:true,reference:false,source:'edit'},{mode:'draw',delivery:'image',scene:false,graphics:false,reference:false,source:'draw'},{mode:'hybrid',delivery:'tools',scene:true,graphics:true,reference:true,source:'hybrid'}]);
 for(const mode of ['draw','hybrid','edit']){await b.evaluate(`(()=>{const e=document.querySelector('#match-creation-mode');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,${JSON.stringify(mode)});e.dispatchEvent(new Event('change',{bubbles:true}));})()`);await b.sleep(30);assert.equal(await b.evaluate('window.__mode'),mode);}
 const dir=process.env.SHIYE_CRAFT_SCREENSHOTS||'/tmp/shiye-craft-browser';await mkdir(dir,{recursive:true});
 for(const [width,height] of [[390,844],[820,1180],[1180,820],[1440,900]]){await b.command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<700});await b.sleep(40);const shot=await b.command('Page.captureScreenshot',{format:'png'});await writeFile(dir+`/three-modes-${width}x${height}.png`,Buffer.from(shot.data,'base64'));}
 assert.deepEqual(b.errors,[]);console.log('THREE_MODES_GRAPHICS_BROWSER_PASS',JSON.stringify({check,exports,synthetic:true,paidModelCalled:false}));
}finally{await b.close();}
