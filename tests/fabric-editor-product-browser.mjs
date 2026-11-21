import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';
import {sceneLassoBounds} from '../src/scene-lasso.js';
import {worldBox} from '../src/scene-spatial.js';

const base=process.env.SHIYE_TEST_URL||'http://127.0.0.1:5173';
const browser=await browserHarness('shiye-fabric-product',base+'/');
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
const waitProjects=async predicate=>{
  for(let attempt=0;attempt<60;attempt++){
    const records=await projects();if(predicate(records))return records;await sleep(80);
  }
  return projects();
};
try{
  await wait('.series-grid');
  await evaluate(`(async()=>{const db=await new Promise(resolve=>{const open=indexedDB.open('shiye-pwa-full-v1');open.onsuccess=()=>resolve(open.result)});
    await new Promise(resolve=>{const tx=db.transaction('assets','readwrite');tx.objectStore('assets').put({
      id:'fabric-product-material',blobId:'fabric-product-material',title:'画布测试素材',kind:'sticker',
      physicalWidthMM:25,physicalHeightMM:25,createdAt:new Date().toISOString(),
      staticPath:'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2240%22 height=%2240%22%3E%3Crect width=%2240%22 height=%2240%22 fill=%22%2392b87b%22/%3E%3C/svg%3E'
    });tx.oncomplete=resolve;});db.close()})()`);
  await command('Page.reload');await wait('.series-grid');
  await click('[data-route="works"]','.works-grid');
  await click('#work-create','#blank-create-confirm');
  await click('#blank-create-confirm','#canvas-page');
  await wait('.upper-canvas');
  assert.equal(await evaluate('document.querySelectorAll(".swift-editor-toolbar").length'),1);
  assert.equal(await evaluate('document.querySelector("[data-val=pen]")?.textContent.trim()'),'','Pen has the approved single SVG icon');
  assert.deepEqual(browser.errors,[]);
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
  await click('[data-val="pen"]');
  await click('[data-val="pen"]','.swift-popover');
  const mobileMenu=await evaluate(`(()=>{const rect=document.querySelector('.swift-popover').getBoundingClientRect();
    return {left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom}})()`);
  assert.ok(mobileMenu.left>=0&&mobileMenu.right<=390&&mobileMenu.bottom<=844,
    'Second tap settings menu must remain visible on phone: '+JSON.stringify(mobileMenu));
  await click('[data-val="pen"]');
  await command('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  await sleep(200);
  await click('[data-val="select"]');
  await click('[data-val="pen"]');
  assert.equal(await evaluate('document.querySelectorAll(".canvas-context-tools .stroke-width").length'),3);
  assert.equal(await evaluate('document.querySelectorAll(".canvas-context-tools .ink-color").length'),3);
  await click('[data-val="pen"]','.swift-popover');
  assert.ok(await evaluate('document.querySelector(".swift-popover")?.textContent.includes("钢笔")'));
  await click('[data-val="pen"]');
  await click('.canvas-context-tools .stroke-width:first-child');
  assert.equal(await evaluate('document.querySelector(".canvas-context-tools .stroke-width:first-child")?.classList.contains("active")'),true);
  await click('.canvas-context-tools .stroke-width:first-child','.swift-popover');
  assert.ok(await evaluate('document.querySelector(".swift-popover")?.textContent.includes("修改粗细")'));
  await click('[data-val="pen"]');
  await evaluate('document.querySelector(".upper-canvas").scrollIntoView({block:"center"})');
  const point=await evaluate(`(()=>{const rect=document.querySelector('.upper-canvas').getBoundingClientRect();
    return {x:rect.left+rect.width*.4,y:rect.top+rect.height*.45}})()`);
  await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...point});
  for(let step=1;step<=8;step++)await command('Input.dispatchMouseEvent',{
    type:'mouseMoved',button:'left',buttons:1,x:point.x+step*5,y:point.y+step*2});
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,
    x:point.x+40,y:point.y+16,clickCount:1});
  const records=await waitProjects(rows=>rows[0]?.drafts?.[0]?.layers?.some(layer=>layer.type==='ink'));
  assert.equal(records.length,1);
  assert.equal(records[0].drafts[0].layers.filter(layer=>layer.type==='ink').length,1,
    JSON.stringify({point,rect:await evaluate('document.querySelector(".upper-canvas")?.getBoundingClientRect().toJSON()'),
      target:await evaluate(`document.elementFromPoint(${point.x},${point.y})?.outerHTML.slice(0,180)`),
      tool:await evaluate('document.querySelector("[data-val=pen]")?.className'),
      toast:await evaluate('document.querySelector("#toast")?.textContent'),layers:records[0].drafts[0].layers}));
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
  await click('[aria-label="增大字号"]');await sleep(250);
  await click('[aria-label="增大字号"]');await sleep(250);
  assert.equal((await projects())[0].drafts[0].layers.find(layer=>layer.type==='text').fontSize,48,
    'Text-tool property replacement keeps the selected text for consecutive edits');

  await click('[data-val="select"]');
  await click('[data-act="back-works"]','.works-grid');
  await click('[data-act="open-project"]','#canvas-page');
  await sleep(700);
  assert.equal((await projects())[0].drafts[0].layers.find(layer=>layer.type==='text').content,'拾页文字');
  const beforeReedit=(await projects())[0].drafts[0].layers.length;
  const findTextPixel=async()=>evaluate(`(()=>{const canvas=document.querySelector('.lower-canvas');
    const rect=canvas.getBoundingClientRect(),draft=${JSON.stringify((await projects())[0].drafts[0])};
    const layer=draft.layers.find(item=>item.type==='text'),sx=canvas.width/draft.canvas.width,sy=canvas.height/draft.canvas.height;
    const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    for(let y=Math.ceil((layer.y-layer.height/2)*sy);y<(layer.y+layer.height/2)*sy;y++)
      for(let x=Math.ceil((layer.x-layer.width/2)*sx);x<(layer.x+layer.width/2)*sx;x++){
        const i=(y*canvas.width+x)*4;
        if(pixels[i+3]>240&&pixels[i]<120)return {x:rect.left+(x+.5)/canvas.width*rect.width,y:rect.top+(y+.5)/canvas.height*rect.height};
      }
    throw Error('No visible text pixel to click');})()`);
  let existingTextPoint=await findTextPixel();
  await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...existingTextPoint});
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,...existingTextPoint});
  await wait('.canvas-font-size-stepper input[aria-label="字号"]');
  await evaluate(`(()=>{const input=document.querySelector('.canvas-font-size-stepper input[aria-label="字号"]');
    input.focus();input.select();})()`);
  await command('Input.insertText',{text:'54'});
  await evaluate('document.querySelector(".canvas-font-size-stepper input[aria-label=字号]").blur()');
  await sleep(900);
  assert.equal((await projects())[0].drafts[0].layers.find(layer=>layer.type==='text').fontSize,54,
    'Text size accepts a typed value as well as preset steps');
  assert.ok(await evaluate('!!document.querySelector(".fabric-selected-actions")'),
    'Changing font size must keep the selected text frame for subsequent edits');
  await evaluate(`(()=>{const font=document.querySelector('.canvas-text-format select[aria-label="字体"]');
    font.value='sans';font.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await sleep(350);
  assert.ok(await evaluate('!!document.querySelector(".fabric-selected-actions")'),
    'Changing font after size must not clear the same text selection');
  await click('[data-val="text"]');
  const scrollBeforeReedit=await evaluate('window.scrollY');
  existingTextPoint=await findTextPixel();
  await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...existingTextPoint});
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,...existingTextPoint});
  await sleep(850);
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
  const previewRatios=await evaluate(`(()=>['rectangle','ellipse','heart'].map(kind=>{
    const image=document.querySelector('[data-shape-kind="'+kind+'"] img');
    return {kind,ratio:image.naturalWidth/image.naturalHeight,loaded:image.complete};
  }))()`);
  assert.ok(previewRatios.every(row=>row.loaded)&&
    Math.abs(previewRatios[0].ratio-150/105)<.01&&
    previewRatios.slice(1).every(row=>Math.abs(row.ratio-1)<.01),
    'Shape menu thumbnails must preserve the intended Scene aspect ratios: '+JSON.stringify(previewRatios));
  await click('[data-shape-kind="rectangle"]');
  await sleep(700);
  assert.equal((await projects())[0].drafts[0].layers.filter(layer=>layer.type==='shape').length,1);
  assert.equal(await evaluate('!!document.querySelector(".show-inspector")'),false,
    'Selecting a Scene object must retain the canvas selection state');
  await wait('.fabric-selected-actions');
  assert.equal(await evaluate(`(()=>{const bar=document.querySelector('.fabric-selected-actions');
    return bar.querySelectorAll('button').length===4&&bar.querySelectorAll('svg.shiye-icon').length===4&&
      [...bar.querySelectorAll('button')].every(button=>!button.textContent.trim());})()`),true,
    'The floating copy, edit, scissors and delete actions must have one glyph each');
  await click('[aria-label="编辑对象"]','.floating-editor-inspector');
  assert.ok(await evaluate('document.querySelector(".floating-editor-inspector").getBoundingClientRect().width<=301'),
    'Object inspector uses the compact scissors panel width');
  assert.equal(await evaluate('document.querySelectorAll(".floating-editor-inspector .floating-scene-panel-actions button").length'),2);
  assert.ok(await evaluate('!!document.querySelector("#inspector-fill")&&!!document.querySelector("#inspector-stroke-dash")&&!!document.querySelector("#inspector-blend-mode")'),
    'Shape inspector exposes the same editable style fields as AI created shapes');
  assert.equal(await evaluate('!!document.querySelector("#inspector-x,#inspector-y,#inspector-width,#inspector-height")'),false,
    'Position and dimensions are adjusted on the page, not typed into the inspector');
  assert.equal(await evaluate('!!document.querySelector(".fabric-selected-actions")'),false,
    'The inspector must cover the canvas edit controls while open');
  const savedShapeFill=(await projects())[0].drafts[0].layers.find(layer=>layer.type==='shape').fill;
  await evaluate(`(()=>{const input=document.querySelector('#inspector-fill');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'#123456');
    input.dispatchEvent(new Event('input',{bubbles:true}));
    input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await sleep(150);
  assert.equal((await projects())[0].drafts[0].layers.find(layer=>layer.type==='shape').fill,savedShapeFill,
    'Inspector changes must stay outside the saved document until Save and Exit');
  await click('.floating-editor-inspector .floating-scene-panel-actions button:first-child');
  assert.equal(await evaluate('!!document.querySelector(".floating-editor-inspector")'),false);
  assert.equal((await projects())[0].drafts[0].layers.find(layer=>layer.type==='shape').fill,savedShapeFill,
    'Discard must leave the saved shape unchanged');
  const pagePoints=await evaluate(`(()=>{const rect=document.querySelector('.upper-canvas').getBoundingClientRect();
    return {blank:{x:rect.left+rect.width*.08,y:rect.top+rect.height*.08},
      shape:{x:rect.left+rect.width*.5,y:rect.top+rect.height*.5}}})()`);
  for(const [name,position] of Object.entries(pagePoints)){
    await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...position});
    await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,...position});
    await sleep(120);
    assert.equal(await evaluate('!!document.querySelector(".show-inspector")'),false,
      `Clicking ${name} must not open the attribute panel`);
  }
  await wait('.fabric-selected-actions');
  await click('[data-val="shape"]','.swift-shape-picker');
  await click('.swift-shape-picker .swift-segments button:first-child');
  await click('[data-shape-kind="used"]');await sleep(700);
  const shapes=(await projects())[0].drafts[0].layers.filter(layer=>layer.type==='shape');
  assert.equal(shapes.length,2);
  assert.notEqual(shapes[0].id,shapes[1].id,'Copied used shape needs a new Scene identity');
  await click('[data-val="layers"]','.scene-layer-tree');
  assert.ok(await evaluate('document.querySelectorAll(".scene-layer-tree [role=treeitem]").length')>=2);
  await click(`[data-scene-node="${shapes[0].id}"] [data-layer-pick]`);
  await click('.scene-layer-tree-toolbar button:first-child');
  await click(`[data-scene-node="${shapes[1].id}"] [data-layer-pick]`);
  await click('[data-val="layers"]');
  await wait('.fabric-selected-actions');
  await click('.canvas-context-tools [data-popover-anchor="arrange"]','.canvas-arrange-menu');
  await click('.canvas-arrange-menu button:first-child');
  const aligned=(await waitProjects(rows=>{
    const pair=(rows[0]?.drafts?.[0]?.layers||[]).filter(layer=>
      [shapes[0].id,shapes[1].id].includes(layer.id));
    return pair.length===2&&Math.abs((pair[0].x-pair[0].width/2)-(pair[1].x-pair[1].width/2))<.1;
  }))[0].drafts[0].layers.filter(layer=>[shapes[0].id,shapes[1].id].includes(layer.id));
  assert.ok(Math.abs((aligned[0].x-aligned[0].width/2)-(aligned[1].x-aligned[1].width/2))<.1,
    'The visible Align Left control updates both persisted Scene objects');
  await click('[data-act="undo"]');
  await waitProjects(rows=>{
    const pair=(rows[0]?.drafts?.[0]?.layers||[]).filter(layer=>
      [shapes[0].id,shapes[1].id].includes(layer.id));
    return pair.length===2&&Math.abs((pair[0].x-pair[0].width/2)-(pair[1].x-pair[1].width/2))>1;
  });
  await click('[data-act="redo"]');
  await waitProjects(rows=>{
    const pair=(rows[0]?.drafts?.[0]?.layers||[]).filter(layer=>
      [shapes[0].id,shapes[1].id].includes(layer.id));
    return pair.length===2&&Math.abs((pair[0].x-pair[0].width/2)-(pair[1].x-pair[1].width/2))<.1;
  });
  const beforeMulti=(await projects())[0].drafts[0].layers.filter(layer=>
    [shapes[0].id,shapes[1].id].includes(layer.id));
  const multiBounds=sceneLassoBounds((await projects())[0].drafts[0],beforeMulti.map(layer=>layer.id));
  const multiCenter=await evaluate(`(()=>{const r=document.querySelector('.upper-canvas').getBoundingClientRect();
    const b=${JSON.stringify(multiBounds)};
    return {x:r.left+(b.x+b.width/2)*r.width/document.querySelector('.upper-canvas').width,
      y:r.top+(b.y+b.height/2)*r.height/document.querySelector('.upper-canvas').height}})()`);
  await sleep(250);
  await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...multiCenter});
  for(let step=1;step<=4;step++)await command('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,
    x:multiCenter.x+step*7,y:multiCenter.y+step*3});
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,
    x:multiCenter.x+28,y:multiCenter.y+12});
  const afterMulti=(await waitProjects(rows=>{
    const now=rows[0]?.drafts?.[0]?.layers||[];
    return beforeMulti.every(prior=>now.find(item=>item.id===prior.id)?.x>prior.x+10);
  }))[0].drafts[0].layers;
  assert.ok(beforeMulti.every(prior=>afterMulti.find(item=>item.id===prior.id)?.x>prior.x+10),
    'Dragging the shared selection frame must persist both selected objects: '+JSON.stringify({beforeMulti,afterMulti,multiCenter,ui:await evaluate(`({toast:document.querySelector('#toast')?.textContent,selection:document.querySelector('.fabric-selected-actions')?.outerHTML,hit:document.elementFromPoint(${multiCenter.x},${multiCenter.y})?.outerHTML.slice(0,150)})`)}));
  await click('[data-act="undo"]');
  const afterUndo=(await waitProjects(rows=>beforeMulti.every(prior=>
    Math.abs((rows[0]?.drafts?.[0]?.layers||[]).find(item=>item.id===prior.id)?.x-prior.x)<1)))[0].drafts[0].layers;
  assert.ok(beforeMulti.every(prior=>Math.abs(afterUndo.find(item=>item.id===prior.id)?.x-prior.x)<1),
    'Undo must restore both objects from one multi-selection gesture');
  await click('[data-act="redo"]');
  const afterRedo=(await waitProjects(rows=>beforeMulti.every(prior=>
    (rows[0]?.drafts?.[0]?.layers||[]).find(item=>item.id===prior.id)?.x>prior.x+10)))[0].drafts[0].layers;
  assert.ok(beforeMulti.every(prior=>afterRedo.find(item=>item.id===prior.id)?.x>prior.x+10),
    'Redo must reapply both objects from one multi-selection gesture');
  const turnBounds=sceneLassoBounds((await projects())[0].drafts[0],beforeMulti.map(layer=>layer.id));
  const turnHandle=await evaluate(`(()=>{const r=document.querySelector('.upper-canvas').getBoundingClientRect();
    const b=${JSON.stringify(turnBounds)};const c=document.querySelector('.upper-canvas');
    return {x:r.left+(b.x+b.width)*r.width/c.width,
      y:r.top+(b.y+b.height)*r.height/c.height}})()`);
  await sleep(250);
  await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...turnHandle});
  await command('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,
    x:turnHandle.x-25,y:turnHandle.y+20});
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,
    x:turnHandle.x-25,y:turnHandle.y+20});
  const turnedMulti=(await waitProjects(rows=>beforeMulti.every(prior=>
    Math.abs((rows[0]?.drafts?.[0]?.layers||[]).find(item=>item.id===prior.id)?.rotation||0)>3)))[0].drafts[0].layers;
  assert.ok(beforeMulti.every(prior=>Math.abs(turnedMulti.find(item=>item.id===prior.id)?.rotation||0)>3),
    'The shared bottom-right control must rotate every selected object');
  await click('[data-act="undo"]');
  await waitProjects(rows=>beforeMulti.every(prior=>
    Math.abs((rows[0]?.drafts?.[0]?.layers||[]).find(item=>item.id===prior.id)?.rotation||0)<1));
  await click('[data-val="layers"]','.scene-layer-tree');
  assert.ok(await evaluate('!!document.querySelector(".scene-layer-tree [aria-label=锁定]")'));
  await click('.scene-layer-tree [aria-label=锁定]');await sleep(800);
  assert.ok((await projects())[0].drafts[0].layers.some(layer=>layer.locked),
    'Layer lock must persist in the current Scene');
  await click('.scene-layer-tree [aria-label=解锁]');await sleep(800);
  assert.equal((await projects())[0].drafts[0].layers.filter(layer=>layer.locked).length,0);
  const inkID=(await projects())[0].drafts[0].layers.find(layer=>layer.type==='ink')?.id;
  assert.ok(inkID);
  await click(`[data-scene-node="${inkID}"] [data-layer-pick]`);
  await sleep(350);
  assert.ok(await evaluate(`(()=>{const selected=document.querySelector(${JSON.stringify(`[data-scene-node="${inkID}"]`)});
    return selected?.classList.contains('selected')&&!!document.querySelector('.fabric-selected-actions')})()`),
  'Ink picked in the layer tree must keep a visible editing frame');
  const dismissPoint=await evaluate(`(()=>{const rect=document.querySelector('.upper-canvas').getBoundingClientRect();
    return {x:rect.left+rect.width*.9,y:rect.top+rect.height*.9}})()`);
  await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...dismissPoint});
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,...dismissPoint});
  await sleep(150);
  assert.ok(await evaluate('!!document.querySelector(".fabric-selected-actions")'),
    'Closing the layer tree by tapping the paper must keep its selection');
  const inkBefore=(await projects())[0].drafts[0].layers.find(layer=>layer.id===inkID);
  const inkBounds=sceneLassoBounds((await projects())[0].drafts[0],[inkID]);
  const inkCenter=await evaluate(`(()=>{const r=document.querySelector('.upper-canvas').getBoundingClientRect();
    const b=${JSON.stringify(inkBounds)};
    return {x:r.left+(b.x+b.width/2)*r.width/document.querySelector('.upper-canvas').width,
      y:r.top+(b.y+b.height/2)*r.height/document.querySelector('.upper-canvas').height}})()`);
  await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...inkCenter});
  await command('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,
    x:inkCenter.x+24,y:inkCenter.y+12});
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,
    x:inkCenter.x+24,y:inkCenter.y+12});
  const inkAfter=(await waitProjects(rows=>
    rows[0]?.drafts?.[0]?.layers?.find(layer=>layer.id===inkID)?.points?.[0]?.x>
      inkBefore.points[0].x+10))[0].drafts[0].layers.find(layer=>layer.id===inkID);
  assert.ok(inkAfter.points[0].x>inkBefore.points[0].x+10,
    'Dragging an ink selection made through layers must move the persisted Scene stroke');
  await click('[data-val="layers"]','.scene-layer-tree');
  assert.ok(await evaluate(`document.querySelector(${JSON.stringify(`[data-scene-node="${inkID}"]`)})?.classList.contains('selected')`),
    'Reopened layer tree must reflect the object selected on the canvas');
  await click('[data-val="layers"]');
  await click('[data-val="highlighter"]');
  const markerAt=await evaluate(`(()=>{const r=document.querySelector('.upper-canvas').getBoundingClientRect();
    return {x:r.left+r.width*.2,y:r.top+r.height*.15}})()`);
  await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...markerAt});
  await command('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,
    x:markerAt.x+40,y:markerAt.y+10});
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,
    x:markerAt.x+50,y:markerAt.y+10,clickCount:1});
  await sleep(600);
  const marker=(await projects())[0].drafts[0].layers.find(layer=>layer.penStyle==='marker');
  assert.ok(marker&&marker.blendMode==='multiply'&&marker.opacity<.5,
    'Highlighter must persist as a transparent multiply stroke');
  await click('[data-val="lasso"]');
  const lasso=await evaluate(`(()=>{const r=document.querySelector('.upper-canvas').getBoundingClientRect();
    const p=${JSON.stringify(afterMulti.find(layer=>layer.id===shapes[0].id))};const sx=r.width/document.querySelector('.upper-canvas').width;
    const sy=r.height/document.querySelector('.upper-canvas').height;
    const w=Math.max(30,p.width*sx/2+20),h=Math.max(30,p.height*sy/2+20);
    return [{x:r.left+p.x*sx-w,y:r.top+p.y*sy-h},{x:r.left+p.x*sx+w,y:r.top+p.y*sy-h},
      {x:r.left+p.x*sx+w,y:r.top+p.y*sy+h},{x:r.left+p.x*sx-w,y:r.top+p.y*sy+h}];})()`);
  await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...lasso[0]});
  for(const point of [...lasso.slice(1),lasso[0]])await command('Input.dispatchMouseEvent',{
    type:'mouseMoved',button:'left',buttons:1,...point});
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,...lasso[0]});
  await sleep(200);
  assert.ok(await evaluate('!!document.querySelector("[aria-label=复制套选对象]")&&!!document.querySelector("[aria-label=删除套选对象]")&&!!document.querySelector("[aria-label=组合所选对象]")'),
    'Lasso selection must expose copy, delete and group controls');
  const shapeBeforeMove=(await projects())[0].drafts[0].layers.find(layer=>layer.id===shapes[0].id).x;
  const center={x:(lasso[0].x+lasso[2].x)/2,y:(lasso[0].y+lasso[2].y)/2};
  await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...center});
  await command('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,x:center.x+15,y:center.y+8});
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,x:center.x+15,y:center.y+8});
  await sleep(700);
  assert.ok((await projects())[0].drafts[0].layers.find(layer=>layer.id===shapes[0].id).x>shapeBeforeMove,
    'Dragging inside the lasso must move its Scene objects');
  const beforeRotate=(await projects())[0].drafts[0],selectedShapeIDs=shapes.map(shape=>shape.id);
  const frame=sceneLassoBounds(beforeRotate,selectedShapeIDs);
  const canvasRect=await evaluate('document.querySelector(".upper-canvas").getBoundingClientRect().toJSON()');
  const canvasWidth=beforeRotate.canvas.width,frameScale=canvasRect.width/canvasWidth;
  const turnStart={x:canvasRect.left+(frame.x+frame.width)*frameScale,
    y:canvasRect.top+(frame.y+frame.height)*frameScale};
  await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...turnStart});
  await command('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,x:turnStart.x-35,y:turnStart.y+8});
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,x:turnStart.x-35,y:turnStart.y+8});
  const turnedShape=(await waitProjects(rows=>Math.abs(rows[0]?.drafts?.[0]?.layers
    ?.find(layer=>layer.id===shapes[0].id)?.rotation||0)>3))[0].drafts[0]
    .layers.find(layer=>layer.id===shapes[0].id);
  assert.ok(Math.abs(turnedShape.rotation||0)>3,
    'The single bottom-right lasso control rotates selected Scene objects as one unit');
  assert.notEqual(turnedShape.width,shapes[0].width,
    'The same bottom-right lasso control also scales selected Scene objects');
  await click('[aria-label=组合所选对象]');await sleep(700);
  assert.equal((await projects())[0].drafts[0].layers.filter(layer=>layer.type==='group').length,1,
    'Merging lasso selected Scene nodes must persist');
  await wait('.fabric-selected-actions [aria-label="解开组合"]');
  assert.ok(await evaluate('!!document.querySelector("[aria-label=复制组合]")&&!!document.querySelector("[aria-label=删除组合]")'),
    'A saved group must expose the same three floating actions as a single object');
  await click('[aria-label="解开组合"]');await sleep(500);
  assert.equal((await projects())[0].drafts[0].layers.filter(layer=>layer.type==='group').length,0);
  await wait('.fabric-selected-actions [aria-label="组合所选对象"]');
  await click('[aria-label="组合所选对象"]');await sleep(500);
  assert.equal((await projects())[0].drafts[0].layers.filter(layer=>layer.type==='group').length,1,
    'The selected objects can be regrouped without drawing another lasso');
  await wait('.fabric-selected-actions [aria-label="复制组合"]');
  await click('[aria-label="复制组合"]');await sleep(500);
  assert.equal((await projects())[0].drafts[0].layers.filter(layer=>layer.type==='group').length,2,
    'Copying the group duplicates its Scene subtree');
  await click('[aria-label="删除组合"]');await sleep(500);
  assert.equal((await projects())[0].drafts[0].layers.filter(layer=>layer.type==='group').length,1,
    'Deleting the selected copy leaves the original group intact');
  const savedGroupID=(await projects())[0].drafts[0].layers.find(layer=>layer.type==='group').id;
  await click('[data-act="back-works"]','.works-grid');
  await click('[data-act="open-project"]','#canvas-page');
  await wait('.upper-canvas');
  await click('[data-val="layers"]','.scene-layer-tree');
  await click(`[data-scene-node="${savedGroupID}"] .scene-layer-pick`);
  await click('[data-val="layers"]');
  await wait('.fabric-selected-actions[aria-label="组合操作"]');
  assert.ok(await evaluate('!!document.querySelector(".fabric-selected-actions[aria-label=组合操作]")'),
    'A saved and reopened group must be selectable with its editing frame');
  await click('[data-val="layers"]','.scene-layer-tree');
  if(!await evaluate('!!document.querySelector(".scene-layer-children .scene-layer-node")'))
    await click('.scene-layer-node[aria-expanded] .scene-layer-expand');
  await click(`[data-scene-node="${shapes[0].id}"] .scene-layer-pick`);
  await click('[data-val="layers"]');
  assert.ok(await evaluate('!!document.querySelector(".fabric-selected-actions")'),
    'A shape inside a merged group must remain selected on the canvas');
  const nestedBefore=(await projects())[0].drafts[0].layers.find(layer=>layer.type==='group')
    .children.find(child=>child.id===shapes[0].id);
  const nestedRect=await evaluate('document.querySelector(".upper-canvas").getBoundingClientRect().toJSON()');
  const nestedDraft=(await projects())[0].drafts[0];
  const nestedGroupBefore=structuredClone(nestedDraft.layers.find(layer=>layer.type==='group').localTransform);
  const nestedWorldBefore=worldBox(nestedDraft,shapes[0].id);
  const nestedAt={x:nestedRect.left+nestedWorldBefore.cx*nestedRect.width/nestedDraft.canvas.width,
    y:nestedRect.top+nestedWorldBefore.cy*nestedRect.height/nestedDraft.canvas.height};
  await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,
    clickCount:1,...nestedAt});
  await command('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,
    x:nestedAt.x+24,y:nestedAt.y+8});
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,
    clickCount:1,x:nestedAt.x+24,y:nestedAt.y+8});
  const nestedAfterDraft=(await waitProjects(rows=>rows[0]?.drafts?.[0]&&
    worldBox(rows[0].drafts[0],shapes[0].id).cx>nestedWorldBefore.cx+10))[0].drafts[0];
  const nestedGroupAfter=nestedAfterDraft.layers.find(layer=>layer.type==='group');
  const nestedAfter=nestedGroupAfter.children.find(child=>child.id===shapes[0].id);
  assert.ok(worldBox(nestedAfterDraft,shapes[0].id).cx>nestedWorldBefore.cx+10,
    'Dragging a nested shape through the real editor must persist its position');
  assert.notDeepEqual([nestedAfter.x,nestedAfter.y],[nestedBefore.x,nestedBefore.y],
    'The nested shape must persist its changed local position');
  assert.deepEqual(nestedGroupAfter.localTransform,nestedGroupBefore,
    'Dragging a nested shape must not move its parent group');
  await click('[data-val="material"]','.swift-material-picker');
  await click('.swift-material-picker .swift-segments button:last-child');
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
  assert.ok(await evaluate(`(()=>{const card=document.querySelector('[data-material-id="fabric-product-material"]');
    const picture=card.querySelector('.material-piece-image'),caption=card.querySelector('span:last-child');
    const a=card.getBoundingClientRect(),p=picture.getBoundingClientRect(),c=caption.getBoundingClientRect();
    const popup=document.querySelector('.swift-material-picker').getBoundingClientRect();
    return p.bottom<=c.top&&c.bottom<=a.bottom+1&&p.left>=a.left&&p.right<=a.right&&
      a.right<=popup.right&&a.left>=popup.left})()`),
    'Phone material picker image and caption must stay within the card');
  await command('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  await click('[data-material-id="fabric-product-material"]');await sleep(700);
  assert.equal((await projects())[0].drafts[0].layers.filter(layer=>layer.type==='material').length,1);
  const beforeMaterial=(await projects())[0].drafts[0];
  const originalMaterial=beforeMaterial.layers.find(layer=>layer.type==='material');
  await evaluate(`(()=>{window.__originalConfirm=window.confirm;window.__resizeConfirmations=[];window.confirm=message=>{window.__resizeConfirmations.push(message);return true;};})()`);
  const materialEdge=await evaluate(`(()=>{const r=document.querySelector('.upper-canvas').getBoundingClientRect();
    const item=${JSON.stringify(originalMaterial)},page=${JSON.stringify(beforeMaterial.canvas)};
    return {x:r.left+(item.x+item.width/2)*r.width/page.width,
      y:r.top+item.y*r.height/page.height}})()`);
  await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...materialEdge});
  await command('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,
    x:materialEdge.x+30,y:materialEdge.y});
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,
    x:materialEdge.x+30,y:materialEdge.y,clickCount:1});
  const resizedMaterial=(await waitProjects(rows=>rows[0]?.drafts?.[0]?.layers
    ?.find(layer=>layer.id===originalMaterial.id)?.manualVisualResize))[0].drafts[0].layers
    .find(layer=>layer.id===originalMaterial.id);
  assert.ok(resizedMaterial.width>originalMaterial.width&&resizedMaterial.assetID===originalMaterial.assetID,
    'Manual material resize must persist without changing its source asset: '+JSON.stringify({originalMaterial,resizedMaterial,materialEdge,ui:await evaluate(`({toast:document.querySelector('#toast')?.textContent,selection:document.querySelector('.fabric-selected-actions')?.outerHTML,hit:document.elementFromPoint(${materialEdge.x},${materialEdge.y})?.outerHTML.slice(0,150)})`)}));
  assert.equal(await evaluate('window.__resizeConfirmations.length'),1,'A visual material resize requires one explicit human confirmation');
  await evaluate('window.confirm=window.__originalConfirm');
  await click('[aria-label="编辑对象"]','.floating-editor-inspector');
  const inspectorGrip=await evaluate('document.querySelector(".floating-editor-inspector .floating-panel-resize").getBoundingClientRect().toJSON()');
  const inspectorHeight=await evaluate('document.querySelector(".floating-editor-inspector").getBoundingClientRect().height');
  await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,
    x:inspectorGrip.left+inspectorGrip.width/2,y:inspectorGrip.top+inspectorGrip.height/2});
  await command('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,
    x:inspectorGrip.left+inspectorGrip.width/2,y:inspectorGrip.top+inspectorGrip.height/2+55});
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,
    x:inspectorGrip.left+inspectorGrip.width/2,y:inspectorGrip.top+inspectorGrip.height/2+55});
  await sleep(100);
  const inspectorAfter=await evaluate('document.querySelector(".floating-editor-inspector").getBoundingClientRect().toJSON()');
  assert.ok(inspectorAfter.height>inspectorHeight+25,
    'Dragging the bottom-right inspector handle must increase panel height: '+JSON.stringify({inspectorHeight,inspectorAfter,inspectorGrip}));
  assert.equal(await evaluate('!!document.querySelector(".editor-crop-slider")'),false,
    'Crop range editing belongs to scissors, not the object inspector');
  await evaluate(`(()=>{const input=document.querySelector('#inspector-opacity');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'0.5');
    input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await sleep(700);
  assert.equal((await projects())[0].drafts[0].layers.find(layer=>layer.type==='material').opacity,1,
    'Object edits remain staged until Complete');
  await click('.floating-editor-inspector .floating-scene-panel-actions button.primary');
  await sleep(700);
  assert.equal((await projects())[0].drafts[0].layers.find(layer=>layer.type==='material').opacity,.5,
    'Complete commits the staged overall opacity');
  await click('[data-val="material"]','.swift-material-picker');
  assert.equal(await evaluate('document.querySelectorAll(".swift-material-picker [data-picker-item]").length'),1);
  await click('.swift-material-picker [data-picker-item]');await sleep(300);
  assert.equal((await projects())[0].drafts[0].layers.filter(layer=>layer.type==='material').length,1,
    'Selecting an already used material must not consume another physical unit');
  assert.equal(await evaluate('document.querySelector("[data-act=park]").disabled'),false,
    'The reused material must remain selected for parking');
  await click('[data-act="park"]');await sleep(700);
  assert.equal((await projects())[0].drafts[0].layers.filter(layer=>layer.type==='material'&&layer.isParked).length,1,
    JSON.stringify({material:(await projects())[0].drafts[0].layers.filter(layer=>layer.type==='material'),
      toast:await evaluate('document.querySelector("#toast")?.textContent'),
      park:await evaluate('document.querySelector("[data-act=park]")?.outerHTML')}));
  await click('[data-val="material"]','.swift-material-picker');
  await click('.swift-material-picker .swift-segments button:nth-child(2)');
  await click('.swift-material-picker [data-picker-item]');await sleep(700);
  assert.equal((await projects())[0].drafts[0].layers.filter(layer=>layer.type==='material'&&!layer.isParked).length,1);
  await click('[data-val="paper"]','.swift-popover');
  await click('[role="menuitemradio"][aria-checked="false"]');
  await sleep(700);
  assert.equal((await projects())[0].drafts[0].paperPattern,'grid');
  const scale=()=>evaluate('new DOMMatrix(getComputedStyle(document.querySelector("#canvas-page")).transform).a');
  const beforeZoom=await scale();
  await click('[data-act="zoom-in"]');await sleep(200);
  assert.notEqual(await scale(),beforeZoom,'Zoom button must change the Fabric paper transform');
  await click('[data-act="zoom-out"]');await sleep(200);
  assert.equal(await scale(),beforeZoom,'Zoom out must restore the fitted Fabric paper scale');
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
  const drawStroke=async offset=>{
    const rect=await evaluate(`document.querySelector('.upper-canvas').getBoundingClientRect().toJSON()`);
    const start={x:rect.left+rect.width*.2,y:rect.top+rect.height*(.72+offset)};
    await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...start});
    await command('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,x:start.x+30,y:start.y+5});
    await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,x:start.x+40,y:start.y+8});
  };
  await drawStroke(0);await drawStroke(.04);await sleep(700);
  const inkGroup=(await projects())[0].drafts[0].layers.find(layer=>layer.autoInkGroup);
  assert.equal(inkGroup?.children.length,2,'Consecutive strokes share one Scene layer');
  await click('[data-val="layers"]','.scene-layer-tree');
  assert.ok(await evaluate(`!!document.querySelector('.scene-layer-tree [data-scene-node="${inkGroup.id}"]')`),
    'Grouped ink is selectable in the layer tree');
  await click('[data-val="layers"]');
  assert.deepEqual(browser.errors,[]);
  console.log('Fabric product editor smoke passed: stroke, marker, lasso, grouping, undo, redo, text, shape, paper, zoom and pinch cancellation');
}finally{await browser.close();}
