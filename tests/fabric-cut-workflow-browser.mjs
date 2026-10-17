import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';

const url=process.env.SHIYE_TEST_URL||'http://127.0.0.1:5173';
const browser=await browserHarness('shiye-cut-workflow',url+'/');
const {click,command,evaluate,wait,sleep}=browser;
try{
  await wait('.series-grid');
  await click('[data-route="works"]','.works-grid');
  await click('#work-create','#blank-create-confirm');
  await click('#blank-create-confirm','#canvas-page');
  await wait('.upper-canvas');

  await click('[aria-label="历史记录"]','.swift-history-popover');
  assert.ok(await evaluate(`(()=>{const pop=document.querySelector('.swift-history-popover');
    const r=pop.getBoundingClientRect(),top=document.elementFromPoint(r.left+25,r.top+25);
    return r.top>=0&&r.bottom<=innerHeight&&pop.contains(top)})()`),
    'History popover must be in front of the toolbar and inside the viewport');
  await click('[aria-label="历史记录"]');

  await click('[data-val="shape"]','.canvas-picker-grid');
  assert.equal(await evaluate('document.querySelector("[data-val=shape]").getAttribute("aria-pressed")'),'true');
  assert.ok(!await evaluate('document.querySelector(".canvas-context-tools")?.textContent.includes("＋ 图形")'));
  await click('[data-val="shape"]');
  assert.equal(await evaluate('document.querySelector("[data-val=select]").getAttribute("aria-pressed")'),'true',
    'Repeated shape click exits placement mode');

  await click('[data-val="shape"]','.canvas-picker-grid');
  await click('.canvas-picker-grid button:first-child');
  await wait('.fabric-selected-actions');
  await click('.fabric-selected-actions [aria-label="剪切选中对象"]','.fabric-cut-panel');
  assert.ok(await evaluate('document.querySelector(".fabric-cut-panel")?.textContent.includes("剪刀")'));
  const cutPanel=await evaluate('document.querySelector(".fabric-cut-panel").getBoundingClientRect().toJSON()');
  const cutGrip=await evaluate('document.querySelector(".fabric-cut-panel .floating-panel-resize").getBoundingClientRect().toJSON()');
  await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,
    x:cutGrip.left+cutGrip.width/2,y:cutGrip.top+cutGrip.height/2});
  await command('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,
    x:cutGrip.left+cutGrip.width/2,y:cutGrip.top+cutGrip.height/2-60});
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,
    x:cutGrip.left+cutGrip.width/2,y:cutGrip.top+cutGrip.height/2-60});
  assert.ok(await evaluate('document.querySelector(".fabric-cut-panel").getBoundingClientRect().height')<cutPanel.height-30,
    'Dragging the bottom-right scissors handle must adjust panel height');
  assert.equal(await evaluate('!!document.querySelector(".swift-editor-toolbar [data-val=scissors]")'),false);
  assert.equal(await evaluate('document.querySelectorAll(".fabric-cut-presets button").length'),3);
  await click('.fabric-cut-presets button:first-child');
  await wait('.fabric-cut-preview-status');
  assert.ok(await evaluate('document.querySelector(".fabric-cut-preview-status")?.textContent.includes("2 片")'));
  await click('.fabric-cut-row button.primary');
  await sleep(150);
  assert.ok(await evaluate('!!document.querySelector(".fabric-cut-panel")'));
  assert.equal(await evaluate('!!document.querySelector(".shelf")'),false,
    'Standby pieces should not cover the bottom of the canvas');
  await click('.fabric-cut-session-actions button:first-child');
  await click('.fabric-cut-session-actions button:nth-child(2)');
  await click('.fabric-cut-panel header button');
  await sleep(700);
  await click('[data-val="layers"]','.scene-layer-parked');
  assert.equal(await evaluate('document.querySelectorAll("[data-parked-piece-id]").length'),1,
    'A parked offcut must remain accessible in the layer menu');
  const result=await evaluate(`(async()=>{const open=indexedDB.open('shiye-pwa-full-v1');
    const db=await new Promise(resolve=>open.onsuccess=()=>resolve(open.result));
    const rows=await new Promise(resolve=>{const q=db.transaction('projects').objectStore('projects').getAll();
      q.onsuccess=()=>resolve(q.result)});db.close();
    const leaves=nodes=>nodes.flatMap(n=>n.type==='group'?leaves(n.children):[n]);
    const layers=leaves(rows.at(-1).drafts[0].layers);
    return {shapes:layers.filter(n=>n.type==='shape').length,
      parked:layers.filter(n=>n.isParked).length}})()`);
  assert.deepEqual(result,{shapes:2,parked:1});
  await click('[data-val="shape"]','.canvas-picker-grid');
  await click('.canvas-picker-grid button:first-child');
  await wait('.fabric-selected-actions');
  await click('.fabric-selected-actions [aria-label="剪切选中对象"]','.fabric-cut-panel');
  const rect=await evaluate('document.querySelector(".upper-canvas").getBoundingClientRect().toJSON()');
  const line={left:rect.left+5,right:rect.right-5,y:rect.top+rect.height/2};
  await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,
    x:line.left,y:line.y,clickCount:1});
  for(let step=1;step<=12;step++)await command('Input.dispatchMouseEvent',{
    type:'mouseMoved',button:'left',buttons:1,
    x:line.left+(line.right-line.left)*step/12,y:line.y});
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,
    x:line.right,y:line.y,clickCount:1});
  await wait('.fabric-cut-preview-status');
  assert.ok(await evaluate('document.querySelector(".fabric-cut-preview-status")?.textContent.includes("2 片")'),
    'A direct canvas line must preview two pieces');
  await click('.fabric-cut-row button.primary');
  await click('.fabric-cut-session-actions button:last-child');
  assert.equal(await evaluate('!!document.querySelector(".fabric-cut-panel")'),false,
    'Discard exits scissors without saving its staged fragments');
  assert.deepEqual(browser.errors,[]);
  console.log('Fabric cut workflow: history, shape toggle, preview, resize, offcut access passed');
}finally{await browser.close();}
