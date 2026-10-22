import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {browserHarness} from './browser-harness.mjs';
const b=await browserHarness('shiye-graphics',(process.env.SHIYE_TEST_URL||'http://127.0.0.1:5192')+'/tests/fixtures/unified-graphics.html');
try{
 for(let i=0;i<900;i++){if(await b.evaluate('window.__graphicsReady===true'))break;await b.sleep(20);}
 assert.equal(await b.evaluate('window.__graphicsReady===true'),true,JSON.stringify({errors:b.errors,console:b.consoleMessages,document:await b.evaluate('({url:location.href,body:document.body?.innerText?.slice(0,1200)})')}));
 const stats=await b.evaluate(`(()=>{const t=window.__graphicsTest,c=document.querySelector('#artwork'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let colored=0;for(let i=0;i<d.length;i+=4)if(Math.max(d[i],d[i+1],d[i+2])-Math.min(d[i],d[i+1],d[i+2])>35)colored++;return {colored,nodes:t.doc.page.layers.map(n=>[n.id,n.type]),help:JSON.stringify(t.help).length,widthRatio:t.worldBox(t.doc.page,'main').w/t.worldBox(t.doc.page,'accent').w};})()`);
 assert.ok(stats.colored>1000);assert.equal(stats.widthRatio,42/8);assert.ok(stats.nodes.some(([id,type])=>id==='stroke'&&type==='ink'));assert.ok(stats.help<6000);
 const update=await b.evaluate(`(async()=>{const t=window.__graphicsTest,old=t.worldBox(t.doc.page,'accent');const d=t.applyCreationV2Batch(t.doc,t.tx([{op:'layer.update',target:'main',place:{reference:'page',at:[55,55],unit:'mm'},geometry:{kind:'ellipse'},style:{fill:'#AABBCC'}}]),t.assets);const moved=t.worldBox(d.page,'accent');const output=await t.renderSceneCanvas(d.page);return {kind:t.findSceneNode(d.page,'main').kind,moved:moved.cx!==old.cx,editable:t.object.sceneType,preview:output.canvas.toDataURL().startsWith('data:image/png')};})()`);
 assert.deepEqual(update,{kind:'ellipse',moved:true,editable:'shape',preview:true});
 const rejected=await b.evaluate(`(()=>{const t=window.__graphicsTest;return ['shape.add','vector.add','ink.add','draw.decorate'].every(op=>{try{t.applyCreationV2Batch(t.doc,t.tx([{op}]),t.assets);return false;}catch{return true;}});})()`);assert.equal(rejected,true);
 const directory=process.env.SHIYE_CRAFT_SCREENSHOTS||'/tmp/shiye-craft-browser';await mkdir(directory,{recursive:true});
 for(const [width,height] of [[390,844],[768,1024],[1024,768],[1440,900]]){await b.command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<700});const shot=await b.command('Page.captureScreenshot',{format:'png'});await writeFile(directory+`/unified-graphics-${width}x${height}.png`,Buffer.from(shot.data,'base64'));}
 assert.deepEqual(b.errors,[]);console.log('UNIFIED_GRAPHICS_BROWSER_PASS',JSON.stringify({stats,update,synthetic:true,physicalDevice:false}));
}finally{await b.close();}
