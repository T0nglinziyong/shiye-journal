import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {installUiCloudBase} from './fixtures/ui-cloudbase-harness.mjs';
import {browserHarness} from './browser-harness.mjs';

const asset={id:'portrait-card',blobId:'portrait-card-image',title:'纵向卡片',kind:'card',
  physicalWidthMM:119.3,physicalHeightMM:80.6,reviewStatus:'ready',tags:[],supply:{quantity:1},
  staticPath:'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="80" height="119"%3E%3Crect width="80" height="119" fill="%2388c9b7"/%3E%3C/svg%3E'};
const browser=await browserHarness('shiye-matching-stage-hitbox',process.env.SHIYE_TEST_URL||'http://127.0.0.1:5175',
  async({command})=>command('Page.addScriptToEvaluateOnNewDocument',
    {source:`(${installUiCloudBase.toString()})(window,{assets:${JSON.stringify([asset])},series:[]});`}));
const {command,evaluate,wait,click}=browser;
try{
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await wait('.series-grid');
  await click('[data-route="matching"]','.matching-page');
  await click('.match-rec [data-act="basket"]','.match-stage-item');
  await wait('.match-stage-item img');
  const geometry=await evaluate(`(()=>{const item=document.querySelector('.match-stage-item'),image=item.querySelector('img'),box=item.getBoundingClientRect(),pixels=image.getBoundingClientRect();return {
    box:{left:box.left,top:box.top,right:box.right,bottom:box.bottom,width:box.width,height:box.height},
    image:{left:pixels.left,top:pixels.top,right:pixels.right,bottom:pixels.bottom,width:pixels.width,height:pixels.height},
    point:{x:box.left+box.width/2,y:box.top+box.height*.82}}})()`);
  assert.ok(geometry.image.left>=geometry.box.left-1&&geometry.image.top>=geometry.box.top-1&&
    geometry.image.right<=geometry.box.right+1&&geometry.image.bottom<=geometry.box.bottom+1,
    JSON.stringify(geometry));
  await command('Input.dispatchMouseEvent',{type:'mousePressed',...geometry.point,button:'left',clickCount:1});
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',...geometry.point,button:'left',clickCount:1});
  assert.ok(await evaluate('(()=>{const item=document.querySelector(".match-stage-item");return item.classList.contains("active")&&getComputedStyle(item.querySelector("img")).outlineStyle==="solid"})()'));
  await click('.match-stage-selection [data-act="match-core"]');
  assert.ok(await evaluate('!document.querySelector(".match-stage-star")'));
  const screenshot=await command('Page.captureScreenshot',{format:'png'});
  await writeFile('/tmp/shiye-matching-stage-hitbox.png',Buffer.from(screenshot.data,'base64'));
  assert.deepEqual(browser.errors,[]);
  console.log('Matching stage portrait asset stays inside its selectable hitbox.');
}finally{await browser.close();}
