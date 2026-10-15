import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';

const url=process.env.SHIYE_TEST_URL||'http://127.0.0.1:5173';
const viewportWidth=Number(process.env.SHIYE_TOUCH_WIDTH)||390;
const browser=await browserHarness('shiye-editor-touch-regression',url+'/',async({command})=>{
  await command('Emulation.setDeviceMetricsOverride',
    {width:viewportWidth,height:844,deviceScaleFactor:3,mobile:true});
  await command('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
});
const {click,command,evaluate,wait,sleep}=browser;
const center=selector=>evaluate(`(()=>{const element=document.querySelector(${JSON.stringify(selector)});
  if(!element)throw Error('Missing ${selector}');element.scrollIntoView({block:'nearest',inline:'center'});
  const rect=element.getBoundingClientRect();return {x:rect.left+rect.width/2,y:rect.top+rect.height/2}})()`);
const touch=async selector=>{
  const point=await center(selector);await sleep(80);
  await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,id:1,force:1}]});
  await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await sleep(120);
};
const menu=()=>evaluate(`document.querySelector('.swift-popover')?.getAttribute('aria-label')||null`);
try{
  await wait('.series-grid');await click('[data-route="works"]','.works-grid');
  await click('#work-create','#blank-create-confirm');await click('#blank-create-confirm','#canvas-page');
  await wait('.upper-canvas');
  for(const [tool,title] of [['material','选择素材'],['layers','图层'],['shape','添加图形']]){
    await touch(`[data-val="${tool}"]`);assert.equal(await menu(),title,`${tool} opens at ${viewportWidth}px`);
    if(tool==='material')assert.equal(await evaluate(`(()=>{const content=document.querySelector('.swift-material-picker .popover-content');
      return content?.children[0]?.classList.contains('swift-segments')&&
        content?.children[1]?.classList.contains('canvas-material-search')})()`),true,
      'Material search follows tabs and precedes filters');
    await sleep(250);assert.equal(await menu(),title,`${tool} remains open`);
    await touch(`[data-val="${tool}"]`);assert.equal(await menu(),null,`${tool} closes`);
    await touch(`[data-val="${tool}"]`);assert.equal(await menu(),title,`${tool} reopens`);
  }
  await touch('[data-val="shape"]');
  await click('[data-val="shape"]','.swift-shape-picker');
  await click('[data-shape-kind="rectangle"]','.fabric-selected-actions');
  await click('[data-val="shape"]','.swift-shape-picker');
  await click('[data-shape-kind="ellipse"]','.fabric-selected-actions');
  await click('[data-val="layers"]','.scene-layer-tree');
  const before=await evaluate(`[...document.querySelectorAll('.scene-layer-node')].map(row=>row.dataset.sceneNode)`);
  assert.equal(before.length,2,'Two selectable shapes in the layer tree');
  const grip='.scene-layer-node:first-child .scene-layer-grip';
  const start=await center(grip);
  const end=await center('.scene-layer-branch:nth-child(2) .scene-layer-pick');
  await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...start,id:2,force:1}]});
  for(let step=1;step<=6;step++)await command('Input.dispatchTouchEvent',{
    type:'touchMove',touchPoints:[{x:start.x+(end.x-start.x)*step/6,
      y:start.y+(end.y-start.y)*step/6,id:2,force:1}]});
  await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await sleep(120);
  const after=await evaluate(`[...document.querySelectorAll('.scene-layer-node')].map(row=>row.dataset.sceneNode)`);
  assert.deepEqual(after,[...before].reverse(),'Dragging the grip reverses the visible order');
  await touch('.scene-layer-tree-toolbar button:first-child');
  // The second shape remains selected; add the other one in multi-select mode.
  await touch('.scene-layer-branch:first-child .scene-layer-pick');
  assert.equal(await evaluate(`document.querySelectorAll('.scene-layer-node.selected').length`),2,
    'Layer multi-select preserves both selections');
  assert.equal(await evaluate(`document.querySelector('.scene-layer-tree-toolbar button:nth-child(2)').disabled`),false);
  await touch('.scene-layer-tree-toolbar button:nth-child(2)');
  assert.equal(await evaluate(`document.querySelectorAll('.scene-layer-node[aria-expanded]').length`),1,
    'Multi-selected layers can be grouped');
  assert.deepEqual(browser.errors,[]);
  console.log('Touch toolbar dropdown and layer reorder passed');
}finally{await browser.close();}
