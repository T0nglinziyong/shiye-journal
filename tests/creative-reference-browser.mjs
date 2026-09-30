import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {browserHarness} from './browser-harness.mjs';
const b=await browserHarness('shiye-reference-preview',process.env.SHIYE_TEST_URL||'http://localhost:5175');
try{
 await b.wait('.series-grid');
 const result=await b.evaluate(`(async()=>{const {presetReferencePlans,renderPresetReferences}=await import('/src/creative-reference-presets.js');const plans=presetReferencePlans({styles:['韩系清新'],purposes:['日常记录']});const images=await renderPresetReferences(plans);document.body.innerHTML='<main style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;padding:20px;background:#e9ece5"></main>';const root=document.querySelector('main');for(const image of images){const item=document.createElement('img');item.src=image.url;item.style.width='100%';root.append(item);}return {count:images.length,zones:plans.map(p=>p.zones.length),source:plans.map(p=>p.source)};})()`);
 assert.equal(result.count,4);assert.ok(result.zones.every(n=>n>=6));assert.ok(result.source.every(Boolean));
 await b.command('Emulation.setDeviceMetricsOverride',{width:1440,height:700,deviceScaleFactor:1,mobile:false});
 const png=await b.command('Page.captureScreenshot',{format:'png'});await writeFile('/tmp/shiye-creative-reference.png',Buffer.from(png.data,'base64'));
 assert.deepEqual(b.errors,[]);console.log('Four real-journal-derived anonymous presets rendered with six content zones each.');
}finally{await b.close();}
