import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';

const base=process.env.SHIYE_TEST_URL||'http://127.0.0.1:5173';
const browser=await browserHarness('shiye-fabric-product',base+'/?fabric-editor');
const {command,evaluate,click,wait,sleep}=browser;
const paintedPixels=()=>evaluate(`(()=>{const canvas=document.querySelector('.lower-canvas');
  const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
  let count=0;for(let index=0;index<data.length;index+=4)
    if(data[index]<240)count++;
  return count})()`);
const projects=()=>evaluate(`(async()=>{
  const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('shiye-pwa-full-v1',1);
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
  return await new Promise((resolve,reject)=>{const transaction=db.transaction('projects');
    const request=transaction.objectStore('projects').getAll();
    request.onsuccess=()=>{db.close();resolve(request.result)};request.onerror=()=>reject(request.error)});
})()`);
try{
  await wait('.series-grid');
  await click('[data-route="works"]','.works-grid');
  await click('#work-create','#blank-create-confirm');
  await click('#blank-create-confirm','#canvas-page');
  await wait('.upper-canvas');
  assert.equal(await evaluate('document.querySelectorAll(".swift-editor-toolbar").length'),1);
  assert.deepEqual(browser.errors,[]);
  const point=await evaluate(`(()=>{const rect=document.querySelector('.upper-canvas').getBoundingClientRect();
    return {x:rect.left+rect.width*.4,y:rect.top+rect.height*.45}})()`);
  await click('[data-val="pen"]');
  await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...point});
  for(let step=1;step<=8;step++)await command('Input.dispatchMouseEvent',{
    type:'mouseMoved',button:'left',buttons:1,x:point.x+step*5,y:point.y+step*2});
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,
    x:point.x+40,y:point.y+16,clickCount:1});
  await sleep(900);
  const records=await projects();
  assert.equal(records.length,1);
  assert.equal(records[0].drafts[0].layers.filter(layer=>layer.type==='ink').length,1);
  assert.ok(await paintedPixels()>20);
  await click('[data-act="undo"]');
  await sleep(700);
  assert.equal((await projects())[0].drafts[0].layers.filter(layer=>layer.type==='ink').length,0);
  await click('[data-act="redo"]');
  await sleep(700);
  assert.equal((await projects())[0].drafts[0].layers.filter(layer=>layer.type==='ink').length,1);
  assert.ok(await paintedPixels()>20);
  await click('[data-act="back-works"]','.works-grid');
  await click('[data-act="open-project"]','#canvas-page');
  await wait('.upper-canvas');
  await sleep(1000);
  const reopen=await evaluate(`(()=>{const canvas=document.querySelector('.lower-canvas');
    const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    let count=0;for(let index=0;index<data.length;index+=4)
      if(data[index]<240)count++;
    return {count,width:canvas.width,height:canvas.height,toast:document.querySelector('#toast')?.textContent,
      canvasCount:document.querySelectorAll('.lower-canvas').length}})()`);
  assert.ok(reopen.count>20,`Reopened Fabric page has no visible stroke: ${JSON.stringify(reopen)}`);
  const beforeText=(await projects())[0].drafts[0].layers.length;
  await click('[data-val="text"]');
  assert.equal((await projects())[0].drafts[0].layers.length,beforeText,
    'Choosing the text tool must not insert an object');
  const textPoint=await evaluate(`(()=>{const rect=document.querySelector('.upper-canvas').getBoundingClientRect();
    return {x:rect.left+rect.width*.4,y:rect.top+rect.height*.65}})()`);
  await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...textPoint});
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,...textPoint});
  await sleep(500);
  assert.equal((await projects())[0].drafts[0].layers.filter(layer=>layer.type==='text').length,1);
  const editing=await evaluate(`({active:document.activeElement?.outerHTML?.slice(0,240),
    textareas:[...document.querySelectorAll('textarea')].map(item=>item.outerHTML.slice(0,240))})`);
  assert.ok(editing.textareas.length>0,`Fabric text input did not appear: ${JSON.stringify(editing)}`);
  await command('Input.insertText',{text:'拾页文字'});
  await sleep(700);
  assert.equal((await projects())[0].drafts[0].layers.find(layer=>layer.type==='text').content,'拾页文字');
  await click('[data-val="select"]');
  await click('[data-act="back-works"]','.works-grid');
  await click('[data-act="open-project"]','#canvas-page');
  await sleep(700);
  assert.equal((await projects())[0].drafts[0].layers.find(layer=>layer.type==='text').content,'拾页文字');
  const beforeReedit=(await projects())[0].drafts[0].layers.length;
  await click('[data-val="text"]');
  const existingTextPoint=await evaluate(`(()=>{const text=document.querySelector('.upper-canvas');
    const rect=text.getBoundingClientRect();const layer=${JSON.stringify((await projects())[0].drafts[0].layers.find(layer=>layer.type==='text'))};
    return {x:rect.left+(layer.x-layer.width/2+25)/text.width*rect.width,
      y:rect.top+(layer.y-35)/text.height*rect.height}})()`);
  const scrollBeforeReedit=await evaluate('window.scrollY');
  await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...existingTextPoint});
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,...existingTextPoint});
  await sleep(350);
  assert.ok(Math.abs((await evaluate('window.scrollY'))-scrollBeforeReedit)<2,
    'Entering existing text must not scroll the paper out of view');
  assert.equal((await projects())[0].drafts[0].layers.length,beforeReedit,
    'Tapping an existing text object with the text tool must not duplicate it');
  await click('[data-val="select"]');
  await click('[data-val="text"]');
  const blankPoint=await evaluate(`(()=>{const rect=document.querySelector('.upper-canvas').getBoundingClientRect();
    return {x:rect.left+rect.width*.1,y:rect.top+rect.height*.85}})()`);
  await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...blankPoint});
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,...blankPoint});
  await sleep(700);
  assert.equal((await projects())[0].drafts[0].layers.filter(layer=>layer.type==='text').length,2,
    JSON.stringify(await evaluate(`({point:${JSON.stringify(blankPoint)},viewport:{width:innerWidth,height:innerHeight},
      tool:document.querySelector('[data-val="text"]').className,
      target:document.elementFromPoint(${blankPoint.x},${blankPoint.y})?.className,
      rect:document.querySelector('.upper-canvas').getBoundingClientRect().toJSON()})`))+
    JSON.stringify((await projects())[0].drafts[0].layers.filter(layer=>layer.type==='text')));
  await click('[data-val="select"]');
  await sleep(700);
  assert.equal((await projects())[0].drafts[0].layers.filter(layer=>layer.type==='text').length,1,
    'An abandoned empty text object must be removed');
  await click('[data-val="shape"]','.swift-shape-picker');
  await click('[data-shape-kind="rectangle"]');
  await sleep(700);
  assert.equal((await projects())[0].drafts[0].layers.filter(layer=>layer.type==='shape').length,1);
  await click('[data-val="paper"]','.swift-popover');
  await click('[role="menuitemradio"][aria-checked="false"]');
  await sleep(700);
  assert.equal((await projects())[0].drafts[0].paperPattern,'grid');
  const scale=()=>evaluate('getComputedStyle(document.querySelector("#canvas-page")).transform');
  const beforeZoom=await scale();
  await click('[data-act="zoom-in"]');await sleep(200);
  assert.notEqual(await scale(),beforeZoom,'Zoom button must change the Fabric paper transform');
  await click('[data-act="zoom-out"]');await sleep(200);
  assert.equal(await scale(),beforeZoom,'Zoom out must restore the fitted Fabric paper');
  await click('[data-val="pen"]');
  const inkBeforePinch=(await projects())[0].drafts[0].layers.filter(layer=>layer.type==='ink').length;
  const pinch=await evaluate(`(()=>{const r=document.querySelector('.upper-canvas').getBoundingClientRect();
    return {x:r.left+r.width*.5,y:r.top+r.height*.5}})()`);
  const touch=(id,x,y)=>({id,x,y,radiusX:1,radiusY:1,force:.5});
  await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch(1,pinch.x-25,pinch.y)]});
  await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch(1,pinch.x-25,pinch.y),touch(2,pinch.x+25,pinch.y)]});
  await command('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[touch(1,pinch.x-45,pinch.y),touch(2,pinch.x+45,pinch.y)]});
  await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await sleep(300);
  assert.notEqual(await scale(),beforeZoom,'Two-finger gesture must zoom the Fabric paper');
  assert.equal((await projects())[0].drafts[0].layers.filter(layer=>layer.type==='ink').length,
    inkBeforePinch,'Pinch gesture must cancel the incomplete pen stroke');
  assert.deepEqual(browser.errors,[]);
  console.log('Fabric product editor smoke passed: stroke, undo, redo, text, shape, paper, zoom and pinch cancellation');
}finally{await browser.close();}
