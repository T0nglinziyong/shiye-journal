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
  await sleep(1000);
  if(!(await evaluate('!!document.querySelector(\'.import-inspect[aria-busy="false"]\')'))){
    const diagnostic=await evaluate('(async()=>{let vision=[];try{vision=(await import("/src/vision-runtime.js")).visionStatus();}catch{}return {vision,processing:document.querySelector(".import-processing")?.textContent||"",route:document.querySelector("#view")?.className||"",busy:document.querySelector(".import-inspect")?.getAttribute("aria-busy")};})()');
    console.log('Recognition diagnostic after 30s',JSON.stringify(diagnostic));
  }
  await wait('.import-inspect[aria-busy="false"]',300000);await wait('.import-candidate-tile');await click('[data-act=import-confirm-photo]','.review-candidates');await click('[data-act=confirm-import]','.import-done');
  for(const [w,h] of [[320,640],[360,740],[390,844],[430,932],[768,1024],[1024,768],[1440,900]]){
    await command('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:w<700});
    const metrics=await evaluate(`(()=>{
      const r=e=>e?.getBoundingClientRect(),inside=(child,parent)=>!child||!parent||
        child.left>=parent.left-1&&child.right<=parent.right+1;
      const doc=document.documentElement,nav=r(document.querySelector(".import-nav")),
        card=r(document.querySelector(".import-done-card")),
        title=r(document.querySelector(".import-done-card h1")),
        count=r(document.querySelector(".import-done-count")),
        message=r(document.querySelector(".import-done-message")),
        actions=r(document.querySelector(".import-done-actions")),
        buttons=[...document.querySelectorAll(".import-done-actions .btn")],
        buttonBoxes=buttons.map(r),
        progress=r(document.querySelector(".import-progress")),
        steps=[...document.querySelectorAll(".import-progress>span")].map(r),
        navBack=r(document.querySelector(".import-nav>.import-back")),
        navExit=r(document.querySelector(".import-nav>.import-cancel"));
      return {pageOverflow:doc.scrollWidth-innerWidth,cardInside:inside(card,{left:0,right:innerWidth}),
        textInside:[title,count,message,actions,...buttonBoxes].every(x=>inside(x,card)),
        buttonHeights:buttons.map(b=>b.getBoundingClientRect().height),
        font:buttons.map(b=>getComputedStyle(b).fontSize),
        buttonInside:buttonBoxes.every(x=>inside(x,{left:0,right:innerWidth})),
        navInside:inside(nav,{left:0,right:innerWidth}),
        navTitleAndExit:!!navBack&&!!navExit&&
          Math.abs(navBack.top-navExit.top)<8&&Math.abs(navBack.top-progress.top)<12&&
          navBack.right<=progress.left+1&&progress.right<=navExit.left+3,
        stepsInside:steps.every(x=>inside(x,nav))&&inside(progress,nav),
        statusHidden:!document.querySelector(".import-nav>.sync-indicator")||getComputedStyle(document.querySelector(".import-nav>.sync-indicator")).display==='none'};
    })()`);
    assert.ok(metrics.pageOverflow<=1,'saved screen horizontal overflow: '+JSON.stringify({w,metrics}));
    assert.ok(metrics.cardInside&&metrics.textInside&&metrics.buttonInside&&metrics.navInside,
      'saved screen clipped elements: '+JSON.stringify({w,metrics}));
    assert.ok(metrics.font.every(v=>parseFloat(v)>=13)&&metrics.buttonHeights.every(v=>v<=44),
      'saved screen button sizes: '+JSON.stringify({w,metrics}));
    if(w<700)assert.ok(metrics.stepsInside&&metrics.navTitleAndExit&&metrics.statusHidden,
      'mobile import nav clips title, steps, or status: '+JSON.stringify({w,metrics}));
    await capture('saved',w,h);
  }
  await click('[data-act=import-continue]','[data-act=select-file]');assert.equal(await evaluate('document.querySelectorAll(".import-candidate-tile").length'),0);
  await evaluate(`(async()=>{const db=await import('/src/store.js');const a=(await db.all('assets')).find(a=>a.title==='素材 1');if(!a)throw Error('Saved material missing');await db.transaction(['assets','trash'],tx=>{tx.objectStore('assets').delete(a.id);tx.objectStore('trash').put({id:'synthetic-trash',kind:'asset',item:a,date:new Date().toISOString()});});})()`);
  await command('Page.reload');await wait('.series-grid');await click('.swift-tabs button:nth-child(4)','.recently-deleted-grid');
  for(const [w,h] of [[390,844],[768,1024],[1024,768],[1440,900]]){
    await command('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:w<700});
    await wait('.recently-deleted-grid img[src^="blob:"]');
    const image=await evaluate('(async()=>{const im=document.querySelector(".recently-deleted-grid img");await im.decode();return {loaded:im.naturalWidth>0,height:im.parentElement.getBoundingClientRect().height,imageHeight:im.getBoundingClientRect().height};})()');assert.ok(image.loaded&&image.height>=90&&image.imageHeight>=75,JSON.stringify(image));await capture('deleted-cover',w,h);
  }
  assert.deepEqual(b.errors,[]);console.log('Import completion and recently deleted: 8 screenshots, full saved Blob cover, compact buttons and continue flow verified',dir);
}catch(error){console.log('Browser failure:',await evaluate('document.body.innerText.slice(-1800)'),b.errors);throw error;}finally{await b.close();}
