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
const projects=()=>evaluate(`(async()=>{
  const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('shiye-pwa-full-v1',1);
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
  return new Promise((resolve,reject)=>{const request=db.transaction('projects').objectStore('projects').getAll();
    request.onsuccess=()=>{db.close();resolve(request.result)};request.onerror=()=>reject(request.error)});
})()`);
const waitProjects=async predicate=>{
  for(let attempt=0;attempt<60;attempt++){
    const rows=await projects();if(predicate(rows))return rows;await sleep(100);
  }
  return projects();
};
try{
  await wait('.series-grid');await click('[data-route="works"]','.works-grid');
  await click('#work-create','#blank-create-confirm');await click('#blank-create-confirm','#canvas-page');
  await wait('.upper-canvas');
  for(const [tool,title] of [['material','选择素材'],['layers','图层'],['shape','添加图形']]){
    await touch(`[data-val="${tool}"]`);assert.equal(await menu(),title,`${tool} opens at ${viewportWidth}px`);
    if(tool==='material'){
      assert.equal(await evaluate(`(()=>{const content=document.querySelector('.swift-material-picker .popover-content');
      return content?.children[0]?.classList.contains('swift-segments')&&
        content?.children[1]?.classList.contains('canvas-material-search')})()`),true,
      'Material search follows tabs and precedes filters');
      for(let index=1;index<=3;index++){
        await click(`.swift-material-picker .swift-segments button:nth-child(${index})`);
        assert.equal(await evaluate('document.querySelectorAll(".swift-material-picker .canvas-material-filters select").length'),2,
          'Every material tab exposes series and type on one row');
      }
    }
    await sleep(250);assert.equal(await menu(),title,`${tool} remains open`);
    const target=await center(`[data-val="${tool}"]`);
    const hit=await evaluate(`document.elementFromPoint(${target.x},${target.y})?.outerHTML.slice(0,160)`);
    await touch(`[data-val="${tool}"]`);assert.equal(await menu(),null,`${tool} closes · ${JSON.stringify({target,hit})}`);
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
  assert.equal(await evaluate('document.querySelector(".scene-layer-tree-toolbar button:first-child").getAttribute("aria-pressed")'),'true',
    'Touch must enable layer multi-select exactly once');
  // The second shape remains selected; add the other one in multi-select mode.
  await touch('.scene-layer-branch:first-child .scene-layer-pick');
  assert.equal(await evaluate(`document.querySelectorAll('.scene-layer-node.selected').length`),2,
    'Layer multi-select preserves both selections');
  await touch('[data-val="layers"]');
  await touch('[data-popover-anchor="arrange"]');
  assert.equal(await menu(),'排列所选','Alignment controls open on a touch screen');
  assert.ok(await evaluate(`(()=>{const r=document.querySelector('.swift-popover').getBoundingClientRect();
    return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})()`),
    'Alignment menu stays in the mobile viewport');
  await touch('.canvas-arrange-menu button:first-child');
  await touch('[data-val="layers"]');
  assert.equal(await evaluate(`document.querySelector('.scene-layer-tree-toolbar button:nth-child(2)').disabled`),false);
  await touch('.scene-layer-tree-toolbar button:nth-child(2)');
  assert.equal(await evaluate(`document.querySelectorAll('.scene-layer-node[aria-expanded]').length`),1,
    'Multi-selected layers can be grouped');
  await touch('.scene-layer-node[aria-expanded] .scene-layer-expand');
  assert.equal(await evaluate('document.querySelectorAll(".scene-layer-children .scene-layer-node").length'),0,
    'Touching the group arrow collapses the nested layers');
  await touch('.scene-layer-node[aria-expanded] .scene-layer-expand');
  assert.equal(await evaluate('document.querySelectorAll(".scene-layer-children .scene-layer-node").length'),2,
    'Touching the group arrow again expands the nested layers');
  await touch('.scene-layer-node[aria-expanded] .scene-layer-expand');
  await touch('[data-val="layers"]');
  await touch('[data-val="layers"]');
  assert.equal(await evaluate('document.querySelectorAll(".scene-layer-children .scene-layer-node").length'),0,
    'Collapsing a group survives closing and reopening the layer menu');
  await touch('.scene-layer-node[aria-expanded] .scene-layer-expand');
  assert.equal(await evaluate('document.querySelectorAll(".scene-layer-children .scene-layer-node").length'),2);
  const childID=await evaluate('document.querySelector(".scene-layer-children .scene-layer-node")?.dataset.sceneNode');
  await touch(`[data-scene-node="${childID}"] .scene-layer-pick`);
  await touch('[data-val="layers"]');
  assert.ok(await evaluate('!!document.querySelector(".fabric-selected-actions")'),
    'A nested layer selected by touch must show its canvas actions');
  const beforeDrag=(await projects())[0].drafts[0],child=beforeDrag.layers
    .find(node=>node.type==='group').children.find(node=>node.id===childID);
  await evaluate('document.querySelector(".upper-canvas").scrollIntoView({block:"center"})');
  const point=await evaluate(`(()=>{const canvas=document.querySelector('.upper-canvas');
    const r=canvas.getBoundingClientRect();return {x:r.left+${child.x}*r.width/${beforeDrag.canvas.width},
      y:r.top+${child.y}*r.height/${beforeDrag.canvas.height}}})()`);
  await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,id:3,force:1}]});
  await command('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:point.x+24,y:point.y+12,id:3,force:1}]});
  await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  const movedRows=await waitProjects(rows=>rows[0]?.drafts?.[0]?.layers.find(node=>node.type==='group')
    ?.children.find(node=>node.id===childID)?.x>child.x+10);
  const moved=movedRows[0].drafts[0].layers.find(node=>node.type==='group')
    .children.find(node=>node.id===childID);
  assert.ok(moved.x>child.x+10,'Dragging a nested selection by touch persists its Scene position');
  await touch('[data-act="undo"]');
  const undone=await waitProjects(rows=>Math.abs(rows[0]?.drafts?.[0]?.layers
    .find(node=>node.type==='group')?.children.find(node=>node.id===childID)?.x-child.x)<1);
  assert.ok(Math.abs(undone[0].drafts[0].layers.find(node=>node.type==='group')
    .children.find(node=>node.id===childID).x-child.x)<1,
  'One undo reverses a single touch drag');
  await touch('[data-act="redo"]');
  const redone=await waitProjects(rows=>Math.abs(rows[0]?.drafts?.[0]?.layers
    .find(node=>node.type==='group')?.children.find(node=>node.id===childID)?.x-moved.x)<1);
  assert.ok(Math.abs(redone[0].drafts[0].layers.find(node=>node.type==='group')
    .children.find(node=>node.id===childID).x-moved.x)<1,
  'Redo restores the grouped child position');
  assert.deepEqual(browser.errors,[]);
  console.log('Touch toolbar, layer reorder and nested selection drag passed');
}finally{await browser.close();}
