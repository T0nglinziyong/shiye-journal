// Supply a private JPEG through SHIYE_REAL_PHOTO; no sample bytes enter Git.
import {readFile,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {browserHarness} from './browser-harness.mjs';
const path=process.env.SHIYE_REAL_PHOTO;
if(!path)throw Error('Set SHIYE_REAL_PHOTO');
const fixture=await build({entryPoints:['tests/fixtures/ui-cloudbase-harness.mjs'],bundle:true,
  platform:'browser',format:'iife',globalName:'ShiyeUiFixture',write:false});
const sampleResult=process.env.SHIYE_REAL_RESULT?JSON.parse(await readFile(process.env.SHIYE_REAL_RESULT,'utf8')):null;
const injection=fixture.outputFiles[0].text+'\nShiyeUiFixture.installUiCloudBase(window);'+
  (sampleResult?'\nwindow.__SHIYE_UI_CLOUD__.state.samResult='+JSON.stringify(sampleResult)+';':'');
const b=await browserHarness('shiye-real-input',process.env.SHIYE_TEST_URL||'http://127.0.0.1:5176/',
  async({command})=>command('Page.addScriptToEvaluateOnNewDocument',{source:injection}));
try{
  await b.wait('.series-grid');
  await b.evaluate(`localStorage.setItem('shiye-ui-preferences-v1',JSON.stringify({
    recognitionDefaultsVersion:4,recognition:'fastsam-sam2-small',candidateDiscovery:'unified',paperSize:'a4',orientation:'landscape',
    balanceLight:false,recognitionDenoise:false,recognitionLocalContrast:false,
    samPointsPerSide:24,samCropNLayers:1,samGranularity:'balanced'}))`);
  await b.command('Page.reload');await b.wait('.series-grid');
  await b.click('.swift-tabs button:nth-child(2)','.asset-grid');
  await b.click('[data-act="import"]','.import-nav');
  const photo=(await readFile(path)).toString('base64');
  await b.evaluate(`(()=>{const bytes=Uint8Array.from(atob(${JSON.stringify(photo)}),c=>c.charCodeAt(0));
    const file=new File([bytes],'sample.jpg',{type:'image/jpeg'});const dt=new DataTransfer();dt.items.add(file);
    const input=document.querySelector('#file-input');input.files=dt.files;input.dispatchEvent(new Event('change'));})()`);
  await b.wait('.import-view-switch button:not(:disabled)',60000);
  for(let attempt=0;attempt<300;attempt++){
    if(await b.evaluate(`document.querySelector('.import-inspect')?.getAttribute('aria-busy')==='false'`))break;
    await b.sleep(100);
  }
  const result=await b.evaluate(`(async()=>{const state=window.__SHIYE_UI_CLOUD__.state;
    const request=state.jobRequests.at(-1),blob=state.objects.get(request.p_input_path);
    const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';
    for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
    return {input:btoa(binary),size:blob.size,request,display:document.querySelector('.photo-preparation-content h3')?.textContent,
      candidates:document.querySelectorAll('.import-candidate-tile').length};})()`);
  const out=process.env.SHIYE_INPUT_OUTPUT||'/tmp/shiye-real-sam-input.png';
  await writeFile(out,Buffer.from(result.input,'base64'));
  console.log(JSON.stringify({out,size:result.size,candidates:result.candidates,display:result.display,request:result.request}));
  if(process.env.SHIYE_TEST_POSTPROCESS){
    const baseline=await b.evaluate(`({count:document.querySelectorAll('.import-candidate-tile').length,
      source:document.querySelector('#crop-preview img')?.src,jobs:window.__SHIYE_UI_CLOUD__.state.jobRequests.length})`);
    for(const selector of ['#import-shape-regularization','#import-apertures','#import-merge-carrier']){
      await b.click(selector);
      for(let attempt=0;attempt<300;attempt++){
        if(await b.evaluate(`document.querySelector('.import-inspect')?.getAttribute('aria-busy')==='false'`))break;
        await b.sleep(100);
      }
      const current=await b.evaluate(`({count:document.querySelectorAll('.import-candidate-tile').length,
        source:document.querySelector('#crop-preview img')?.src,jobs:window.__SHIYE_UI_CLOUD__.state.jobRequests.length,
        overlay:!!document.querySelector('.sam-region-overlay')})`);
      if(current.count!==baseline.count||current.source!==baseline.source||current.jobs!==baseline.jobs||!current.overlay)
        throw Error('Postprocess changed preview or reran model: '+selector+' '+JSON.stringify(current));
    }
    await b.click('.import-view-switch button:nth-child(2)');
    if(!await b.evaluate(`document.querySelector('.import-view-switch button:nth-child(2)')?.getAttribute('aria-pressed')==='true'`))
      throw Error('Cannot switch to colored regions after postprocessing');
    console.log('postprocess-preview',baseline);
  }
  if(process.env.SHIYE_TEST_ROTATE){
    await b.click('[data-act="rotate-photo"]');
    for(let attempt=0;attempt<300;attempt++){
      if(await b.evaluate(`window.__SHIYE_UI_CLOUD__.state.jobRequests.length>=2&&document.querySelector('.import-inspect')?.getAttribute('aria-busy')==='false'`))break;
      await b.sleep(100);
    }
    await b.click('[data-act="preview-crop"]','.paper-handle');await b.click('[data-act="preview-crop"]','[data-act="apply-paper-preview"]');
    const rotated=await b.evaluate(`({jobs:window.__SHIYE_UI_CLOUD__.state.jobRequests.length,
      loaded:document.querySelector('#crop-preview img')?.naturalWidth>0,
      preview:document.querySelector('.photo-preparation-content h3')?.textContent})`);
    if(rotated.jobs!==2||!rotated.loaded||!rotated.preview.includes('校正结果'))throw Error('Rotate/preview regression: '+JSON.stringify(rotated));
    console.log('rotate-preview',rotated);
  }
  if(process.env.SHIYE_CAPTURE){const shot=await b.command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    await writeFile(process.env.SHIYE_CAPTURE,Buffer.from(shot.data,'base64'));}
  if(b.errors.length)throw Error(JSON.stringify(b.errors));
}catch(error){console.error('diagnostic',await b.evaluate(`({text:document.body.innerText.slice(0,1200),
  busy:document.querySelector('.import-inspect')?.getAttribute('aria-busy'),toast:document.querySelector('#toast')?.textContent,
  jobs:window.__SHIYE_UI_CLOUD__?.state?.jobRequests?.length})`),b.errors,b.consoleMessages);throw error;
}finally{await b.close();}
