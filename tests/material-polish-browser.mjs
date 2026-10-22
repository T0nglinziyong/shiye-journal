import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {browserHarness} from './browser-harness.mjs';
const base=process.env.SHIYE_TEST_URL||'http://127.0.0.1:5193',out='/tmp/shiye-material-polish';
await mkdir(out,{recursive:true});
const b=await browserHarness('shiye-material-polish',base+'/tests/fixtures/material-polish.html',({command})=>command('Emulation.setDeviceMetricsOverride',{width:1024,height:900,deviceScaleFactor:1,mobile:false}));
try{
 await b.wait('#processed [data-piece-preview="ready"]');await b.wait('#font-status');
 for(let i=0;i<150;i++){if(await b.evaluate('window.__polish?.fontStatus().faces.some(f=>f.status==="loaded")'))break;await b.sleep(40);}
 const font=await b.evaluate('window.__polish.fontStatus()');assert.equal(font.status,'web-artistic-ready');assert.ok(font.faces.some(f=>f.status==='loaded'),JSON.stringify(font));assert.match(font.family,/^"Ma Shan Zheng"/);
 const pixels=await b.evaluate('window.__polish.fontPixels()');assert.notEqual(pixels.hand,pixels.serif,'actual loaded artistic glyphs differ from system serif');
 const pixel=(x,y)=>b.evaluate(`Array.from(document.querySelector('#processed canvas').getContext('2d').getImageData(${x},${y},1,1).data)`);
 const center=await pixel(90,72);assert.ok(center[2]>240&&center[0]<10&&center[3]===255,JSON.stringify(center));assert.equal((await pixel(2,2))[3],0);
 const sourceImage=await b.evaluate('document.querySelector("#processed img").src');assert.equal(sourceImage,await b.evaluate('window.__polish.image'),'pinned old source must not switch to the new library blob');
 const canvasID=await b.evaluate('window.__savedPreview=document.querySelector("#processed canvas");true');
 await b.click('#mask');await b.sleep(80);assert.equal((await pixel(90,72))[3],0);assert.ok((await pixel(90,35))[3]>240);assert.equal(await b.evaluate('document.querySelectorAll("#processed canvas").length'),1);
 await b.click('#flip');await b.sleep(80);assert.ok((await pixel(40,72))[2]>240);assert.ok((await pixel(140,72))[0]>240);
 assert.equal(await b.evaluate('document.querySelector("#original canvas")===null&&getComputedStyle(document.querySelector("#original img")).visibility!=="hidden"'),true);
 assert.equal(await b.evaluate('document.querySelector("#fan [data-cover-layout]").dataset.coverLayout'),'fan');assert.equal(await b.evaluate('document.querySelector("#matrix [data-cover-layout]").dataset.coverLayout'),'grid');
 const saved=await b.evaluate('window.__polish.snapshot("#matrix","grid")');assert.ok(saved?.startsWith('blob:'));assert.equal(await b.evaluate('window.__polish.cache.values.size'),1);
 await b.evaluate('window.__polish.setMode("fan")');await b.sleep(80);assert.equal(await b.evaluate('document.querySelector("#matrix [data-cover-layout]").dataset.coverLayout'),'fan');assert.notEqual(await b.evaluate('window.__polish.snapshot("#matrix","fan")'),saved);
 // A missing image must keep its empty slot and not shift a later source.
 await b.evaluate('window.__polish.setMode("grid")');await b.sleep(50);
 const missing=await b.evaluate(`(async()=>{const cover=document.querySelector('#matrix');cover.querySelector('[data-cover-index="0"] img').remove();const {loadSeriesCoverSnapshot}=await import('/src/series-cover-snapshot.js');const url=await loadSeriesCoverSnapshot({cover,series:{id:'missing',coverLayout:'grid'},assets:window.__polish.assets,cache:window.__polish.cache,account:'fixture'});const image=new Image();image.src=url;await image.decode();const c=document.createElement('canvas');c.width=360;c.height=300;c.getContext('2d').drawImage(image,0,0);const pixel=(x,y)=>Array.from(c.getContext('2d').getImageData(x,y,1,1).data);return {empty:pixel(65,78),next:pixel(180,78)};})()`);
 assert.ok(missing.empty[0]>240&&missing.empty[1]>240&&missing.empty[2]>240);assert.ok(missing.next[0]<40||missing.next[2]<40,JSON.stringify(missing));
 for(const name of ['outline','offset','gradient','gradient-outline','shadow']){
  await b.click(`[data-text-effect="${name}"]`);await b.sleep(100);const node=await b.evaluate('window.__polish.scene.layers[0]');
  if(name.includes('outline')||name==='offset')assert.ok(node.textOutline);
  if(name.includes('gradient'))assert.ok(node.textGradient);
  if(name==='shadow')assert.ok(node.shadow);
 }
 await b.click('[data-text-effect="gradient-outline"]');await b.sleep(80);const before=await b.evaluate('JSON.stringify(window.__polish.scene)');
 await b.click('#reopen');await b.sleep(40);assert.equal(await b.evaluate('JSON.stringify(window.__polish.scene)'),before);
 await b.click('[data-text-effect="plain"]');await b.sleep(40);assert.equal(await b.evaluate('window.__polish.scene.layers[0].textOutline'),null);
 await b.click('#undo');await b.sleep(80);assert.equal(await b.evaluate('JSON.stringify(window.__polish.scene)'),before);
 for(const [width,height] of [[390,844],[768,1024],[1024,768],[1440,900]]){
  await b.command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<700});await b.sleep(100);
  const measured=await b.evaluate(`({overflow:document.documentElement.scrollWidth>innerWidth+1,font:getComputedStyle(document.querySelector('.match-creative-controls select')).fontSize,touch:document.querySelector('.match-creative-controls select').getBoundingClientRect().height,preset:document.querySelector('[data-text-effect]').getBoundingClientRect().width})`);
  assert.equal(measured.overflow,false,JSON.stringify({width,...measured}));assert.equal(measured.font,'14px');assert.ok(measured.touch>=44);assert.ok(measured.preset>=60);
  const png=await b.command('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await writeFile(`${out}/${width}x${height}.png`,Buffer.from(png.data,'base64'));
 }
 assert.deepEqual(b.errors,[]);console.log('MATERIAL_POLISH_BROWSER_PASS: loaded actual artistic font; crop/mask/flip pixels; pinned sources; fan/grid/snapshot; editable effects and undo; four viewports');
}finally{await b.close();}
