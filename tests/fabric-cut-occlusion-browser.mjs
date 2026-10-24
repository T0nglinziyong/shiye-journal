import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';

const browser=await browserHarness('shiye-cut-occlusion',
  (process.env.SHIYE_TEST_URL||'http://127.0.0.1:5173')+'/');
const {click,command,evaluate,wait,sleep}=browser;
try{
  await wait('.series-grid');
  await click('[data-route="works"]','.works-grid');
  await click('#work-create','#blank-create-confirm');
  await click('#blank-create-confirm','#canvas-page');
  await wait('.upper-canvas');
  for(let i=0;i<2;i++){
    await click('[data-val="shape"]','.canvas-picker-grid');
    await click('.canvas-picker-grid button:first-child','.fabric-selected-actions');
  }
  // Give the upper rectangle a different color so temporary transparency is observable.
  await evaluate(`(()=>{const input=document.querySelector('.shape-quick-color input[type=color]');
    const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
    setter.call(input,'#ff0000');input.dispatchEvent(new Event('input',{bubbles:true}));
    input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await sleep(200);
  const pixel=()=>evaluate(`(()=>{const canvas=document.querySelector('.lower-canvas'),ctx=canvas.getContext('2d');
    return [...ctx.getImageData(canvas.width/2,canvas.height/2,1,1).data]})()`);
  const covered=await pixel();
  await click('[data-val="layers"]','.scene-layer-node');
  assert.equal(await evaluate('document.querySelectorAll(".scene-layer-node").length'),2);
  await click('.scene-layer-tree > .scene-layer-branch:last-child .scene-layer-pick','.fabric-selected-actions');
  await click('[data-val="layers"]');
  await click('.fabric-selected-actions [aria-label="剪切选中对象"]','.fabric-cut-panel');
  await sleep(100);
  const revealed=await pixel();
  assert.notDeepEqual(revealed,covered,'An unrelated upper layer becomes temporarily translucent');
  assert.ok(revealed[0]<covered[0],'The covered lower rectangle becomes visible');
  await click('.fabric-cut-presets button:first-child','.fabric-cut-preview-status');
  const before=await evaluate('document.querySelector(".fabric-cut-preview-status").textContent');
  const center=await evaluate(`(()=>{const r=document.querySelector('.upper-canvas').getBoundingClientRect();
    return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
  await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...center});
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,...center});
  assert.notEqual(await evaluate('document.querySelector(".fabric-cut-preview-status").textContent'),before,
    'A covered lower piece remains tappable through the translucent unrelated cover');
  await click('.fabric-cut-panel .floating-scene-panel-actions button:first-child');
  await sleep(100);
  assert.deepEqual(await pixel(),covered,'The upper layer returns to full opacity after exit');
  await click('[data-val="layers"]','.scene-layer-tree');
  await click('.scene-layer-tree > .scene-layer-branch:last-child .scene-layer-pick');
  const margin=await evaluate(`(()=>{const r=document.querySelector('.page-wrap').getBoundingClientRect();
    for(const [x,y] of [[r.left+12,r.top+12],[r.right-12,r.top+12],
      [r.left+12,r.bottom-12],[r.right-12,r.bottom-12]]){
      const hit=document.elementFromPoint(x,y);
      if(hit?.closest('.page-wrap')&&!hit.closest('#canvas-page'))return {x,y};
    }
    return null;})()`);
  assert.ok(margin,'The editor has a tappable workspace margin');
  await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...margin});
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,...margin});
  await sleep(150);
  assert.equal(await evaluate('!!document.querySelector(".swift-layer-popover")'),false);
  assert.equal(await evaluate('!!document.querySelector(".fabric-selected-actions")'),true,
    'Dismissing the tree from the workspace margin preserves the selected object');
  assert.deepEqual(browser.errors,[]);
  console.log('Covered target cut preview, temporary transparency and restore passed');
}finally{await browser.close();}
