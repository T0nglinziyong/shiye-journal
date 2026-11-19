import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {browserHarness} from './browser-harness.mjs';

const fixture=await build({entryPoints:['tests/fixtures/ui-cloudbase-harness.mjs'],bundle:true,
  platform:'browser',format:'iife',globalName:'ShiyeUiFixture',write:false});
const b=await browserHarness('shiye-region-edit',process.env.SHIYE_TEST_URL||'http://127.0.0.1:4173/',
  async({command})=>command('Page.addScriptToEvaluateOnNewDocument',{
    source:fixture.outputFiles[0].text+'\nShiyeUiFixture.installUiCloudBase(window);'}));
const {evaluate,wait,click,command,sleep}=b;
const until=async(check,message)=>{
  for(let attempt=0;attempt<300;attempt++){
    if(await evaluate(check))return;
    await sleep(100);
  }
  throw Error(message);
};
try{
  await wait('.series-grid');
  await evaluate(`localStorage.setItem('shiye-ui-preferences-v1',JSON.stringify({
    recognitionDefaultsVersion:4,recognition:'fastsam-sam2-small',paperSize:'a4',orientation:'landscape',
    samPointsPerSide:24,samCropNLayers:1,samGranularity:'balanced'}))`);
  await command('Page.reload');await wait('.series-grid');
  await evaluate('window.__SHIYE_UI_CLOUD__.state.samExtraCandidate=true;window.__SHIYE_UI_CLOUD__.state.samSubregions=true');
  await click('.swift-tabs button:nth-child(2)','.asset-grid');
  await click('[data-act="import"]','.import-nav');
  await evaluate(`(async()=>{
    const canvas=document.createElement('canvas');canvas.width=1800;canvas.height=1300;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#302724';ctx.fillRect(0,0,1800,1300);
    ctx.fillStyle='#f9f8f1';ctx.fillRect(110,90,1580,1120);
    ctx.fillStyle='#26201e';ctx.fillRect(350,260,450,700);
    ctx.fillStyle='#c5493d';ctx.fillRect(420,330,130,150);
    ctx.fillStyle='#598ab0';ctx.fillRect(620,500,120,180);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    const files=new DataTransfer();files.items.add(new File([blob],'photo.png',{type:'image/png'}));
    const input=document.querySelector('#file-input');input.files=files.files;input.dispatchEvent(new Event('change'));
  })()`);
  await until(`document.querySelectorAll('.import-candidate-tile').length===3&&
    document.querySelector('.import-inspect')?.getAttribute('aria-busy')==='false'`,'initial segmentation missing');
  const jobs=await evaluate('window.__SHIYE_UI_CLOUD__.state.jobRequests.length');
  await click('.import-primary-tools button:nth-child(3)','.import-region-tools');
  await click('.candidate-choice:nth-child(1) .import-candidate-tile');
  await click('.candidate-choice:nth-child(2) .import-candidate-tile');
  assert.ok(await evaluate(`document.querySelector('.import-region-tools button:nth-child(2)')?.classList.contains('primary')`));
  await click('.import-region-tools button:nth-child(2)','button');
  assert.equal(await evaluate(`document.querySelectorAll('.import-candidate-tile').length`),3);
  assert.ok(await evaluate(`document.querySelector('.import-action-hint')?.textContent.includes('预览')`));
  await click('.import-primary-tools button:nth-child(1)','.import-region-tools');
  assert.equal(await evaluate(`document.querySelectorAll('.import-candidate-tile').length`),3);
  await click('.import-region-tools button:nth-child(2)','button');
  await click('.import-primary-tools button:nth-child(2)');
  await until(`document.querySelectorAll('.import-candidate-tile').length===2&&
    document.querySelector('.import-inspect')?.getAttribute('aria-busy')==='false'`,'merge not confirmed');
  assert.ok(await evaluate(`!!document.querySelector('.import-region-tools')`),'edit mode must remain open');
  assert.equal(await evaluate('window.__SHIYE_UI_CLOUD__.state.jobRequests.length'),jobs);
  await click('.import-region-tools button:nth-child(3)','button');
  assert.equal(await evaluate(`document.querySelectorAll('.import-candidate-tile').length`),2);
  await click('.import-primary-tools button:nth-child(2)');
  await until(`document.querySelectorAll('.import-candidate-tile').length===3&&
    document.querySelector('.import-inspect')?.getAttribute('aria-busy')==='false'`,'split not confirmed');
  assert.ok(await evaluate(`!!document.querySelector('.import-region-tools')`));
  assert.equal(await evaluate('window.__SHIYE_UI_CLOUD__.state.jobRequests.length'),jobs);
  await click('.import-region-tools button:nth-child(4)','button');
  assert.ok(await evaluate(`document.querySelector('.import-action-hint')?.textContent.includes('点选或画框')`));
  const clickSavedChild=()=>evaluate(`(()=>{const canvas=document.querySelector('.sam-region-overlay');
    const rect=canvas.getBoundingClientRect();canvas.dispatchEvent(new MouseEvent('click',{
      bubbles:true,clientX:rect.left+rect.width*.21,clientY:rect.top+rect.height*.27}));})()`);
  await clickSavedChild();
  assert.ok(await evaluate(`document.querySelector('.import-action-hint')?.textContent.includes('未展示')`));
  assert.equal(await evaluate(`document.querySelectorAll('.import-candidate-tile').length`),3);
  await click('.import-primary-tools button:nth-child(1)','.import-region-tools');
  await click('.import-region-tools button:nth-child(4)','button');
  await clickSavedChild();
  await click('.import-primary-tools button:nth-child(2)');
  await until(`document.querySelectorAll('.import-candidate-tile').length===4&&
    document.querySelector('.import-inspect')?.getAttribute('aria-busy')==='false'`,'cached region not added');
  assert.ok(await evaluate(`!!document.querySelector('.import-region-tools')`));
  assert.equal(await evaluate('window.__SHIYE_UI_CLOUD__.state.jobRequests.length'),jobs);
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  assert.ok(await evaluate(`(()=>{const tools=document.querySelector('.import-region-tools');
    const bounds=tools.getBoundingClientRect();return [...tools.children].every(button=>{
      const rect=button.getBoundingClientRect();return rect.left>=bounds.left&&rect.right<=bounds.right+1;
    })&&getComputedStyle(tools).gridTemplateColumns.split(' ').length===2;})()`));
  await command('Emulation.clearDeviceMetricsOverride');
  await click('.import-region-tools button:nth-child(1)');
  await click('[data-act="preview-crop"]','.paper-handle');
  await evaluate(`document.querySelector('.paper-corner-overlay').scrollIntoView({block:'center'})`);
  const original=await evaluate(`JSON.stringify([...document.querySelectorAll('.paper-handle')].map(node=>node.style.cssText))`);
  await evaluate(`(()=>{const handle=document.querySelector('.paper-handle');const rect=handle.getBoundingClientRect();
    const x=rect.left+rect.width/2,y=rect.top+rect.height/2;handle.setPointerCapture=()=>{};
    for(const [type,dx,dy] of [['pointerdown',0,0],['pointermove',12,8],['pointerup',12,8]])
      handle.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:1,clientX:x+dx,clientY:y+dy}));})()`);
  assert.notEqual(await evaluate(`JSON.stringify([...document.querySelectorAll('.paper-handle')].map(node=>node.style.cssText))`),original);
  await click('[data-act="preview-crop"]','[data-act="cancel-paper-adjust"]');
  await click('[data-act="cancel-paper-adjust"]','[data-act="preview-crop"]');
  assert.equal(await evaluate(`document.querySelectorAll('.paper-handle').length`),0);
  assert.equal(await evaluate('window.__SHIYE_UI_CLOUD__.state.jobRequests.length'),jobs);
  await click('[data-act="preview-crop"]','.paper-handle');
  assert.equal(await evaluate(`JSON.stringify([...document.querySelectorAll('.paper-handle')].map(node=>node.style.cssText))`),original);
  await click('[data-act="cancel-paper-adjust"]');
  console.log('Region edit preview, confirmation, split, add mode and correction cancel passed');
}finally{await b.close();}
