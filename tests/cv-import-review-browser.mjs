// Browser regression for the shared CV/model review presentation.
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {browserHarness} from './browser-harness.mjs';

const fixture=await build({entryPoints:['tests/fixtures/ui-cloudbase-harness.mjs'],bundle:true,
  platform:'browser',format:'iife',globalName:'ShiyeUiFixture',write:false});
const b=await browserHarness('shiye-cv-review',process.env.SHIYE_TEST_URL||'http://127.0.0.1:5173/',
  async({command})=>command('Page.addScriptToEvaluateOnNewDocument',
    {source:fixture.outputFiles[0].text+'\nShiyeUiFixture.installUiCloudBase(window);'}));
const {evaluate,click,wait,sleep}=b;
const idle=async()=>{for(let i=0;i<900;i++){
  if(await evaluate(`document.querySelector('.import-inspect')?.getAttribute('aria-busy')==='false'`))return;
  await sleep(100);
}throw Error('CV import did not finish');};
try{
  await wait('.series-grid');
  await evaluate(`localStorage.setItem('shiye-ui-preferences-v1',JSON.stringify({
    recognitionDefaultsVersion:4,recognition:'physical',candidateDiscovery:'legacy',paperSize:'a4',
    orientation:'landscape',recognitionPixels:900}))`);
  await b.command('Page.reload');await wait('.series-grid');
  await click('.swift-tabs button:nth-child(2)','.asset-grid');await click('[data-act="import"]','.import-nav');
  await evaluate(`(async()=>{const c=document.createElement('canvas');c.width=900;c.height=650;
    const x=c.getContext('2d');x.fillStyle='#392d27';x.fillRect(0,0,900,650);
    x.fillStyle='#fafaf5';x.fillRect(60,45,780,555);
    for(const [left,top,color] of [[150,130,'#a34543'],[380,150,'#305b78'],[540,350,'#bb9d33']]){
      x.fillStyle=color;x.fillRect(left,top,155,135);
    }
    const blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));
    const dt=new DataTransfer();dt.items.add(new File([blob],'cv-page.png',{type:'image/png'}));
    const input=document.querySelector('#file-input');input.files=dt.files;input.dispatchEvent(new Event('change'));
  })()`);
  await wait('.import-candidate-tile',90000);await idle();
  const baseline=await evaluate(`({count:document.querySelectorAll('.import-candidate-tile').length,
    source:document.querySelector('#crop-preview img')?.src,overlay:!!document.querySelector('.sam-region-overlay')})`);
  assert.ok(baseline.count>0&&baseline.overlay&&baseline.source.startsWith('blob:'));
  const stable=await evaluate(`(()=>{const before=[...document.querySelectorAll('.import-candidate-tile')].map(node=>node.getAttribute('aria-pressed'));
    document.querySelector('.sam-region-overlay').click();
    return {before,after:[...document.querySelectorAll('.import-candidate-tile')].map(node=>node.getAttribute('aria-pressed')),
      interactive:document.querySelector('.sam-region-overlay').classList.contains('interactive'),
      status:document.querySelector('.import-processing')?.textContent};})()`);
  assert.deepEqual(stable.before,stable.after);
  assert.equal(stable.interactive,false);
  assert.match(stable.status,/已完成分割/);
  for(const [width,height] of [[390,844],[768,1024],[1024,768],[1440,900]]){
    await b.command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<700});
    const layout=await evaluate(`({overflow:document.documentElement.scrollWidth-innerWidth,
      buttons:document.querySelectorAll('.import-primary-tools button').length,
      overlay:!!document.querySelector('.sam-region-overlay')})`);
    assert.ok(layout.overflow<=1&&layout.buttons===3&&layout.overlay,JSON.stringify({width,height,layout}));
  }
  await b.command('Emulation.clearDeviceMetricsOverride');
  for(const selector of ['#import-shape-regularization','#import-apertures','#import-merge-carrier']){
    await click(selector);await idle();
    const current=await evaluate(`({source:document.querySelector('#crop-preview img')?.src,
      overlay:!!document.querySelector('.sam-region-overlay'),enabled:!document.querySelector('.import-view-switch button:nth-child(2)')?.disabled})`);
    assert.equal(current.source,baseline.source,'CV preview must remain on rectified page');
    assert.ok(current.overlay&&current.enabled,'CV overlay and view switch remain available');
  }
  await click('.import-view-switch button:nth-child(2)');
  assert.equal(await evaluate(`document.querySelector('.import-view-switch button:nth-child(2)').getAttribute('aria-pressed')`),'true');
  const beforeMerge=await evaluate(`document.querySelectorAll('.import-candidate-tile').length`);
  await click('.import-primary-tools button:nth-child(3)');
  assert.equal(await evaluate(`document.querySelectorAll('.import-primary-tools button').length`),3);
  await click('.candidate-choice:nth-child(1) .import-candidate-tile');
  await click('.candidate-choice:nth-child(2) .import-candidate-tile');
  await click('.import-primary-tools button.primary');
  for(let i=0;i<300;i++){
    if(await evaluate(`document.querySelectorAll('.import-candidate-tile').length===${beforeMerge-1}`))break;
    await sleep(100);
  }
  assert.equal(await evaluate(`document.querySelectorAll('.import-candidate-tile').length`),beforeMerge-1);
  await click('[data-act="preview-crop"]','.paper-handle');await click('[data-act="preview-crop"]','[data-act="apply-paper-preview"]');
  assert.equal(await evaluate(`document.querySelectorAll('.import-primary-tools button').length`),2);
  await click('[data-act="apply-paper-preview"]');
  await click('[data-act="manual-import-box"]','.multi-box-editor');
  assert.equal(await evaluate(`!!document.querySelector('.multi-box-editor')`),true);
  await evaluate(`document.querySelector('.import-photo-tools button')?.click()`);
  await evaluate(`(async()=>{globalThis.__importPage=document.querySelector('.import-inspect');
    globalThis.__importQueue=document.querySelector('.queue-strip');
    const other=document.createElement('canvas');other.width=900;other.height=650;
    const y=other.getContext('2d');y.fillStyle='#392d27';y.fillRect(0,0,900,650);
    y.fillStyle='#fafaf5';y.fillRect(60,45,780,555);
    y.fillStyle='#47724f';y.fillRect(230,170,260,210);
    const blob=await new Promise(resolve=>other.toBlob(resolve,'image/png'));
    const dt=new DataTransfer();dt.items.add(new File([blob],'cv-page-2.png',{type:'image/png'}));
    const input=document.querySelector('#file-input');input.files=dt.files;input.dispatchEvent(new Event('change'));
  })()`);
  await wait('[data-act="import-switch"][data-id="1"]');
  assert.ok(await evaluate(`document.querySelector('.import-inspect')===globalThis.__importPage&&
    document.querySelector('.queue-strip')===globalThis.__importQueue`));
  await click('[data-act="import-switch"][data-id="0"]');await idle();
  assert.ok(await evaluate(`document.querySelector('.import-inspect')===globalThis.__importPage&&
    document.querySelector('#crop-preview img')?.src===${JSON.stringify(baseline.source)}`));
  console.log(JSON.stringify({cvCandidates:baseline.count,sharedPreview:true,postprocessStable:true}));
  assert.deepEqual(b.errors,[]);
}finally{await b.close();}
