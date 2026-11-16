// Run after `npm run build:ui` with Vite preview serving dist. Exercises the
// real import UI while the CloudBase compute boundary is simulated locally.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {build} from 'esbuild';
import {browserHarness} from './browser-harness.mjs';

const fixture=await build({entryPoints:['tests/fixtures/ui-cloudbase-harness.mjs'],bundle:true,
  platform:'browser',format:'iife',globalName:'ShiyeUiFixture',write:false});
const injection=fixture.outputFiles[0].text+`\nShiyeUiFixture.installUiCloudBase(window);
  window.__blobFrames=[];
  const oldToBlob=HTMLCanvasElement.prototype.toBlob;
  HTMLCanvasElement.prototype.toBlob=function(...args){window.__blobFrames.push([this.width,this.height]);return oldToBlob.apply(this,args);};`;
const b=await browserHarness('shiye-sam-import',process.env.SHIYE_TEST_URL||'http://127.0.0.1:5173/',
  async({command})=>command('Page.addScriptToEvaluateOnNewDocument',{source:injection}));
const {evaluate,wait,click,command,sleep}=b;
try{
  try{await wait('.series-grid');}catch(error){console.error('startup',await evaluate('({url:location.href,text:document.body.innerText.slice(0,800)})'),b.errors,b.consoleMessages);throw error;}
  await evaluate(`localStorage.setItem('shiye-ui-preferences-v1',JSON.stringify({
    recognitionDefaultsVersion:4,recognition:'fastsam-sam2-small',paperSize:'a4',orientation:'landscape',
    samPointsPerSide:24,samCropNLayers:1,samGranularity:'balanced'}))`);
  await command('Page.reload');await wait('.series-grid');
  await evaluate('window.__SHIYE_UI_CLOUD__.state.samExtraCandidate=true');
  await click('.swift-tabs button:nth-child(2)','.asset-grid');
  await click('[data-act="import"]','.import-nav');
  const recognitionStart=performance.now();
  await evaluate(`(async()=>{
    const canvas=document.createElement('canvas');canvas.width=1800;canvas.height=1300;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#302724';ctx.fillRect(0,0,1800,1300);
    ctx.fillStyle='#f9f8f1';ctx.fillRect(110,90,1580,1120);
    ctx.fillStyle='#26201e';ctx.fillRect(350,260,450,700);
    ctx.fillStyle='#c5493d';ctx.fillRect(420,330,130,150);
    ctx.fillStyle='#598ab0';ctx.fillRect(620,500,120,180);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    const files=new DataTransfer();for(let i=0;i<2;i++)files.items.add(new File([blob],'photo-'+i+'.png',{type:'image/png'}));
    const input=document.querySelector('#file-input');input.files=files.files;input.dispatchEvent(new Event('change'));
  })()`);
  await wait('.import-view-switch button:not(:disabled)',60000);
  const deadline=Date.now()+60000;
  while(Date.now()<deadline){
    if(await evaluate(`document.querySelectorAll('.queue-item')[1]?.textContent.includes('已预识别')`))break;
    await sleep(100);
  }
  const initial=await evaluate(`({ready:document.querySelectorAll('.queue-item')[1]?.textContent.includes('已预识别'),
    jobs:window.__SHIYE_UI_CLOUD__.state.jobs.size,
    inputs:[...window.__SHIYE_UI_CLOUD__.state.objects.entries()].filter(([key])=>key.endsWith('input.png'))
      .map(([,blob])=>({size:blob.size,type:blob.type}))})`);
  assert.equal(initial.ready,true,'second photo should be processed before it is opened');
  assert.equal(initial.jobs,2);
  assert.deepEqual(await evaluate(`window.__SHIYE_UI_CLOUD__.state.jobRequests.map(request=>
    [request.p_model,request.p_parameters.algorithm])`),
    [['sam2-small','fastsam-sam2'],['sam2-small','fastsam-sam2']]);
  assert.ok(initial.inputs.every(item=>item.type==='image/png'&&item.size<200000));
  const recognitionMs=Math.round(performance.now()-recognitionStart);

  if(process.env.SHIYE_CAPTURE){
    await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await sleep(200);
    const shot=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    writeFileSync(process.env.SHIYE_CAPTURE,Buffer.from(shot.data,'base64'));
    await command('Emulation.clearDeviceMetricsOverride');
  }

  await click('.import-view-switch button:nth-child(2)');
  const untouchedPreview=await evaluate(`document.querySelectorAll('.import-candidate-tile img')[2].src`);
  await click('.import-primary-tools button:nth-child(3)');
  await click('.candidate-choice:nth-child(1) .import-candidate-tile');
  await click('.candidate-choice:nth-child(2) .import-candidate-tile');
  await click('.import-secondary-tools button.primary');
  await wait('.import-candidate-tile',30000);
  assert.equal(await evaluate(`document.querySelectorAll('.import-candidate-tile').length`),2,
    'two printed regions on the same paper become one material while the separate material remains');
  assert.equal(await evaluate(`document.querySelector('.import-candidate-tile img').src`),untouchedPreview,
    'merging must retain the unchanged material preview');

  await click('[data-act="manual-import-box"]','.multi-box-editor');
  const box=await evaluate(`(()=>{const r=document.querySelector('.multi-box-editor .import-region').getBoundingClientRect();
    return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
  await command('Input.dispatchMouseEvent',{type:'mousePressed',x:box.x,y:box.y,button:'left',clickCount:1});
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',x:box.x,y:box.y,button:'left',clickCount:1});
  await wait('[data-mode="resize"]');
  assert.equal(await evaluate(`!!document.querySelector('[data-mode="corner"]')`),false,
    'SAM box editing must not offer unsupported rotation');
  await click('.import-photo-tools button:nth-child(1)');

  const jobsBeforePost=await evaluate('window.__SHIYE_UI_CLOUD__.state.jobRequests.length');
  await click('#import-shape-regularization');
  await wait('.import-view-switch button:not(:disabled)',30000);
  await click('#import-apertures');
  await wait('.import-view-switch button:not(:disabled)',30000);
  assert.equal(await evaluate('window.__SHIYE_UI_CLOUD__.state.jobRequests.length'),jobsBeforePost,
    'changing postprocess switches must reuse the cached SAM result');

  await click('[data-act="preview-crop"]','.import-secondary-tools');
  assert.ok(await evaluate(`document.querySelector('.photo-preparation-content h3')?.textContent.includes('校正结果')`));
  await click('[data-act="apply-paper-preview"]','.import-primary-tools');
  assert.equal(await evaluate('window.__SHIYE_UI_CLOUD__.state.jobRequests.length'),jobsBeforePost,
    'previewing an already applied correction must not run SAM');
  await evaluate('window.confirm=()=>true');
  await click('[data-act="preview-crop"]','.import-secondary-tools');
  await click('[data-act="readjust-paper"]','.paper-handle');
  const corner=await evaluate(`(()=>{const r=document.querySelector('.paper-handle').getBoundingClientRect();
    return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
  await command('Input.dispatchMouseEvent',{type:'mousePressed',x:corner.x,y:corner.y,button:'left',clickCount:1});
  await command('Input.dispatchMouseEvent',{type:'mouseMoved',x:corner.x+9,y:corner.y+7,button:'left',buttons:1});
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',x:corner.x+9,y:corner.y+7,button:'left',clickCount:1});
  await click('[data-act="preview-crop"]','.import-secondary-tools');
  await click('[data-act="apply-paper-preview"]');
  for(let attempt=0;attempt<300;attempt++){
    if(await evaluate('window.__SHIYE_UI_CLOUD__.state.jobRequests.length')>jobsBeforePost)break;
    await sleep(100);
  }
  assert.equal(await evaluate('window.__SHIYE_UI_CLOUD__.state.jobRequests.length'),jobsBeforePost+1,
    'changing a paper corner must apply a new correction and segmentation');
  await wait('.import-view-switch button:not(:disabled)',30000);
  await click('[data-act="rotate-photo"]');
  for(let attempt=0;attempt<300;attempt++){
    if(await evaluate('window.__SHIYE_UI_CLOUD__.state.jobRequests.length')>jobsBeforePost+1)break;
    await sleep(100);
  }
  await wait('.import-view-switch button:not(:disabled)',30000);
  assert.equal(await evaluate('window.__SHIYE_UI_CLOUD__.state.jobRequests.length'),jobsBeforePost+2,
    'rotation must invalidate the old corrected page and request fresh segmentation');
  assert.equal(await evaluate(`document.querySelector('#paper-orientation').value`),'portrait');
  const rotatedInput=await evaluate(`(async()=>{const requests=window.__SHIYE_UI_CLOUD__.state.jobRequests;
    const blob=window.__SHIYE_UI_CLOUD__.state.objects.get(requests.at(-1).p_input_path);
    const image=await createImageBitmap(blob);const result=[image.width,image.height];image.close();return result;})()`);
  assert.ok(rotatedInput[1]>rotatedInput[0],`the rotated A4 image should be portrait: ${rotatedInput}`);
  await evaluate(`(()=>{const select=document.querySelector('#paper-orientation');select.value='landscape';
    select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await wait('.paper-handle');
  assert.equal(await evaluate(`document.querySelector('.photo-preparation-content h3')?.textContent`),'调整页面边框');
  await evaluate(`(()=>{const select=document.querySelector('#paper-orientation');select.value='portrait';
    select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await click('[data-act="preview-crop"]','.import-secondary-tools');
  await click('[data-act="apply-paper-preview"]','.import-primary-tools');
  assert.equal(await evaluate('window.__SHIYE_UI_CLOUD__.state.jobRequests.length'),jobsBeforePost+2,
    'restoring the applied paper orientation should reuse the existing segmentation');
  await click('[data-act="manual-import-box"]','.multi-box-editor');
  await evaluate(`document.querySelector('.multi-box-editor').scrollIntoView({block:'center'})`);
  const blank=await evaluate(`(()=>{const r=document.querySelector('.multi-box-editor').getBoundingClientRect();
    return {x:r.left+r.width*.7,y:r.top+r.height*.55,w:r.width*.1,h:r.height*.1};})()`);
  await command('Input.dispatchMouseEvent',{type:'mousePressed',x:blank.x,y:blank.y,button:'left',clickCount:1});
  await command('Input.dispatchMouseEvent',{type:'mouseMoved',x:blank.x+blank.w,y:blank.y+blank.h,button:'left',buttons:1});
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',x:blank.x+blank.w,y:blank.y+blank.h,button:'left',clickCount:1});
  await click('.import-photo-tools:not(.import-primary-tools) button:last-child');
  for(let attempt=0;attempt<300;attempt++){
    if(await evaluate('window.__SHIYE_UI_CLOUD__.state.jobRequests.length')>jobsBeforePost+2)break;
    await sleep(100);
  }
  assert.equal(await evaluate('window.__SHIYE_UI_CLOUD__.state.jobRequests.length'),jobsBeforePost+3,
    'a newly drawn box must submit one targeted segmentation');
  await wait('.import-view-switch button:not(:disabled)',30000);

  const nextOpenAt=performance.now();
  await click('[data-act="import-confirm-photo"]','.queue-item.active');
  const nextDeadline=Date.now()+30000;
  while(Date.now()<nextDeadline){
    const visible=await evaluate(`(()=>({active:document.querySelector('.queue-item.active')?.textContent||'',
      count:document.querySelectorAll('.import-candidate-tile').length}))()`);
    if(visible.active.includes('照片 2')&&visible.count===3)break;
    await sleep(50);
  }
  assert.equal(await evaluate(`document.querySelectorAll('.import-candidate-tile').length`),3);
  const nextOpenMs=Math.round(performance.now()-nextOpenAt);
  assert.ok(nextOpenMs<4000,`a prefetched photo should open with its review thumbnails ready (${nextOpenMs} ms)`);
  await click('[data-act="import-confirm-photo"]','.review-candidates');
  await evaluate('window.__blobFrames=[]');
  const saveStart=performance.now();
  await click('[data-act="confirm-import"]','.import-done');
  const saveMs=Math.round(performance.now()-saveStart);
  const maxExport=await evaluate(`Math.max(...window.__blobFrames.map(frame=>Math.max(...frame)))`);
  assert.ok(maxExport>1024,'saving must re-extract selected materials from the high-resolution source');
  assert.deepEqual(b.errors,[]);
  console.log(JSON.stringify({jobs:initial.jobs,inputBytes:initial.inputs.map(item=>item.size),
    highResEdge:maxExport,recognitionMs,nextOpenMs,saveMs}));
}finally{await b.close();}
