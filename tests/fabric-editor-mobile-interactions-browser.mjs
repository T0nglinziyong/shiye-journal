import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';

const url=process.env.SHIYE_TEST_URL||'http://127.0.0.1:5173';
const browser=await browserHarness('shiye-editor-mobile-interactions',url+'/',
  async({command})=>{await command('Emulation.setDeviceMetricsOverride',
    {width:390,height:844,deviceScaleFactor:3,mobile:true});
    await command('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});});
const {click,command,evaluate,wait,sleep}=browser;
try{
  await wait('.series-grid');
  await click('[data-route="works"]','.works-grid');
  await click('#work-create','#blank-create-confirm');
  await click('#blank-create-confirm','#canvas-page');
  await wait('.upper-canvas');
  await click('[data-val="pen"]');
  await click('[data-val="pen"]','.swift-popover');
  await click('[data-val="pen"]');
  await click('.canvas-context-tools .ink-color.active','.canvas-color-grid');
  const colors=await evaluate(`[...document.querySelectorAll('.canvas-color-grid .ink-color')]
    .map(button=>{const r=button.getBoundingClientRect();return [r.width,r.height]})`);
  assert.ok(colors.length>=10&&colors.every(([w,h])=>Math.abs(w-h)<.5&&w>=32),
    'Pen colors must remain circular on mobile: '+JSON.stringify(colors));
  await click('.canvas-color-grid .ink-color:nth-child(5)');
  await click('.canvas-context-tools .ink-color.active','.canvas-color-grid');
  await click('[data-val="layers"]','.scene-layer-tree');
  const layers=await evaluate(`({width:document.querySelector('.swift-layer-popover').getBoundingClientRect().width,
    height:document.querySelector('.swift-layer-popover').getBoundingClientRect().height,
    up:document.querySelectorAll('.scene-layer-step').length})`);
  assert.ok(layers.width<=342&&layers.height<=390&&layers.up===0,JSON.stringify(layers));
  await click('[data-val="layers"]');
  await click('[aria-label="历史记录"]','.swift-history-popover');
  const history=await evaluate(`({width:document.querySelector('.swift-history-popover').getBoundingClientRect().width,
    height:document.querySelector('.swift-history-popover').getBoundingClientRect().height})`);
  assert.ok(history.width<=332&&history.height<=400,JSON.stringify(history));
  assert.equal(await evaluate(`(()=>{const text=document.querySelector('.swift-history-popover').textContent;
    return text.includes('新方案')||text.includes('手动存档')})()`),false,
    'History no longer offers scheme or manual archive actions');
  await click('[aria-label="历史记录"]');
  await click('[data-val="text"]');
  assert.equal(await evaluate(`(()=>{const toolbar=document.querySelector('.canvas-text-format');
    return getComputedStyle(toolbar).backgroundColor==='rgba(0, 0, 0, 0)'&&
      !!toolbar.querySelector('input[aria-label="字号"][type=number]')})()`),true,
    'Mobile text controls expose a direct size input without a pale background');
  await evaluate('document.querySelector(".upper-canvas").scrollIntoView({block:"center"})');
  const textSpot=await evaluate(`(()=>{const r=document.querySelector('.upper-canvas').getBoundingClientRect();
    return {x:r.left+r.width*.45,y:r.top+r.height*.55}})()`);
  await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...textSpot,id:7,force:.5}]});
  await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await sleep(400);
  assert.ok(await evaluate('document.activeElement?.tagName==="TEXTAREA"'),
    'Tapping the mobile canvas with the text tool must create and focus a text box');
  await command('Input.insertText',{text:'触屏文字'});
  await sleep(600);
  assert.ok(await evaluate(`(async()=>{const db=await new Promise(resolve=>{const q=indexedDB.open('shiye-pwa-full-v1');q.onsuccess=()=>resolve(q.result)});
    const rows=await new Promise(resolve=>{const q=db.transaction('projects').objectStore('projects').getAll();q.onsuccess=()=>resolve(q.result)});
    db.close();return rows.some(p=>p.drafts?.some(d=>d.layers?.some(n=>n.type==='text'&&n.content==='触屏文字')));})()`),
  'Mobile text must persist to the Scene');
  await click('[data-val="select"]');
  await click('[data-val="layers"]','.scene-layer-tree');
  await click('.scene-layer-node [data-layer-pick]');
  await click('[data-val="layers"]');
  await wait('.canvas-font-size-stepper input[aria-label="字号"]');
  await evaluate(`(()=>{const input=document.querySelector('.canvas-font-size-stepper input[aria-label="字号"]');
    input.focus();input.select();})()`);
  await command('Input.insertText',{text:'61'});
  await evaluate('document.querySelector(".canvas-font-size-stepper input[aria-label=字号]").blur()');
  await sleep(450);
  assert.ok(await evaluate('!!document.querySelector(".fabric-selected-actions")'),
    'Mobile font changes must preserve the selected text frame');
  await click('[data-val="shape"]','.swift-shape-picker');
  await click('[data-shape-kind="rectangle"]','.fabric-selected-actions');
  await click('[aria-label="编辑对象"]','.show-inspector');
  const inspector=await evaluate(`document.querySelector('.editor-inspector').getBoundingClientRect().toJSON()`);
  assert.ok(inspector.left>=-1&&inspector.right<=391,
    'Object settings fit the mobile viewport: '+JSON.stringify(inspector));
  assert.equal(await evaluate('!!document.querySelector("#draft-select,[data-act=save-archive]")'),false,
    'Object settings no longer show scheme and archive controls');
  await click('[aria-label="关闭对象设置"]');
  await evaluate('document.querySelector(".upper-canvas").scrollIntoView({block:"center"})');
  const points=await evaluate(`(()=>{const r=document.querySelector('.upper-canvas').getBoundingClientRect();
    return {shape:{x:r.left+r.width*.5,y:r.top+r.height*.5},
      blank:{x:r.left+r.width*.08,y:r.top+r.height*.08}}})()`);
  await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...points.blank});
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,...points.blank});
  await sleep(100);
  assert.equal(await evaluate('!!document.querySelector(".fabric-selected-actions")'),false);
  await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...points.shape});
  assert.equal(await evaluate('!!document.querySelector(".fabric-selected-actions")'),false,
    'Pressing an object must wait for release before selecting');
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,...points.shape});
  await wait('.fabric-selected-actions');
  for(const pointerType of ['mouse','pen']){
    await command('Input.dispatchMouseEvent',{type:'mousePressed',pointerType,button:'left',buttons:1,clickCount:1,...points.blank});
    await command('Input.dispatchMouseEvent',{type:'mouseReleased',pointerType,button:'left',buttons:0,clickCount:1,...points.blank});
    await command('Input.dispatchMouseEvent',{type:'mousePressed',pointerType,button:'left',buttons:1,clickCount:1,...points.shape});
    assert.equal(await evaluate('!!document.querySelector(".fabric-selected-actions")'),false,pointerType+' waits for release');
    await command('Input.dispatchMouseEvent',{type:'mouseMoved',pointerType,button:'left',buttons:1,x:points.shape.x+20,y:points.shape.y});
    await command('Input.dispatchMouseEvent',{type:'mouseReleased',pointerType,button:'left',buttons:0,clickCount:1,x:points.shape.x+20,y:points.shape.y});
    assert.equal(await evaluate('!!document.querySelector(".fabric-selected-actions")'),false,pointerType+' drag cannot select');
    await command('Input.dispatchMouseEvent',{type:'mousePressed',pointerType,button:'left',buttons:1,clickCount:1,...points.shape});
    await command('Input.dispatchMouseEvent',{type:'mouseReleased',pointerType,button:'left',buttons:0,clickCount:1,...points.shape});
    await wait('.fabric-selected-actions');
  }
  await click('[data-act="zoom-in"]');await sleep(150);
  const from=await evaluate(`(()=>{const r=document.querySelector('.upper-canvas').getBoundingClientRect();
    return {x:r.left+r.width*.08,y:r.top+r.height*.08}})()`);
  const before=await evaluate(`document.querySelector('#canvas-page').getBoundingClientRect().left`);
  await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...from});
  for(let step=1;step<=4;step++)await command('Input.dispatchMouseEvent',
    {type:'mouseMoved',button:'left',buttons:1,x:from.x+step*7,y:from.y+step*5});
  await sleep(100);
  const during=await evaluate(`document.querySelector('#canvas-page').getBoundingClientRect().left`);
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,
    x:from.x+28,y:from.y+20,clickCount:1});
  assert.ok(Math.abs(during-before)>5,'Dragging blank paper did not pan the page: '+JSON.stringify({before,during}));
  const actionBefore=await evaluate(`document.querySelector('.fabric-selected-actions')?.getBoundingClientRect().left`);
  const selectedFrom=await evaluate(`(()=>{const r=document.querySelector('.upper-canvas').getBoundingClientRect();
    return {x:r.left+r.width*.5,y:r.top+r.height*.5}})()`);
  await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...selectedFrom});
  for(let step=1;step<=4;step++)await command('Input.dispatchMouseEvent',
    {type:'mouseMoved',button:'left',buttons:1,x:selectedFrom.x+step*6,y:selectedFrom.y+step*2});
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,
    x:selectedFrom.x+24,y:selectedFrom.y+8,clickCount:1});
  await sleep(700);
  const actionAfter=await evaluate(`document.querySelector('.fabric-selected-actions')?.getBoundingClientRect().left`);
  assert.ok(actionAfter>actionBefore+2,'The selected object and its action frame should follow the next drag: '+JSON.stringify({actionBefore,actionAfter}));
  const rotationTouch=await evaluate(`(async()=>{const db=await new Promise(resolve=>{const q=indexedDB.open('shiye-pwa-full-v1');q.onsuccess=()=>resolve(q.result)});
    const project=await new Promise(resolve=>{const q=db.transaction('projects').objectStore('projects').getAll();q.onsuccess=()=>resolve(q.result.at(-1))});db.close();
    const draft=project.drafts[0],node=draft.layers.findLast(item=>item.type==='shape');
    const rect=document.querySelector('.upper-canvas').getBoundingClientRect(),page=document.querySelector('#canvas-page').getBoundingClientRect(),scale=rect.width/draft.canvas.width;
    return {x:rect.left+(node.x+node.width/2+12)*scale,y:rect.top+(node.y+node.height/2+12)*scale,
      pageLeft:page.left,angle:node.rotation||0};})()`);
  const actionBeforeRotate=await evaluate('document.querySelector(".fabric-selected-actions")?.getBoundingClientRect().toJSON()');
  const touch=(id,x,y)=>({id,x,y,radiusX:1,radiusY:1,force:.5});
  await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch(1,rotationTouch.x,rotationTouch.y)]});
  for(let step=1;step<=4;step++)await command('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[
    touch(1,rotationTouch.x-step*5,rotationTouch.y+step*3)]});
  await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await sleep(700);
  const rotated=await evaluate(`(async()=>{const db=await new Promise(resolve=>{const q=indexedDB.open('shiye-pwa-full-v1');q.onsuccess=()=>resolve(q.result)});
    const p=await new Promise(resolve=>{const q=db.transaction('projects').objectStore('projects').getAll();q.onsuccess=()=>resolve(q.result.at(-1))});db.close();
    return p.drafts[0].layers.findLast(item=>item.type==='shape').rotation||0;})()`);
  assert.ok(Math.abs(rotated-rotationTouch.angle)>3,'The combined bottom-right control must rotate the object: '+JSON.stringify({rotated,rotationTouch,pageLeft:await evaluate(`document.querySelector('#canvas-page').getBoundingClientRect().left`)}));
  const actionAfterRotate=await evaluate('document.querySelector(".fabric-selected-actions")?.getBoundingClientRect().toJSON()');
  assert.ok(Math.hypot(actionAfterRotate.left-actionBeforeRotate.left,actionAfterRotate.top-actionBeforeRotate.top)>2,
    'Action buttons stay attached to the rotated selection edge');
  assert.ok(Math.abs(await evaluate(`document.querySelector('#canvas-page').getBoundingClientRect().left`)-rotationTouch.pageLeft)<2,
    'Touch rotation must not move the page');
  await wait('.fabric-selected-actions');
  const corner=await evaluate(`(async()=>{const db=await new Promise(resolve=>{const q=indexedDB.open('shiye-pwa-full-v1');q.onsuccess=()=>resolve(q.result)});
    const p=await new Promise(resolve=>{const q=db.transaction('projects').objectStore('projects').getAll();q.onsuccess=()=>resolve(q.result.at(-1))});db.close();
    const draft=p.drafts[0],node=draft.layers.findLast(item=>item.type==='shape');
    const rect=document.querySelector('.upper-canvas').getBoundingClientRect(),scale=rect.width/draft.canvas.width;
    const angle=(node.rotation||0)*Math.PI/180,dx=Math.cos(angle)*node.width/2-Math.sin(angle)*node.height/2,
      dy=Math.sin(angle)*node.width/2+Math.cos(angle)*node.height/2;
    return {x:rect.left+(node.x+dx)*scale,y:rect.top+(node.y+dy)*scale,
      moveX:dx/Math.hypot(dx,dy)*5,moveY:dy/Math.hypot(dx,dy)*5,width:node.width,height:node.height};})()`);
  await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch(4,corner.x,corner.y)]});
  for(let step=1;step<=5;step++)await command('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[
    touch(4,corner.x+corner.moveX*step,corner.y+corner.moveY*step)]});
  await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await sleep(700);
  const cornerSize=await evaluate(`(async()=>{const db=await new Promise(resolve=>{const q=indexedDB.open('shiye-pwa-full-v1');q.onsuccess=()=>resolve(q.result)});
    const p=await new Promise(resolve=>{const q=db.transaction('projects').objectStore('projects').getAll();q.onsuccess=()=>resolve(q.result.at(-1))});db.close();
    const node=p.drafts[0].layers.findLast(item=>item.type==='shape');return {width:node.width,height:node.height};})()`);
  assert.ok(cornerSize.width>corner.width+3&&cornerSize.height>corner.height+3,
    'Bottom-right corner must resize both dimensions: '+JSON.stringify({corner,cornerSize}));
  const resize=await evaluate(`(async()=>{const db=await new Promise(resolve=>{const q=indexedDB.open('shiye-pwa-full-v1');q.onsuccess=()=>resolve(q.result)});
    const p=await new Promise(resolve=>{const q=db.transaction('projects').objectStore('projects').getAll();q.onsuccess=()=>resolve(q.result.at(-1))});db.close();
    const draft=p.drafts[0],node=draft.layers.findLast(item=>item.type==='shape');
    const rect=document.querySelector('.upper-canvas').getBoundingClientRect(),scale=rect.width/draft.canvas.width;
    const angle=(node.rotation||0)*Math.PI/180;
    return {x:rect.left+(node.x+Math.cos(angle)*node.width/2)*scale,
      y:rect.top+(node.y+Math.sin(angle)*node.width/2)*scale,
      dx:Math.cos(angle)*5,dy:Math.sin(angle)*5,width:node.width};})()`);
  await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch(3,resize.x,resize.y)]});
  for(let step=1;step<=5;step++)await command('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[
    touch(3,resize.x+resize.dx*step,resize.y+resize.dy*step)]});
  await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await sleep(700);
  const resized=await evaluate(`(async()=>{const db=await new Promise(resolve=>{const q=indexedDB.open('shiye-pwa-full-v1');q.onsuccess=()=>resolve(q.result)});
    const p=await new Promise(resolve=>{const q=db.transaction('projects').objectStore('projects').getAll();q.onsuccess=()=>resolve(q.result.at(-1))});db.close();
    return p.drafts[0].layers.findLast(item=>item.type==='shape').width;})()`);
  assert.ok(resized>resize.width+4,'The edge handle should stretch the selected object: '+JSON.stringify({resize,resized}));
  assert.ok(Math.abs(await evaluate(`document.querySelector('#canvas-page').getBoundingClientRect().left`)-rotationTouch.pageLeft)<2,
    'Touch resizing must not move the page');
  await click('.shape-add-quick','.swift-shape-picker');
  await click('.shape-add-quick');
  await click('[data-val="material"]','.swift-material-picker');
  const pickerLayout=await evaluate(`(()=>{const search=document.querySelector('.canvas-material-search').getBoundingClientRect();
    const [series,type]=[...document.querySelectorAll('.canvas-material-filters select')].map(node=>node.getBoundingClientRect());
    return {search:search.toJSON(),series:series.toJSON(),type:type.toJSON()};})()`);
  assert.ok(pickerLayout.search.height<=34&&pickerLayout.series.height<=34&&pickerLayout.type.height<=34&&
    Math.abs(pickerLayout.series.top-pickerLayout.type.top)<1&&
    Math.abs(pickerLayout.series.width-pickerLayout.type.width)<2&&
    pickerLayout.search.bottom<pickerLayout.series.top,
    'Material search, series and type stay compact with two equal filters: '+JSON.stringify(pickerLayout));
  await click('.swift-material-picker .swift-segments button:first-child');
  assert.equal(await evaluate('document.querySelectorAll(".canvas-material-filters select").length'),2,
    'The same filters remain available on the used-material tab');
  assert.deepEqual(browser.errors,[]);
  console.log('Mobile Fabric toolbar, palette, release-to-select pan and touch rotation passed');
}finally{await browser.close();}
