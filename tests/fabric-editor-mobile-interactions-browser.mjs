import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';

const url=process.env.SHIYE_TEST_URL||'http://127.0.0.1:5173';
const browser=await browserHarness('shiye-editor-mobile-interactions',url+'/',
  async({command})=>command('Emulation.setDeviceMetricsOverride',
    {width:390,height:844,deviceScaleFactor:3,mobile:true}));
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
  await click('[aria-label="历史记录"]');
  await click('[data-val="shape"]','.swift-shape-picker');
  await click('[data-shape-kind="rectangle"]','.fabric-selected-actions');
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
  await click('.shape-add-quick','.swift-shape-picker');
  await click('.shape-add-quick');
  assert.deepEqual(browser.errors,[]);
  console.log('Mobile Fabric toolbar, palette, compact menus and release-to-select pan passed');
}finally{await browser.close();}
