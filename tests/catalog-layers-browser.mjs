// Isolated Chromium layout regression: no cloud account or private data used.
import assert from 'node:assert/strict';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {browserHarness} from './browser-harness.mjs';

const output=await mkdtemp(join(tmpdir(),'shiye-catalog-layers-'));
const b=await browserHarness('shiye-catalog-layers',process.env.SHIYE_TEST_URL||'http://localhost:4173');
try{
  await b.wait('.series-grid');
  for(const [width,height] of [[390,844],[768,1024],[1024,768],[1440,900]]){
    await b.command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<700});
    await b.click('[data-route="works"]','.works-grid .card');
    const result=await b.evaluate(`(()=>{
      const topbar=document.querySelector('.topbar'),toolbar=document.querySelector('.catalog-toolbar'),card=document.querySelector('.works-grid .card');
      const topZ=Number(getComputedStyle(topbar).zIndex),toolbarZ=Number(getComputedStyle(toolbar).zIndex);
      const oldMargin=card.style.marginTop,oldPosition=card.style.position;
      card.style.marginTop='-80px';card.style.position='relative';
      const marker=document.createElement('div');marker.dataset.layerProbe='true';marker.style.cssText='position:absolute;inset:0;z-index:2140000000;pointer-events:auto;background:#f00';card.append(marker);
      const cr=card.getBoundingClientRect(),tr=toolbar.getBoundingClientRect(),x=cr.left+Math.min(30,cr.width/2),y=Math.max(tr.top+18,cr.top+18);
      const coverHit=document.elementFromPoint(x,y)?.closest('.catalog-toolbar')===toolbar;
      marker.remove();
      card.style.marginTop=oldMargin;card.style.position=oldPosition;
      const host=document.createElement('div');host.className='cloud-account';host.innerHTML='<button class="btn mini">账号</button><div class="cloud-account-menu"><button class="btn">修改密码</button></div>';
      document.querySelector('.top-actions').append(host);
      const button=host.querySelector('.cloud-account-menu button'),r=button.getBoundingClientRect();
      const menuHit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)===button;
      host.remove();
      return {topZ,toolbarZ,isolated:getComputedStyle(card).isolation,overlaps:cr.top<tr.bottom&&cr.bottom>tr.top,coverHit,menuHit};
    })()`);
    assert.ok(result.topZ>result.toolbarZ,JSON.stringify({width,result}));
    assert.equal(result.isolated,'isolate',JSON.stringify({width,result}));
    assert.ok(result.overlaps&&result.coverHit&&result.menuHit,JSON.stringify({width,result}));
    const image=await b.command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    await writeFile(join(output,`${width}x${height}.png`),Buffer.from(image.data,'base64'));
  }
  assert.deepEqual(b.errors,[]);
  console.log('Catalog layering passed in 4 Chromium viewports:',output);
}finally{await b.close();}
