import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';

const url=process.env.SHIYE_TEST_URL||'http://127.0.0.1:5173';
const browser=await browserHarness('shiye-fabric-ipad-gestures',url+'/',async({command})=>{
  await command('Emulation.setDeviceMetricsOverride',
    {width:1024,height:768,deviceScaleFactor:2,mobile:true});
  await command('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
  await command('Emulation.setUserAgentOverride',{userAgent:
    'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
    platform:'iPad'});
});
const {command,evaluate,wait,click,sleep}=browser;
const project=()=>evaluate(`(async()=>{const db=await new Promise(resolve=>{
  const request=indexedDB.open('shiye-pwa-full-v1');request.onsuccess=()=>resolve(request.result)});
  const rows=await new Promise(resolve=>{const request=db.transaction('projects').objectStore('projects').getAll();
    request.onsuccess=()=>resolve(request.result)});db.close();return rows[0]})()`);
const point=async(x=.5,y=.5)=>evaluate(`(()=>{const r=document.querySelector('.upper-canvas').getBoundingClientRect();
  return {x:r.left+r.width*${x},y:r.top+r.height*${y}}})()`);
const rect=()=>evaluate(`(()=>{const page=document.querySelector('#canvas-page').getBoundingClientRect(),
  host=document.querySelector('.page-wrap').getBoundingClientRect();
  return {left:page.left,top:page.top,right:page.right,bottom:page.bottom,
    hostLeft:host.left,hostTop:host.top,hostRight:host.right,hostBottom:host.bottom,
    scale:new DOMMatrix(getComputedStyle(document.querySelector('#canvas-page')).transform).a}})()`);
const fingerDrag=async(from,dx,dy,id=1)=>{
  await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...from,id,force:.5}]});
  for(let step=1;step<=5;step++)await command('Input.dispatchTouchEvent',{type:'touchMove',
    touchPoints:[{x:from.x+dx*step/5,y:from.y+dy*step/5,id,force:.5}]});
  await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await sleep(120);
};
try{
  await wait('.series-grid');
  await click('[data-route="works"]','.works-grid');
  await click('#work-create','#blank-create-confirm');
  await click('#blank-create-confirm','#canvas-page');
  await wait('.upper-canvas');
  await evaluate('document.querySelector(".page-wrap").scrollIntoView({block:"center"})');
  await sleep(100);
  assert.equal(await evaluate('navigator.userAgent.includes("iPad")'),true);
  await click('[data-val="pen"]');
  const inkBefore=(await project()).drafts[0].layers.length;
  const start=await point(.5,.48),before=await rect();
  await fingerDrag(start,30,20);
  const after=await rect();
  assert.ok(Math.hypot(after.left-before.left,after.top-before.top)>5,
    'One finger pans the iPad paper in pen mode: '+JSON.stringify({before,after,
      platform:await evaluate('({ua:navigator.userAgent,platform:navigator.platform,touches:navigator.maxTouchPoints})')}));
  assert.equal((await project()).drafts[0].layers.length,inkBefore,
    'Finger pan must not create ink');
  // A Pencil pointer draws while leaving the viewport in place.
  const penStart=await point(.38,.58),penViewport=await rect();
  // CDP cannot inject an actual Apple Pencil; dispatch PointerEvents through
  // the real canvas DOM and leave physical pressure/palm checks to the iPad.
  const penDispatch=await evaluate(`(()=>{const upper=document.querySelector('.upper-canvas');
    const capture=upper.setPointerCapture;upper.setPointerCapture=()=>{};
    const log=[];document.addEventListener('pointerdown',event=>log.push([event.pointerType,event.button]),
      {once:true,capture:true});
    const send=(type,x,y)=>upper.dispatchEvent(new PointerEvent(type,{
      bubbles:true,cancelable:true,pointerId:88,pointerType:'pen',isPrimary:true,
      clientX:x,clientY:y,pressure:.7,buttons:type==='pointerup'?0:1}));
    send('pointerdown',${penStart.x},${penStart.y});
    for(let step=1;step<=4;step++)send('pointermove',${penStart.x}+step*12,${penStart.y}+step*3);
    send('pointerup',${penStart.x}+48,${penStart.y}+12);
    upper.setPointerCapture=capture;return {log,tool:document.querySelector('[data-val="pen"]')?.className,
      canvas:upper.isConnected};})()`);
  await sleep(1200);
  assert.ok((await project()).drafts[0].layers.length>inkBefore,'Pencil draws an ink layer: '+
    JSON.stringify({penDispatch,errors:browser.errors,layers:(await project()).drafts[0].layers,
      toast:await evaluate('document.querySelector("#toast")?.textContent')}));
  assert.ok(Math.abs((await rect()).left-penViewport.left)<2,'Pencil must not pan paper');
  for(const [tool,dx] of [['highlighter',-25],['eraser',25],['lasso',-25]]){
    await click(`[data-val="${tool}"]`);
    const count=(await project()).drafts[0].layers.length;
    const position=await rect();
    await fingerDrag(await point(.5,.5),dx,0);
    assert.ok(Math.abs((await rect()).left-position.left)>3,`${tool}: finger pans`);
    assert.equal((await project()).drafts[0].layers.length,count,
      `${tool}: finger cannot paint or erase`);
  }
  await click('[data-val="shape"]','.swift-shape-picker');
  await click('[data-shape-kind="rectangle"]','.fabric-selected-actions');
  await click('[data-val="pen"]');
  const shapeCenter=await point(.5,.5);
  await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[
    {...shapeCenter,id:7,force:.5}]});
  await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await sleep(300);
  assert.equal(await evaluate('document.querySelector("[data-val=select]")?.classList.contains("primary")'),true,
    'Finger tap selects an object even when the pen was active: '+JSON.stringify({
      at:await evaluate(`document.elementFromPoint(${shapeCenter.x},${shapeCenter.y})?.className`),
      shapeCenter,shape:(await project()).drafts[0].layers.find(node=>node.type==='shape'),
      actions:await evaluate('!!document.querySelector(".fabric-selected-actions")'),
      tool:await evaluate('document.querySelector("[data-val=pen]")?.className')}));
  await click('[data-val="pen"]');
  const origin=await point(.5,.5),zoomBefore=(await rect()).scale;
  const touch=(id,x,y)=>({id,x,y,force:.5});
  await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[
    touch(1,origin.x-30,origin.y)]});
  await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[
    touch(1,origin.x-30,origin.y),touch(2,origin.x+30,origin.y)]});
  await command('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[
    touch(1,origin.x-65,origin.y),touch(2,origin.x+65,origin.y)]});
  await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await sleep(120);
  assert.ok((await rect()).scale>zoomBefore+.05,'Two fingers zoom the page');
  await fingerDrag(await point(.5,.5),900,650);
  const bounded=await rect();
  const anchored=(start,end,hostStart,hostEnd)=>end-start>hostEnd-hostStart
    ?start<=hostStart+38&&end>=hostEnd-38
    :Math.abs((start+end-hostStart-hostEnd)/2)<=25;
  assert.ok(anchored(bounded.left,bounded.right,bounded.hostLeft,bounded.hostRight)&&
    anchored(bounded.top,bounded.bottom,bounded.hostTop,bounded.hostBottom),
  'Even a large drag keeps the paper anchored to both viewport axes: '+JSON.stringify(bounded));
  await click('[data-val="text"]');
  const textSpot=await point(.55,.42);
  await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...textSpot,id:8,force:.5}]});
  await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await sleep(250);
  assert.equal(await evaluate('document.activeElement?.tagName'),'TEXTAREA',
    'Finger tap still places text in text mode');
  assert.deepEqual(browser.errors,[]);
  process.stdout.write('iPad finger/Pencil/zoom/bounds/text gestures passed\n');
}finally{await browser.close();}
