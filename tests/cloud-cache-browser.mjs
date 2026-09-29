import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {browserHarness} from './browser-harness.mjs';
const directory='/tmp/shiye-cache-browser';await mkdir(directory,{recursive:true});
const b=await browserHarness('shiye-cache-browser',process.env.SHIYE_TEST_URL||'http://127.0.0.1:5180');
try{
  await b.wait('.series-grid');
  for(const [width,height] of [[390,844],[768,1024],[1024,768],[1440,900]]){
    await b.command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<700});
    const result=await b.evaluate(`(async()=>{
      const {mountPrivateImages,imagePlaceholder}=await import('/src/lazy-private-images.js');
      document.querySelector('#app').hidden=true;document.querySelector('.cache-test-gallery')?.remove();const root=document.createElement('div');root.className='cache-test-gallery';root.style.cssText='display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px';document.body.append(root);
      const canvas=document.createElement('canvas');canvas.width=800;canvas.height=1200;const ctx=canvas.getContext('2d');ctx.fillStyle='#557f9b';ctx.fillRect(0,0,800,1200);const original=await new Promise(r=>canvas.toBlob(r));const small=document.createElement('canvas');small.width=240;small.height=360;small.getContext('2d').drawImage(canvas,0,0,240,360);const thumbnail=await new Promise(r=>small.toBlob(r));
      const calls={preview:0,original:0},urls=new Map(),loader=mountPrivateImages({root,urls,db:{previewBlob:async()=>{calls.preview++;return thumbnail;},get:async()=>{calls.original++;return {data:original};}}});
      for(let i=0;i<60;i++){const img=document.createElement('img');img.src=imagePlaceholder('synthetic-cache-'+i);img.alt='缓存测试 '+i;img.style.cssText='width:100%;height:200px;object-fit:contain';root.append(img);}
      await new Promise(r=>setTimeout(r,400));const first=calls.preview;if(first<=0||first>=60)throw Error('Visible-only loading failed: '+first);if(calls.original)throw Error('Grid loaded originals');
      root.querySelectorAll('img')[20].scrollIntoView({block:'start'});await new Promise(r=>setTimeout(r,700));if(calls.preview<=first)throw Error('Scroll did not load more previews: '+JSON.stringify({first,calls,top:root.querySelectorAll('img')[20].getBoundingClientRect().top}));
      const full=await loader.load('synthetic-cache-0',true),im=new Image();im.src=full;await im.decode();if(im.naturalWidth!==800||calls.original!==1)throw Error('Full original missing');
      const {privateCache}=await import('/src/private-cache.js');await privateCache.put('browser-test-account','image:hash',original);await privateCache.put('browser-test-other','records',{id:'other'});const cached=await privateCache.get('browser-test-account','image:hash');if(cached.size!==original.size)throw Error('Persistent Blob mismatch');await privateCache.clear('browser-test-account');if(await privateCache.get('browser-test-account','image:hash'))throw Error('Logout did not clear cache');if(!(await privateCache.get('browser-test-other','records')))throw Error('Another account erased');await privateCache.clear('browser-test-other');
      scrollTo(0,0);globalThis.__cacheTestLoader=loader;return {first,afterScroll:calls.preview,original:calls.original};
    })()`);
    assert.ok(result.first<60);assert.equal(result.original,1);assert.ok(await b.evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
    const shot=await b.command('Page.captureScreenshot',{format:'png'});await writeFile(`${directory}/${width}x${height}.png`,Buffer.from(shot.data,'base64'));
    await b.evaluate('__cacheTestLoader.dispose()');
  }
  assert.deepEqual(b.errors,[]);console.log('PASS: visible previews, scroll loading, full original, persistent Blob and account-isolated clearing; four Chromium viewports');
}finally{await b.close();}
