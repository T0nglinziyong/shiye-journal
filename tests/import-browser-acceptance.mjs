// Optional private fixture is read only from an explicitly supplied local path.
// It is never copied to public/ or uploaded. Screenshots stay under /tmp.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';
const directory=process.env.SHIYE_IMPORT_SCREENSHOTS||'/tmp/shiye-import-acceptance';await mkdir(directory,{recursive:true});
const b=await browserHarness('shiye-import-test',process.env.SHIYE_TEST_URL||'http://127.0.0.1:5173');
const {evaluate,command,click,wait,sleep}=b,report=[];
async function screenshot(name,w,h){await sleep(100);const r=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(directory+'/'+w+'x'+h+'-'+name+'.png',Buffer.from(r.data,'base64'));const layout=await evaluate('({overflow:document.documentElement.scrollWidth-innerWidth,modalOpen:document.querySelector("#modal").open})');assert.ok(layout.overflow<=1,JSON.stringify(layout));report.push({name,width:w,height:h,...layout});}
try {
  if(process.env.SHIYE_TEST_RECOGNITION){await wait('.series-grid');await evaluate('localStorage.setItem("shiye-ui-preferences-v1",JSON.stringify({recognition:'+JSON.stringify(process.env.SHIYE_TEST_RECOGNITION)+'}));');await command('Page.reload');}
  await wait('.series-grid');await click('.swift-tabs button:nth-child(2)','.asset-grid');await click('[data-act="import"]','.import-nav');
  let photo;if(process.env.SHIYE_IMPORT_PHOTO){const file=await readFile(process.env.SHIYE_IMPORT_PHOTO);photo=file.toString('base64');}
  await evaluate('(async()=>{'+(photo?'const blob=new Blob([Uint8Array.from(atob('+JSON.stringify(photo)+'),c=>c.charCodeAt(0))],{type:"image/jpeg"});':'const c=document.createElement("canvas");c.width=900;c.height=1200;const x=c.getContext("2d");x.fillStyle="#343b41";x.fillRect(0,0,900,1200);x.fillStyle="#dedddf";x.fillRect(80,70,740,1050);for(const [px,py,color] of [[170,220,"#567bbc"],[450,530,"#84a782"],[170,810,"#a95542"]]){x.fillStyle=color;x.fillRect(px,py,180,190);}const blob=await new Promise(r=>c.toBlob(r,"image/png"));')+'const input=document.querySelector("#file-input"),dt=new DataTransfer();dt.items.add(new File([blob],"导入验收照片",{type:blob.type}));input.files=dt.files;input.dispatchEvent(new Event("change"));})()');
  await wait('.import-inspect[aria-busy="true"]');assert.ok(await evaluate('!!document.querySelector("#crop-preview img[src]")'));
  // Cold OpenCV worker startup can exceed 30 s in CI even though the warm path
  // finishes quickly. Keep a finite bound without conflating it with UI delay.
  await wait('.import-inspect[aria-busy="false"]',90000);
  await wait('.import-candidate-tile');await sleep(100);
  const analysis=await evaluate('({candidates:document.querySelectorAll(".import-candidate-tile").length,corners:[...document.querySelectorAll(".paper-handle")].map(b=>({x:b.style.left,y:b.style.top}))})');console.log('Import photo analysis:',JSON.stringify(analysis));
  if(photo){const thumbnails=await evaluate('Promise.all([...document.querySelectorAll(".candidate-thumb img")].map(async im=>{await im.decode();const c=document.createElement("canvas");c.width=im.naturalWidth;c.height=im.naturalHeight;c.getContext("2d").drawImage(im,0,0);return c.toDataURL("image/png").split(",")[1];}))');for(let i=0;i<thumbnails.length;i++)await writeFile(directory+'/candidate-'+i+'.png',Buffer.from(thumbnails[i],'base64'));}
  for(const [w,h] of [[320,640],[390,844],[700,1024],[768,1024],[1024,768],[1440,900],[2560,1440]]) {
    await command('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:w<700});await screenshot('inspect',w,h);
    assert.equal(await evaluate('document.querySelectorAll(".paper-correction").length'),0);assert.equal(await evaluate('document.querySelectorAll(".paper-handle").length'),4);
    if(w>=820){const rect=await evaluate('(()=>{const p=document.querySelector(".import-preparation").getBoundingClientRect(),i=document.querySelector(".import-inspector").getBoundingClientRect(),buttons=[document.querySelector(".import-photo-tools .btn"),document.querySelector(".confirm-photo")].map(e=>e.getBoundingClientRect().height);return {bottom:p.bottom-i.bottom,buttons};})()');assert.ok(Math.abs(rect.bottom)<1);assert.ok(Math.abs(rect.buttons[0]-rect.buttons[1])<1);}
    const before=await evaluate('document.querySelectorAll(".import-candidate-tile").length');await click('[data-act="preview-crop"]','[data-act="readjust-paper"]');await screenshot('correction-preview',w,h);assert.equal(await evaluate('document.querySelectorAll(".import-candidate-tile").length'),before);assert.equal(await evaluate('document.querySelectorAll(".paper-handle").length'),0);await click('[data-act="readjust-paper"]','.paper-handle');
  }
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await click('[data-act="manual-import-box"]','.multi-box-editor');
  for(const [w,h] of [[390,844],[1024,768],[390,844]]){
    await command('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:w<700});await sleep(100);
    const position=await evaluate('(()=>{const base=document.querySelector("#crop-preview"),image=base.querySelector("img"),overlay=base.querySelector(".multi-box-editor"),a=base.getBoundingClientRect(),b=overlay.getBoundingClientRect(),scale=Math.min(base.clientWidth/image.naturalWidth,base.clientHeight/image.naturalHeight);return {x:b.left-a.left,y:b.top-a.top,w:b.width,h:b.height,expectedX:(base.clientWidth-image.naturalWidth*scale)/2,expectedY:(base.clientHeight-image.naturalHeight*scale)/2,expectedW:image.naturalWidth*scale,expectedH:image.naturalHeight*scale,regions:overlay.querySelectorAll(".import-region").length};})()');
    assert.ok(position.regions>0);assert.ok(Math.abs(position.x-position.expectedX)<2&&Math.abs(position.y-position.expectedY)<2,JSON.stringify(position));assert.ok(Math.abs(position.w-position.expectedW)<2&&Math.abs(position.h-position.expectedH)<2,JSON.stringify(position));await screenshot('manual-box-coordinate',w,h);
  }
  await evaluate('[...document.querySelectorAll("#crop-preview + .import-photo-tools button")].find(b=>b.textContent==="取消标记").click()');
  await evaluate('globalThis.__candidateNode=document.querySelector(".import-candidate-grid");const panel=document.querySelector(".inspector-scroll");panel.scrollTop=panel.scrollHeight;globalThis.__candidateScroll=panel.scrollTop;');await click('[data-act="import-toggle-candidate"]');assert.ok(await evaluate('document.querySelector(".import-candidate-grid")===globalThis.__candidateNode&&document.querySelector(".inspector-scroll").scrollTop===globalThis.__candidateScroll'));await click('[data-act="import-toggle-candidate"]');
  await click('[data-import-check="0"]','#cutout-canvas');
  for(const mode of ['edge','appearance','direction']){
    await click('[data-cut-mode="'+mode+'"]');assert.ok(await evaluate('document.querySelector("#modal").open'));await screenshot('check-'+mode,2560,1440);
    const actions=mode==='edge'?['[data-repair="erase"]','[data-repair="restore"]','#cutout-recognition','#cutout-undo']:mode==='appearance'?['[data-appearance="natural"]','[data-appearance="vivid"]','#cutout-original-color']:['#cutout-left','#cutout-rotate','#cutout-align','#cutout-original-direction'];
    for(const selector of actions){await click(selector);assert.ok(await evaluate('document.querySelector("#modal").open'),'Editor must stay open after '+selector);}
  }
  await click('#cutout-reset');
  for(const [w,h] of [[390,844],[768,1024],[1024,768],[1440,900]]){await command('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:w<700});await screenshot('cutout',w,h);const scrolling=await evaluate('(()=>{const m=document.querySelector("#modal");m.scrollTop=m.scrollHeight;return {top:m.scrollTop,height:m.clientHeight,total:m.scrollHeight};})()');assert.ok(scrolling.total<=scrolling.height+1||scrolling.top>0,'Material editor must be scrollable');}
  await click('#cutout-cancel');await click('[data-act="import-confirm-photo"]','.review-candidates');
  assert.equal(await evaluate('document.querySelectorAll(".review-candidate input,.review-candidate select").length'),0);
  for(const [w,h] of [[390,844],[768,1024],[1024,768],[1440,900]]){await command('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:w<700});await screenshot('review',w,h);}
  assert.deepEqual(b.errors,[]);await writeFile(directory+'/report.json',JSON.stringify({privateFixture:!!photo,analysis,report,errors:b.errors},null,2));console.log('Import browser verification passed:',report.length,'screens',directory);
}catch(e){console.error('Import diagnostic',await evaluate('({phase:document.querySelector(".import-processing")?.textContent,toast:document.querySelector("#toast")?.textContent})'),b.errors);throw e;}finally{await b.close();}
