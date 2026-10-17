import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';

const base=process.env.SHIYE_TEST_URL||'http://127.0.0.1:5173';
const browser=await browserHarness('shiye-cut-interaction',base+'/');
const {click,command,evaluate,wait,sleep}=browser;
try{
  await wait('.series-grid');
  await click('[data-route="works"]','.works-grid');
  await click('#work-create','#blank-create-confirm');
  await click('#blank-create-confirm','#canvas-page');
  await wait('.upper-canvas');
  await click('[data-val="shape"]','.canvas-picker-grid');
  await click('.canvas-picker-grid button:first-child');
  await wait('.fabric-selected-actions');
  assert.equal(await evaluate('document.querySelectorAll(".fabric-selected-actions button").length'),4);
  await click('.fabric-selected-actions [aria-label="剪切选中对象"]','.fabric-cut-panel');
  assert.equal(await evaluate('!!document.querySelector(".swift-editor-toolbar [data-val=scissors]")'),false);
  assert.equal(await evaluate('document.querySelectorAll(".fabric-cut-presets button").length'),3);
  assert.ok(await evaluate('document.querySelector(".fabric-cut-target")?.textContent.includes("图形")'));
  assert.equal(await evaluate('document.querySelector(".fabric-cut-row [aria-pressed=true]")?.textContent'),'裁剪');
  const center=await evaluate(`(()=>{const r=document.querySelector('.upper-canvas').getBoundingClientRect();
    return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
  const tap=async()=>{
    await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...center});
    await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,...center});
  };
  await tap();
  assert.equal(await evaluate('!!document.querySelector(".fabric-cut-preview-status")'),false,
    'A tap before a cut must not switch target or start a preview');
  await click('.fabric-cut-presets button:first-child','.fabric-cut-preview-status');
  assert.ok(await evaluate('document.querySelector(".fabric-cut-preview-status")?.textContent.includes("绿色保留 1 / 2")'));
  await tap();
  assert.ok(await evaluate('document.querySelector(".fabric-cut-preview-status")?.textContent.includes("绿色保留 2 / 2")'),
    'Tapping inside the cutout keeps the inner piece, not the holed outer piece');
  await tap();
  assert.ok(await evaluate('document.querySelector(".fabric-cut-preview-status")?.textContent.includes("绿色保留 1 / 2")'),
    'A second tap reverses the choice');
  assert.equal(await evaluate('!!document.querySelector(".fabric-cut-scope")'),false,
    'Scissors always acts on the selected object');
  await click('.fabric-cut-presets button:first-child','.fabric-cut-preview-status');
  await evaluate(`(()=>{const slider=document.querySelector('.fabric-cut-inset input');
    const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
    setter.call(slider,'0.30');slider.dispatchEvent(new Event('input',{bubbles:true}));
    slider.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await sleep(250);
  assert.ok(await evaluate('document.querySelector(".fabric-cut-inset")?.textContent.includes("30%")'));
  assert.ok(await evaluate('!!document.querySelector(".fabric-cut-preview-status")'));
  const header=await evaluate(`(()=>{const r=document.querySelector('.fabric-cut-panel header strong').getBoundingClientRect();
    return {x:r.left+r.width/2,y:r.top+r.height/2,bottom:innerHeight}})()`);
  await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,x:header.x,y:header.y});
  await command('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,x:header.x,y:header.bottom-15});
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,x:header.x,y:header.bottom-15});
  const visible=await evaluate(`(()=>{const p=document.querySelector('.fabric-cut-panel').getBoundingClientRect();
    const a=document.querySelector('.fabric-cut-actions').getBoundingClientRect();
    return {panel:p.bottom<=innerHeight+1,actions:a.bottom<=innerHeight+1}})()`);
  assert.deepEqual(visible,{panel:true,actions:true});
  const zoom=await evaluate(`(()=>{const page=document.querySelector('#canvas-page'),host=page.parentElement;
    for(let i=0;i<4;i++)host.dispatchEvent(new WheelEvent('wheel',{deltaY:-1000,ctrlKey:true,
      clientX:host.getBoundingClientRect().left+host.clientWidth/2,
      clientY:host.getBoundingClientRect().top+host.clientHeight/2,bubbles:true,cancelable:true}));
    return page.style.transform})()`);
  assert.match(zoom,/scale\(16\)/);
  await click('.fabric-cut-actions button:first-child');
  await click('.fabric-cut-panel .floating-scene-panel-actions button.primary');
  assert.equal(await evaluate('!!document.querySelector(".fabric-cut-panel")'),false);
  await wait('.fabric-selected-actions');
  assert.ok(await evaluate('!!document.querySelector(".fabric-selected-actions")'),
    'Exiting scissors keeps the object selected');
  assert.deepEqual(browser.errors,[]);
  console.log('Object scissors, piece taps, scope, width preview, panel bounds and 16× zoom passed');
}finally{await browser.close();}
