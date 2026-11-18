import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {installUiCloudBase} from './fixtures/ui-cloudbase-harness.mjs';
import {browserHarness} from './browser-harness.mjs';

const assets=Array.from({length:4},(_,index)=>({
  id:`stage-asset-${index+1}`,blobId:`stage-image-${index+1}`,title:`测试素材 ${index+1}`,
  staticPath:'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="40" height="50"%3E%3Crect width="40" height="50" fill="%2388a897"/%3E%3C/svg%3E',
  kind:'sticker',reviewStatus:'ready',physicalWidthMM:30,physicalHeightMM:40,tags:[],supply:{quantity:1}
}));
const browser=await browserHarness('shiye-matching-stage',process.env.SHIYE_TEST_URL||'http://127.0.0.1:5175',async({command})=>{
  await command('Page.addScriptToEvaluateOnNewDocument',{source:`(${installUiCloudBase.toString()})(window,{assets:${JSON.stringify(assets)}});`});
});
const {command,evaluate,wait,click,sleep}=browser;
const directory='/tmp/shiye-matching-stage';
await mkdir(directory,{recursive:true});
try{
  await wait('.series-grid');
  await click('[data-route="matching"]','.matching-page');
  assert.equal(await evaluate('document.querySelector(".match-direction").tagName'),'DETAILS');
  await click('.match-rec [data-act="basket"]','.match-stage-item');
  assert.ok(await evaluate('document.querySelector(".match-stage-paper").classList.contains("single")'));
  for(const [width,height,sideBySide] of [[390,844,false],[768,1024,true],[1024,768,true],[1440,900,true]]){
    await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<700});
    await sleep(120);
    const geometry=await evaluate('(()=>{const a=document.querySelector(".match-stage-section").getBoundingClientRect(),b=document.querySelector(".match-recommendations").getBoundingClientRect();return {a:{x:a.x,y:a.y,right:a.right,bottom:a.bottom},b:{x:b.x,y:b.y,right:b.right,bottom:b.bottom},overflow:document.documentElement.scrollWidth-innerWidth}})()');
    assert.ok(geometry.overflow<=1,JSON.stringify(geometry));
    assert.equal(sideBySide,geometry.b.x>geometry.a.right-1,JSON.stringify(geometry));
    if(!sideBySide)assert.ok(geometry.b.y>=geometry.a.bottom-1,JSON.stringify(geometry));
    const screenshot=await command('Page.captureScreenshot',{format:'png'});
    await writeFile(`${directory}/${width}x${height}.png`,Buffer.from(screenshot.data,'base64'));
  }
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await evaluate('document.querySelector(".match-stage-item").scrollIntoView({block:"center"})');
  const initialGeometry=await evaluate('(()=>{const board=document.querySelector(".match-stage-board").getBoundingClientRect(),page=document.querySelector(".match-stage-paper").getBoundingClientRect();return {height:board.height,pageHeight:page.height,width:page.width,boardWidth:board.width}})()');
  assert.ok(initialGeometry.width>initialGeometry.boardWidth*.8,JSON.stringify(initialGeometry));
  await click('.match-stage-item','.match-stage-selection');
  const blank=await evaluate('(()=>{const rect=document.querySelector(".match-stage-paper").getBoundingClientRect();return {x:rect.right-8,y:rect.bottom-8}})()');
  await command('Input.dispatchMouseEvent',{type:'mousePressed',x:blank.x,y:blank.y,button:'left',clickCount:1});
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',x:blank.x,y:blank.y,button:'left',clickCount:1});
  assert.ok(await evaluate('!document.querySelector(".match-stage-selection")'));
  await evaluate('(()=>{const mode=document.querySelector("#match-mode");mode.value="spread";mode.dispatchEvent(new Event("change",{bubbles:true}))})()');
  assert.ok(await evaluate('!document.querySelector(".match-stage-paper").classList.contains("single")'));
  assert.equal(await evaluate('document.querySelector(".match-stage-board").getBoundingClientRect().height'),initialGeometry.height);
  await evaluate('(()=>{const ratio=document.querySelector("#match-ratio");ratio.value="a5";ratio.dispatchEvent(new Event("change",{bubbles:true}))})()');
  assert.equal(await evaluate('document.querySelector(".match-stage-board").getBoundingClientRect().height'),initialGeometry.height);
  await evaluate('(()=>{const ratio=document.querySelector("#match-ratio");ratio.value="a5-slim";ratio.dispatchEvent(new Event("change",{bubbles:true}))})()');
  assert.equal(await evaluate('document.querySelector(".match-stage-paper").getBoundingClientRect().height'),initialGeometry.pageHeight);
  await evaluate('(()=>{const ratio=document.querySelector("#match-ratio");ratio.value="a5";ratio.dispatchEvent(new Event("change",{bubbles:true}))})()');
  const coordinates=await evaluate('(()=>{const item=document.querySelector(".match-stage-item").getBoundingClientRect(),page=document.querySelector(".match-stage-paper").getBoundingClientRect();return {from:{x:item.x+item.width/2,y:item.y+item.height/2},to:{x:page.x+page.width*.55,y:page.y+page.height*.55}}})()');
  await command('Input.dispatchMouseEvent',{type:'mousePressed',x:coordinates.from.x,y:coordinates.from.y,button:'left',clickCount:1});
  await command('Input.dispatchMouseEvent',{type:'mouseMoved',x:coordinates.to.x,y:coordinates.to.y,button:'left'});
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',x:coordinates.to.x,y:coordinates.to.y,button:'left',clickCount:1});
  assert.ok(await evaluate('!document.querySelector(".match-basket-actions [data-act=match-core]").disabled'));
  await click('.match-shelf-tabs [role="tab"]:nth-child(2)');
  await wait('.match-shelf-tabs [role="tab"]:nth-child(2)[aria-selected="true"]');
  const secondID=await evaluate('(()=>{const id=document.querySelector(".match-stage-item").dataset.matchAsset;return [...document.querySelectorAll(".match-rec")].find(node=>node.dataset.matchAsset!==id)?.dataset.matchAsset})()');
  assert.ok(secondID);
  await click(`.match-rec[data-match-asset="${secondID}"] [data-act="basket"]`);
  await wait(`.match-stage-item[data-match-asset="${secondID}"]`);
  assert.ok(await evaluate(`document.querySelector('.match-stage-item[data-match-asset="${secondID}"]').getBoundingClientRect().bottom<=document.querySelector('.match-stage-paper').getBoundingClientRect().bottom+1`));
  const second=await evaluate(`(()=>{const item=document.querySelector('.match-stage-item[data-match-asset="${secondID}"]').getBoundingClientRect(),page=document.querySelector('.match-stage-paper').getBoundingClientRect();return {from:{x:item.x+item.width/2,y:item.y+item.height/2},to:{x:page.x+page.width*.76,y:page.y+page.height*.5}}})()`);
  await command('Input.dispatchMouseEvent',{type:'mousePressed',x:second.from.x,y:second.from.y,button:'left',clickCount:1});
  await command('Input.dispatchMouseEvent',{type:'mouseMoved',x:second.to.x,y:second.to.y,button:'left'});
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',x:second.to.x,y:second.to.y,button:'left',clickCount:1});
  await evaluate('(()=>{const mode=document.querySelector("#match-mode");mode.value="single";mode.dispatchEvent(new Event("change",{bubbles:true}))})()');
  assert.ok(await evaluate(`document.querySelector('.match-stage-item[data-match-asset="${secondID}"]').getBoundingClientRect().x>document.querySelector('.match-stage-paper').getBoundingClientRect().x+document.querySelector('.match-stage-paper').getBoundingClientRect().width/2`));
  await click('[data-act="create-from-basket"]','.manual-layout-dialog');
  await click('[data-manual-template="stage"]','#canvas-page');
  assert.ok(await evaluate('!!document.querySelector("#canvas-page canvas")'));
  assert.ok(await evaluate('document.body.textContent.includes("新的手账")'));
  assert.ok(await evaluate('(()=>{const canvas=document.querySelector("#canvas-page canvas");return canvas.width/canvas.height>1.3})()'));
  assert.deepEqual(browser.errors,[]);
  console.log('Matching stage browser passed: larger two-page canvas, deselection, fixed height, both modes, editor handoff.');
}finally{await browser.close();}
