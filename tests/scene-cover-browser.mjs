import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';

const browser=await browserHarness('shiye-scene-cover',process.env.SHIYE_TEST_URL||'http://127.0.0.1:5173');
const {command,evaluate,wait,click,sleep}=browser;
try{
  await wait('.series-grid');
  await evaluate(`(async()=>{
    const request=indexedDB.open('shiye-pwa-full-v1');
    const db=await new Promise(resolve=>request.onsuccess=()=>resolve(request.result));
    const now=new Date().toISOString();
    const asset={id:'cover-test-asset',title:'封面素材',kind:'paper',blobId:'cover-test-image',
      staticPath:'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#75a887"/></svg>'),
      physicalWidthMM:25,physicalHeightMM:25,supply:{quantity:1},createdAt:now};
    const draft={id:'cover-test-draft',sceneVersion:2,canvas:{width:700,height:1000},
      paperColor:'#fffaf1',layers:[
        {id:'cover-test-material',type:'material',assetID:asset.id,x:350,y:310,width:200,height:200,
          zIndex:1,opacity:1},
        {id:'cover-test-shape',type:'shape',kind:'ellipse',x:350,y:550,width:140,height:140,
          fill:'#d1e3b0',stroke:'#315c40',lineWidth:2,zIndex:2,opacity:1},
        {id:'cover-test-text',type:'text',content:'Scene v2',x:350,y:700,width:280,height:80,
          fontSize:42,color:'#315c40',style:'sans',zIndex:3,opacity:1},
        {id:'cover-test-ink',type:'ink',points:[{x:100,y:820},{x:350,y:850},{x:600,y:820}],
          width:8,color:'#315c40',zIndex:4,opacity:1}
      ]};
    const project={id:'cover-test-project',title:'Scene v2 封面验收',drafts:[draft],
      activeDraftID:draft.id,isDraft:false,isUsed:false,updatedAt:now,createdAt:now};
    await new Promise(resolve=>{const tx=db.transaction(['assets','projects'],'readwrite');
      tx.objectStore('assets').put(asset);tx.objectStore('projects').put(project);tx.oncomplete=resolve;});
    db.close();
  })()`);
  await command('Page.reload');await wait('.series-grid');
  await click('[data-route="works"]','[data-id="cover-test-project"]');
  const card='[data-id="cover-test-project"]';
  for(const [width,height] of [[390,844],[768,1024],[1024,768],[1440,900]]){
    await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<700});
    await sleep(60);
    assert.equal(await evaluate(`(()=>{const card=document.querySelector('${card}');
      const image=card.querySelector('.work-material img');
      return !!card.querySelector('.work-shape img,.work-shape svg')&&
        card.querySelector('.work-text')?.textContent==='Scene v2'&&
        !!card.querySelector('.scene-ink-object path')&&image?.complete&&image.naturalWidth>0&&
        document.documentElement.scrollWidth<=innerWidth+1})()`),true,
    `Scene v2 cover incomplete at ${width}×${height}`);
  }
  await evaluate(`(()=>{const card=document.querySelector('${card}'),r=card.getBoundingClientRect();
    card.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:r.left+r.width/2,
      clientY:r.top+r.height/2,button:2}));})()`);
  await wait('#project-meta-preview');
  await click('#project-meta-preview','.project-preview-page');
  assert.equal(await evaluate(`!!document.querySelector('.project-preview-cover .work-text')&&
    !!document.querySelector('.project-preview-cover .scene-ink-object path')`),true);
  await click('[data-act="preview-back"]',card);
  await click(card,'#canvas-page');
  assert.deepEqual(browser.errors,[]);
  console.log('Scene v2 React covers and project navigation verified in four Chromium viewports');
}finally{await browser.close();}
