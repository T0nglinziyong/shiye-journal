import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';

const target=process.env.SHIYE_TEST_URL||'http://127.0.0.1:5192';
if(!['127.0.0.1','localhost'].includes(new URL(target).hostname))
  throw Error('导航测试只允许本机隔离站');
const browser=await browserHarness('shiye-navigation-history',target);
try{
  await browser.wait('.series-grid');
  await browser.click('[data-route="works"]','.works-grid');
  await browser.evaluate(`(()=>{
    const input=document.querySelector('#work-search');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'春天');
    input.dispatchEvent(new Event('input',{bubbles:true}));
  })()`);
  await browser.sleep(250);
  await browser.click('#top-settings');
  await browser.wait('[data-act="settings-back"]');
  await browser.command('Page.reload');
  await browser.wait('[data-act="settings-back"]');
  await browser.evaluate('history.back()');
  await browser.wait('#work-search');
  assert.equal(await browser.evaluate('document.querySelector("#work-search").value'),'春天');
  await browser.evaluate('history.back()');
  await browser.wait('.series-grid');
  await browser.evaluate('history.forward()');
  await browser.wait('#work-search');
  assert.equal(await browser.evaluate('document.querySelector("#work-search").value'),'春天');
  await browser.evaluate(`(async()=>{
    const db=await new Promise(resolve=>{const open=indexedDB.open('shiye-pwa-full-v1');open.onsuccess=()=>resolve(open.result)});
    const now=new Date().toISOString(),image='data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="8" height="8"%3E%3Crect width="8" height="8" fill="green"/%3E%3C/svg%3E';
    await new Promise(resolve=>{const tx=db.transaction(['assets','series','projects'],'readwrite');
      for(let i=0;i<40;i++)tx.objectStore('assets').put({id:'navigation-asset-'+i,title:'返回位置素材 '+i,
        blobId:'navigation-blob-'+i,staticPath:image,kind:'sticker',seriesID:'navigation-series-0',createdAt:now});
      for(let i=0;i<25;i++)tx.objectStore('series').put({id:'navigation-series-'+i,
        title:'返回位置系列 '+i,createdAt:now,updatedAt:now});
      for(let i=0;i<25;i++)tx.objectStore('projects').put({id:'navigation-work-'+i,title:'返回位置作品 '+i,
        createdAt:now,updatedAt:now,isDraft:false,activeDraftID:'draft-'+i,drafts:[{id:'draft-'+i,
          canvas:{width:600,height:800},paperColor:'#fffdf5',paperPattern:'plain',sceneVersion:2,layers:[]}]});
      tx.oncomplete=resolve;});db.close();})()`);
  await browser.command('Page.reload');await browser.wait('.works-grid');
  await browser.click('[data-route="library"]','.series-grid');
  await browser.click('.swift-tabs button:nth-child(2)','.asset-grid');
  const immediate=await browser.evaluate('scrollTo(0,650);scrollY');await browser.sleep(80);
  const assetPosition=await browser.evaluate('scrollY');assert.ok(assetPosition>400,
    JSON.stringify(await browser.evaluate(`({height:document.documentElement.scrollHeight,
      viewport:innerHeight,cards:document.querySelectorAll('.asset-grid .card').length,
      route:history.state?.shiyeNavigation?.snapshot?.route})`))+` immediate ${immediate} later ${assetPosition}`);
  await browser.click('[data-id="navigation-asset-0"][data-act="detail"]','.detail-columns');
  await browser.click('[data-act="detail-back"]','.asset-grid');
  await browser.sleep(250);
  assert.ok(Math.abs(await browser.evaluate('scrollY')-assetPosition)<12,
    'Returning from material detail restores the previous catalogue position');
  await browser.click('.swift-tabs button:nth-child(1)','.series-grid');
  await browser.evaluate('scrollTo(0,450)');await browser.sleep(80);
  const seriesPosition=await browser.evaluate('scrollY');assert.ok(seriesPosition>250);
  await browser.click('[data-id="navigation-series-0"][data-act="series-detail"]','.series-contents');
  await browser.click('#series-return','.series-grid');await browser.sleep(250);
  assert.ok(Math.abs(await browser.evaluate('scrollY')-seriesPosition)<12,
    'Returning from series detail restores the previous series list position');
  await browser.click('[data-route="works"]','.works-grid');
  await browser.evaluate('window.__retainedWorkCard=document.querySelector("[data-id=navigation-work-0][data-act=open-project]")');
  await browser.click('[data-route="library"]','.series-grid');
  assert.equal(await browser.evaluate('document.querySelector(".works-page")'),null,
    'parked Works controls must not remain in the active page');
  await browser.click('[data-route="works"]','.works-grid');
  assert.equal(await browser.evaluate('document.querySelector("[data-id=navigation-work-0][data-act=open-project]")===window.__retainedWorkCard'),true,
    'returning to Works must reuse the same card node');
  await browser.evaluate(`(()=>{const input=document.querySelector('#work-search');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'');
    input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await browser.sleep(100);
  await browser.evaluate('scrollTo(0,500)');await browser.sleep(80);
  const workPosition=await browser.evaluate('scrollY');assert.ok(workPosition>250);
  await browser.click('[data-id="navigation-work-0"][data-act="open-project"]','#canvas-page');
  await browser.click('[data-act="back-works"]','.works-grid');
  await browser.sleep(250);
  assert.ok(Math.abs(await browser.evaluate('scrollY')-workPosition)<12,
    'Returning from the editor restores the works position');
  assert.deepEqual(browser.errors,[]);
  console.log('PASS: browser back/forward, refresh, material, series and editor restore route and scroll state');
}finally{await browser.close();}
