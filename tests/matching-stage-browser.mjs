import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {installUiCloudBase} from './fixtures/ui-cloudbase-harness.mjs';
import {browserHarness} from './browser-harness.mjs';

const assets=Array.from({length:4},(_,index)=>({
  id:`stage-asset-${index+1}`,blobId:`stage-image-${index+1}`,title:`测试素材 ${index+1}`,
  staticPath:'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="40" height="50"%3E%3Crect width="40" height="50" fill="%2388a897"/%3E%3C/svg%3E',
  kind:index===3?'paper':'sticker',seriesID:index<2?'stage-series-1':index===2?'stage-series-2':null,
  reviewStatus:'ready',physicalWidthMM:30,physicalHeightMM:40,tags:[],supply:{quantity:1}
}));
const series=[{id:'stage-series-1',title:'测试系列一'},{id:'stage-series-2',title:'测试系列二'}];
const browser=await browserHarness('shiye-matching-stage',process.env.SHIYE_TEST_URL||'http://127.0.0.1:5175',async({command})=>{
  await command('Page.addScriptToEvaluateOnNewDocument',{source:`(${installUiCloudBase.toString()})(window,{assets:${JSON.stringify(assets)},series:${JSON.stringify(series)}});`});
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
    const geometry=await evaluate('(()=>{const a=document.querySelector(".match-stage-section").getBoundingClientRect(),b=document.querySelector(".match-recommendations").getBoundingClientRect(),card=document.querySelector(".match-rec");return {a:{x:a.x,y:a.y,right:a.right,bottom:a.bottom,height:a.height,width:a.width},b:{x:b.x,y:b.y,right:b.right,bottom:b.bottom,height:b.height,width:b.width},cardDisplay:getComputedStyle(card).display,overflow:document.documentElement.scrollWidth-innerWidth}})()');
    assert.ok(geometry.overflow<=1,JSON.stringify(geometry));
    assert.equal(sideBySide,geometry.b.x>geometry.a.right-1,JSON.stringify(geometry));
    if(sideBySide)assert.ok(Math.abs(geometry.a.height-geometry.b.height)<=1,JSON.stringify(geometry));
    if(sideBySide)assert.ok(geometry.a.width>geometry.b.width,JSON.stringify(geometry));
    assert.equal(geometry.cardDisplay,'block');
    const shelfButtons=await evaluate('(()=>{const buttons=[...document.querySelectorAll(".match-rec-actions button")].slice(0,2).map(node=>node.getBoundingClientRect());return buttons.map(rect=>rect.top)})()');
    assert.ok(Math.abs(shelfButtons[0]-shelfButtons[1])<=1,JSON.stringify(shelfButtons));
    if(sideBySide){
      const shelfRows=await evaluate('(()=>{const items=[...document.querySelectorAll(".match-rec")].slice(0,6).map(node=>node.getBoundingClientRect());return {firstBottom:items[0].bottom,nextTop:items[3].top}})()');
      if(width>1100)assert.ok(shelfRows.nextTop>=shelfRows.firstBottom-1,JSON.stringify(shelfRows));
    }
    if(!sideBySide)assert.ok(geometry.b.y>=geometry.a.bottom-1,JSON.stringify(geometry));
    const screenshot=await command('Page.captureScreenshot',{format:'png'});
    await writeFile(`${directory}/${width}x${height}.png`,Buffer.from(screenshot.data,'base64'));
  }
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await evaluate('document.querySelector(".match-stage-item").scrollIntoView({block:"center"})');
  const initialGeometry=await evaluate('(()=>{const board=document.querySelector(".match-stage-board").getBoundingClientRect(),page=document.querySelector(".match-stage-paper").getBoundingClientRect();return {height:board.height,pageHeight:page.height,width:page.width,boardWidth:board.width}})()');
  assert.ok(initialGeometry.width>initialGeometry.boardWidth*.8,JSON.stringify(initialGeometry));
  assert.ok(initialGeometry.width<=initialGeometry.boardWidth-10,JSON.stringify(initialGeometry));
  await command('Emulation.setDeviceMetricsOverride',{width:320,height:760,deviceScaleFactor:1,mobile:true});
  const narrowGeometry=await evaluate('(()=>{const board=document.querySelector(".match-stage-board").getBoundingClientRect(),page=document.querySelector(".match-stage-paper").getBoundingClientRect();return {boardLeft:board.left,boardRight:board.right,pageLeft:page.left,pageRight:page.right}})()');
  assert.ok(narrowGeometry.pageLeft>=narrowGeometry.boardLeft+5&&narrowGeometry.pageRight<=narrowGeometry.boardRight-5,JSON.stringify(narrowGeometry));
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await click('.match-stage-item','.match-stage-selection');
  const selectedHeight=await evaluate('document.querySelector(".match-stage-section").getBoundingClientRect().height');
  assert.ok(await evaluate('!document.querySelector(".match-stage-settings").textContent.includes("页面模式")'));
  const blank=await evaluate('(()=>{const page=document.querySelector(".match-stage-paper").getBoundingClientRect(),board=document.querySelector(".match-stage-board").getBoundingClientRect();return {x:Math.min(page.x+page.width*.7,board.right-10),y:Math.min(page.y+page.height*.8,board.bottom-10)}})()');
  await command('Input.dispatchMouseEvent',{type:'mousePressed',x:blank.x,y:blank.y,button:'left',clickCount:1});
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',x:blank.x,y:blank.y,button:'left',clickCount:1});
  assert.ok(await evaluate('!document.querySelector(".match-stage-selection")'));
  assert.equal(await evaluate('document.querySelector(".match-stage-section").getBoundingClientRect().height'),selectedHeight);
  await evaluate('(()=>{const mode=document.querySelector("#match-mode");mode.value="spread";mode.dispatchEvent(new Event("change",{bubbles:true}))})()');
  assert.ok(await evaluate('!document.querySelector(".match-stage-paper").classList.contains("single")'));
  assert.equal(await evaluate('document.querySelector(".match-stage-board").getBoundingClientRect().height'),initialGeometry.height);
  await evaluate('(()=>{const ratio=document.querySelector("#match-ratio");ratio.value="a5";ratio.dispatchEvent(new Event("change",{bubbles:true}))})()');
  assert.equal(await evaluate('document.querySelector(".match-stage-board").getBoundingClientRect().height'),initialGeometry.height);
  await evaluate('(()=>{const ratio=document.querySelector("#match-ratio");ratio.value="a5-slim";ratio.dispatchEvent(new Event("change",{bubbles:true}))})()');
  assert.ok(await evaluate('(()=>{const page=document.querySelector(".match-stage-paper").getBoundingClientRect(),board=document.querySelector(".match-stage-board").getBoundingClientRect();return page.top>=board.top+5&&page.bottom<=board.bottom-5&&page.left>=board.left+5&&page.right<=board.right-5})()'));
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
  await click('.match-shelf-tabs [role="tab"]:nth-child(3)');
  await wait(`.match-rec[data-match-asset="${secondID}"].selectable`);
  await click(`.match-rec[data-match-asset="${secondID}"]`);
  assert.ok(await evaluate(`document.querySelector('.match-stage-item[data-match-asset="${secondID}"]').classList.contains('active')&&document.querySelector('.match-rec[data-match-asset="${secondID}"]').classList.contains('active')`));
  await click('.match-stage-item[data-match-asset="stage-asset-1"]');
  assert.ok(await evaluate('document.querySelector(".match-rec[data-match-asset=stage-asset-1]").classList.contains("active")'));
  await click(`.match-rec[data-match-asset="${secondID}"] [data-act="match-core"]`);
  await wait(`.match-rec[data-match-asset="${secondID}"] [data-act="match-core"][aria-pressed="true"]`);
  assert.ok(await evaluate(`document.querySelector('.match-rec[data-match-asset="${secondID}"] [data-act="match-core"]').getAttribute('aria-pressed')==='true'&&!document.querySelector('.match-stage-item[data-match-asset="${secondID}"] .match-stage-star')`));
  assert.ok(await evaluate('(()=>{const card=document.querySelector(".match-rec.selectable").getBoundingClientRect(),button=document.querySelector(".match-rec.selectable [data-act=basket]").getBoundingClientRect();return button.width<card.width/2})()'));
  await click('.match-shelf-tabs [role="tab"]:nth-child(2)');
  await evaluate('(()=>{const filter=document.querySelector(".match-shelf-filters select[aria-label=筛选系列]");filter.value="stage-series-1";filter.dispatchEvent(new Event("change",{bubbles:true}))})()');
  assert.equal(await evaluate('document.querySelectorAll(".match-rec").length'),2);
  await evaluate('(()=>{const filter=document.querySelector(".match-shelf-filters select[aria-label=筛选类型]");filter.value="paper";filter.dispatchEvent(new Event("change",{bubbles:true}))})()');
  assert.equal(await evaluate('document.querySelectorAll(".match-rec").length'),0);
  await evaluate('(()=>{const filter=document.querySelector(".match-shelf-filters select[aria-label=筛选系列]");filter.value="all";filter.dispatchEvent(new Event("change",{bubbles:true}))})()');
  assert.equal(await evaluate('document.querySelectorAll(".match-rec").length'),1);
  await evaluate('(()=>{const filter=document.querySelector(".match-shelf-filters select[aria-label=筛选类型]");filter.value="all";filter.dispatchEvent(new Event("change",{bubbles:true}))})()');
  assert.ok(await evaluate('(()=>{const card=document.querySelector(".match-rec").getBoundingClientRect(),button=document.querySelector(".match-rec [data-act=basket]").getBoundingClientRect();return button.width<card.width/2})()'));
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await evaluate(`document.querySelector('.match-stage-item[data-match-asset="${secondID}"]').scrollIntoView({block:"center"})`);
  const offPaper=await evaluate(`(()=>{const item=document.querySelector('.match-stage-item[data-match-asset="${secondID}"]').getBoundingClientRect(),page=document.querySelector('.match-stage-paper').getBoundingClientRect();return {from:{x:item.x+item.width/2,y:item.y+item.height/2},to:{x:page.right+item.width/2-3,y:page.bottom+item.height/2-3}}})()`);
  await command('Input.dispatchMouseEvent',{type:'mousePressed',x:offPaper.from.x,y:offPaper.from.y,button:'left',clickCount:1});
  await command('Input.dispatchMouseEvent',{type:'mouseMoved',x:offPaper.to.x,y:offPaper.to.y,button:'left'});
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',x:offPaper.to.x,y:offPaper.to.y,button:'left',clickCount:1});
  const corner=await evaluate(`(()=>{const item=document.querySelector('.match-stage-item[data-match-asset="${secondID}"]').getBoundingClientRect(),page=document.querySelector('.match-stage-paper').getBoundingClientRect();return {left:item.left,top:item.top,right:item.right,bottom:item.bottom,pageRight:page.right,pageBottom:page.bottom}})()`);
  assert.ok(corner.left<corner.pageRight&&corner.right>corner.pageRight&&corner.top<corner.pageBottom&&corner.bottom>corner.pageBottom,JSON.stringify(corner));
  const cornerScreenshot=await command('Page.captureScreenshot',{format:'png'});
  await writeFile(`${directory}/off-paper.png`,Buffer.from(cornerScreenshot.data,'base64'));
  await click('[data-act="create-from-basket"]','.manual-layout-dialog');
  await click('[data-manual-template="stage"]','#canvas-page');
  assert.ok(await evaluate('!!document.querySelector("#canvas-page canvas")'));
  assert.ok(await evaluate('document.body.textContent.includes("新的手账")'));
  assert.ok(await evaluate('(()=>{const canvas=document.querySelector("#canvas-page canvas");return canvas.width/canvas.height>1.3})()'));
  assert.deepEqual(browser.errors,[]);
  console.log('Matching stage browser passed: larger two-page canvas, deselection, fixed height, both modes, editor handoff.');
}finally{await browser.close();}
