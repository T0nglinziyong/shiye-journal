import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';

const browser=await browserHarness('shiye-import-paper-layout',process.env.SHIYE_TEST_URL||'http://127.0.0.1:5173');
try{
  await browser.wait('body');
  await browser.evaluate(`(async()=>{
    for(const href of ['/src/styles.css','/src/overrides.css','/src/ui-consistency.css']){
      await new Promise((resolve,reject)=>{const link=document.createElement('link');link.rel='stylesheet';link.href=href;link.onload=resolve;link.onerror=reject;document.head.append(link);});
    }
  })()`);
  for(const width of [320,390,768]){
    await browser.command('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<700});
    const result=await browser.evaluate(`(()=>{
      const host=document.createElement('div');host.id='view';host.style.cssText='width:200px;margin:0;padding:0;position:fixed;top:0;left:0;z-index:99999';
      host.innerHTML='<section class="import-review"><div class="review-candidates"><div class="review-candidate review-background-card"><div class="review-thumbnail import-work-paper-preview grid has-columns" style="--review-paper:#faf1ea"><div class="review-paper-controls"><select><option>方格</option></select><button>双栏</button><input type="color" value="#faf1ea"></div></div></div></div></section>';
      document.body.append(host);
      const preview=host.querySelector('.import-work-paper-preview'),controls=host.querySelector('.review-paper-controls'),button=controls.querySelector('button');
      const p=preview.getBoundingClientRect(),c=controls.getBoundingClientRect(),b=button.getBoundingClientRect(),style=getComputedStyle(preview);
      const data={image:style.backgroundImage,color:style.backgroundColor,centerOffset:Math.abs((c.left+c.right)/2-(p.left+p.right)/2),buttonWidth:b.width,inside:c.left>=p.left-1&&c.right<=p.right+1};
      host.remove();return data;
    })()`);
    assert.match(result.image,/linear-gradient/,'grid lines must remain visible above the paper color');
    assert.equal(result.color,'rgb(250, 241, 234)');
    assert.ok(result.centerOffset<=1,`controls are off center at ${width}px: ${JSON.stringify(result)}`);
    assert.ok(result.inside&&result.buttonWidth>=55,`controls overflow at ${width}px: ${JSON.stringify(result)}`);
  }
  console.log('Import paper pattern and centered controls: 3 viewports passed');
}finally{await browser.close();}
