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
  await click('[data-val="shape"]','.canvas-picker-grid');
  await click('.canvas-picker-grid button:first-child');
  await wait('.fabric-selected-actions');
  await click('[data-val="scissors"]','.fabric-cut-panel');
  const center=await evaluate(`(()=>{const r=document.querySelector('.upper-canvas').getBoundingClientRect();
    return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
  await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...center});
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,...center});
  const topTarget=await evaluate('document.querySelector(".fabric-cut-target span")?.textContent');
  assert.ok(topTarget.includes('图形'));
  await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...center});
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,...center});
  const lowerTarget=await evaluate('document.querySelector(".fabric-cut-target span")?.textContent');
  assert.notEqual(lowerTarget,topTarget,'Repeated tap should select the occluded lower layer');
  assert.equal(await evaluate('!!document.querySelector(".fabric-cut-results")'),false,
    'A short tap selects without creating a cut preview');
  assert.equal(await evaluate('document.querySelector("[data-val=scissors]").getAttribute("aria-pressed")'),'true');
  await click('.fabric-cut-target button');
  assert.equal(await evaluate('document.querySelector(".fabric-cut-target button").getAttribute("aria-pressed")'),'true');
  await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...center});
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,...center});
  assert.equal(await evaluate('document.querySelector(".fabric-cut-target span")?.textContent'),lowerTarget,
    'Lock should prevent accidental target changes');
  await click('.fabric-cut-target button');
  await click('[data-val="scissors"]','.canvas-cut-settings');
  assert.ok(await evaluate('document.querySelector(".canvas-cut-settings")?.textContent.includes("指定多个图层")'));
  await click('.canvas-cut-settings [aria-label="剪切范围"] button:last-child');
  assert.equal(await evaluate('document.querySelectorAll(".canvas-cut-targets input:checked").length'),1);
  await click('[data-val="scissors"]');
  await click('.fabric-cut-presets button:first-child');
  await wait('.fabric-cut-results');
  const changed=await evaluate(`(()=>{const slider=document.querySelector('.fabric-cut-inset input');
    const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
    setter.call(slider,'0.30');slider.dispatchEvent(new Event('input',{bubbles:true}));
    slider.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
  assert.equal(changed,true);
  await sleep(250);
  assert.ok(await evaluate('document.querySelector(".fabric-cut-inset")?.textContent.includes("30%")'));
  assert.ok(await evaluate('!!document.querySelector(".fabric-cut-results")'),
    'Preset width changes should keep a live preview');
  const header=await evaluate(`(()=>{const r=document.querySelector('.fabric-cut-panel header').getBoundingClientRect();
    return {x:r.left+r.width/2,y:r.top+r.height/2,bottom:innerHeight}})()`);
  await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,x:header.x,y:header.y});
  await command('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,x:header.x,y:header.bottom-15});
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,x:header.x,y:header.bottom-15});
  const visible=await evaluate(`(()=>{const p=document.querySelector('.fabric-cut-panel').getBoundingClientRect();
    const a=document.querySelector('.fabric-cut-actions').getBoundingClientRect();
    return {panel:p.bottom<=innerHeight+1,actions:a.bottom<=innerHeight+1}})()`);
  assert.deepEqual(visible,{panel:true,actions:true});
  const zoom=await evaluate(`(()=>{const page=document.querySelector('#canvas-page'),host=page.parentElement;
    for(let i=0;i<3;i++)host.dispatchEvent(new WheelEvent('wheel',{deltaY:-1000,ctrlKey:true,
      clientX:host.getBoundingClientRect().left+host.clientWidth/2,
      clientY:host.getBoundingClientRect().top+host.clientHeight/2,bubbles:true,cancelable:true}));
    return page.style.transform})()`);
  assert.match(zoom,/scale\(8\)/);
  assert.deepEqual(browser.errors,[]);
  console.log('Scissors tap, target lock, explicit scope, width preview, panel bounds and 8× zoom passed');
}finally{await browser.close();}
