import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {browserHarness} from './browser-harness.mjs';
const b=await browserHarness('shiye-text-effects',(process.env.SHIYE_TEST_URL||'http://127.0.0.1:5192')+'/tests/fixtures/type-effects.html');
const directory=process.env.SHIYE_CRAFT_SCREENSHOTS||'/tmp/shiye-craft-browser';
try{
 for(let i=0;i<300;i++){if(await b.evaluate('window.__typeReady===true'))break;await b.sleep(20);}
 assert.equal(await b.evaluate('window.__typeReady===true'),true);
 const result=await b.evaluate(`(()=>{const arrays=window.__typePixels,count=a=>a.reduce((sum,v,i)=>sum+(i%4===3&&v>0?1:0),0);const gradient=arrays[3];let red=0,blue=0;for(let i=0;i<gradient.length;i+=4)if(gradient[i+3]>200){if(gradient[i]>gradient[i+2]+50)red++;if(gradient[i+2]>gradient[i]+50)blue++;}return {counts:arrays.map(count),different:JSON.stringify(arrays[1])!==JSON.stringify(arrays[2]),red,blue};})()`);
 assert.ok(result.counts[1]>result.counts[0]);assert.equal(result.different,true);assert.ok(result.red>20&&result.blue>20,JSON.stringify(result));
 const edit=await b.evaluate(`(async()=>{const t=window.__typeTest;t.canvas.setActiveObject(t.object);t.object.enterEditing();t.object.set('text','NO');t.bridge.applyObject(t.page,t.object,{policy:t.policy});t.object.exitEditing();const stored=JSON.parse(JSON.stringify(t.page));t.applySceneNodeChange(t.page,t.node.id,{style:{outline:null}},{policy:t.policy});const result=await t.renderSceneCanvas(t.page,{waitForFonts:true});return {content:stored.layers[0].content,gradient:stored.layers[0].textGradient,outline:stored.layers[0].textOutline,clear:t.node.textOutline,hasPNG:result.canvas.toDataURL().startsWith('data:image/png')};})()`);
 assert.equal(edit.content,'NO');assert.equal(edit.clear,null);assert.ok(edit.outline&&edit.gradient&&edit.hasPNG);
 await mkdir(directory,{recursive:true});for(const [width,height] of [[390,844],[768,1024],[1024,768],[1440,900]]){await b.command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<700});const shot=await b.command('Page.captureScreenshot',{format:'png'});await writeFile(directory+`/type-effects-${width}x${height}.png`,Buffer.from(shot.data,'base64'));}
 assert.deepEqual(b.errors,[]);console.log('TYPE_EFFECTS_BROWSER_PASS',JSON.stringify({synthetic:true,...result,editPreserved:true,physicalDevice:false}));
}finally{await b.close();}
