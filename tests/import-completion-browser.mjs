import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {browserHarness} from './browser-harness.mjs';
const dir='/tmp/shiye-import-completion';await mkdir(dir,{recursive:true});
const b=await browserHarness('shiye-import-completion',process.env.SHIYE_TEST_URL||'http://127.0.0.1:5173');
const {command,evaluate,wait,click,sleep}=b;
const addPhoto=`(async()=>{const c=document.createElement('canvas');c.width=500;c.height=700;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,500,700);ctx.fillStyle='#467dac';ctx.fillRect(150,170,120,260);const blob=await new Promise(r=>c.toBlob(r));const dt=new DataTransfer();dt.items.add(new File([blob],'synthetic.png',{type:'image/png'}));const input=document.querySelector('#file-input');input.files=dt.files;input.dispatchEvent(new Event('change'));})()`;
async function capture(name,w,h){await sleep(100);assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));const shot=await command('Page.captureScreenshot',{format:'png'});await writeFile(`${dir}/${w}x${h}-${name}.png`,Buffer.from(shot.data,'base64'));}
try{
  const recognition=process.env.SHIYE_TEST_RECOGNITION||'auto',recognitionPixels=Number(process.env.SHIYE_TEST_RECOGNITION_PIXELS||900);
  await wait('.series-grid');await evaluate('localStorage.setItem("shiye-ui-preferences-v1",JSON.stringify({recognition:'+JSON.stringify(recognition)+',recognitionPixels:'+JSON.stringify(recognitionPixels)+'}));');await command('Page.reload');
  await wait('.series-grid');await sleep(400);await click('.swift-tabs button:nth-child(2)','.asset-grid');await click('[data-act=import]','.import-nav');
  await evaluate(addPhoto);
  await sleep(30000);
  if(!(await evaluate('!!document.querySelector(".import-inspect[aria-busy=\"false\"]")'))){
    const diagnostic=await evaluate('(async()=>{let vision=[];try{vision=(await import("/src/vision-runtime.js")).visionStatus();}catch{}return {vision,processing:document.querySelector(".import-processing")?.textContent||"",route:document.querySelector("#view")?.className||"",busy:document.querySelector(".import-inspect")?.getAttribute("aria-busy")};})()');
    console.log('Recognition diagnostic after 30s',JSON.stringify(diagnostic));
  }
  await wait('.import-inspect[aria-busy="false"]',300000);await wait('.import-candidate-tile');await click('[data-act=import-confirm-photo]','.review-candidates');await click('[data-act=confirm-import]','.import-done');
  for(const [w,h] of [[390,844],[768,1024],[1024,768],[1440,900]]){
    await command('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:w<700});
    const buttons=await evaluate('[...document.querySelectorAll(".import-done button")].map(b=>({font:getComputedStyle(b).fontSize,height:b.getBoundingClientRect().height}))');assert.ok(buttons.every(b=>b.font==='14px'&&b.height<=44),JSON.stringify(buttons));await capture('saved',w,h);
  }
  await click('[data-act=import-continue]','[data-act=select-file]');assert.equal(await evaluate('document.querySelectorAll(".import-candidate-tile").length'),0);
  await evaluate(`(async()=>{const db=await import('/src/store.js');const a=(await db.all('assets')).find(a=>a.title==='素材 1');if(!a)throw Error('Saved material missing');await db.transaction(['assets','trash'],tx=>{tx.objectStore('assets').delete(a.id);tx.objectStore('trash').put({id:'synthetic-trash',kind:'asset',item:a,date:new Date().toISOString()});});})()`);
  await command('Page.reload');await wait('.series-grid');await click('.swift-tabs button:nth-child(4)','.recently-deleted-grid');
  for(const [w,h] of [[390,844],[768,1024],[1024,768],[1440,900]]){
    await command('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:w<700});
    await wait('.recently-deleted-grid img[src^="blob:"]');
    const image=await evaluate('(async()=>{const im=document.querySelector(".recently-deleted-grid img");await im.decode();return {loaded:im.naturalWidth>0,height:im.parentElement.getBoundingClientRect().height,imageHeight:im.getBoundingClientRect().height};})()');assert.ok(image.loaded&&image.height>=140&&image.imageHeight>=120,JSON.stringify(image));await capture('deleted-cover',w,h);
  }
  assert.deepEqual(b.errors,[]);console.log('Import completion and recently deleted: 8 screenshots, full saved Blob cover, compact buttons and continue flow verified',dir);
}catch(error){console.log('Browser failure:',await evaluate('document.body.innerText.slice(-1800)'),b.errors);throw error;}finally{await b.close();}
