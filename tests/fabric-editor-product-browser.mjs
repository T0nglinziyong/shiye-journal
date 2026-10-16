import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';

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
  const point=await evaluate(`(()=>{const rect=document.querySelector('.upper-canvas').getBoundingClientRect();
    return {x:rect.left+rect.width*.4,y:rect.top+rect.height*.45}})()`);
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
  await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...point});
  for(let step=1;step<=8;step++)await command('Input.dispatchMouseEvent',{
    type:'mouseMoved',button:'left',buttons:1,x:point.x+step*5,y:point.y+step*2});
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,
    x:point.x+40,y:point.y+16,clickCount:1});
  const records=await waitProjects(rows=>rows[0]?.drafts?.[0]?.layers?.some(layer=>layer.type==='ink'));
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
  const existingTextPoint=await evaluate(`(()=>{const text=document.querySelector('.upper-canvas');
    const rect=text.getBoundingClientRect();const layer=${JSON.stringify((await projects())[0].drafts[0].layers.find(layer=>layer.type==='text'))};
    return {x:rect.left+(layer.x-layer.width/2+25)/text.width*rect.width,
      y:rect.top+(layer.y-35)/text.height*rect.height}})()`);
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
  await click('[data-val="text"]');
  const scrollBeforeReedit=await evaluate('window.scrollY');
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
  await click('[aria-label="编辑对象"]','.show-inspector');
  assert.ok(await evaluate('!!document.querySelector("#inspector-fill")&&!!document.querySelector("#inspector-stroke-dash")&&!!document.querySelector("#inspector-blend-mode")'),
    'Shape inspector exposes the same editable style fields as AI created shapes');
  assert.equal(await evaluate('!!document.querySelector("#inspector-x,#inspector-y,#inspector-width,#inspector-height")'),false,
    'Position and dimensions are adjusted on the page, not typed into the inspector');
  assert.equal(await evaluate('!!document.querySelector(".fabric-selected-actions")'),false,
    'The inspector must cover the canvas edit controls while open');
  await click('[aria-label="关闭对象设置"]');
  assert.equal(await evaluate('!!document.querySelector(".show-inspector")'),false);
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
  assert.ok(await evaluate('!!document.querySelector(".scene-layer-tree [aria-label=锁定]")'));
  await click('.scene-layer-tree [aria-label=锁定]');await sleep(800);
  assert.ok((await projects())[0].drafts[0].layers.some(layer=>layer.locked),
    'Layer lock must persist in the current Scene');
  await click('.scene-layer-tree [aria-label=解锁]');await sleep(800);
  assert.equal((await projects())[0].drafts[0].layers.filter(layer=>layer.locked).length,0);
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
    const p=${JSON.stringify(shapes[0])};const sx=r.width/document.querySelector('.upper-canvas').width;
    const sy=r.height/document.querySelector('.upper-canvas').height;
    const w=Math.max(30,p.width*sx/2+20),h=Math.max(30,p.height*sy/2+20);
    return [{x:r.left+p.x*sx-w,y:r.top+p.y*sy-h},{x:r.left+p.x*sx+w,y:r.top+p.y*sy-h},
      {x:r.left+p.x*sx+w,y:r.top+p.y*sy+h},{x:r.left+p.x*sx-w,y:r.top+p.y*sy+h}];})()`);
  await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...lasso[0]});
  for(const point of [...lasso.slice(1),lasso[0]])await command('Input.dispatchMouseEvent',{
    type:'mouseMoved',button:'left',buttons:1,...point});
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,...lasso[0]});
  await sleep(200);
  assert.ok(await evaluate('!!document.querySelector(".canvas-context-tools button")?.textContent.includes("组合")'),
    'Lasso must select the overlapping Scene objects');
  await click('.canvas-context-tools button');await sleep(700);
  assert.equal((await projects())[0].drafts[0].layers.filter(layer=>layer.type==='group').length,1,
    'Grouping selected Scene nodes must persist');
  await click('[data-val="material"]','.swift-material-picker');
  await click('.swift-material-picker .swift-segments button:last-child');
  await click('[data-material-id="fabric-product-material"]');await sleep(700);
  assert.equal((await projects())[0].drafts[0].layers.filter(layer=>layer.type==='material').length,1);
  await click('[aria-label="编辑对象"]','.show-inspector');
  await click('.editor-inspector-geometry summary','.editor-crop-slider');
  assert.equal(await evaluate('!!document.querySelector(".editor-inspector-geometry textarea")'),false,
    'Material cropping should use direct controls instead of JSON');
  await click('.editor-crop-slider button:first-child');await sleep(700);
  assert.ok((await projects())[0].drafts[0].layers.some(layer=>layer.type==='material'&&layer.manualGeometryOverride),
    'Material craft geometry must be editable through the Scene inspector: '+
      JSON.stringify({status:await evaluate(`document.querySelector('.editor-inspector-geometry [role=status]')?.textContent`),
        toast:await evaluate(`document.querySelector('#toast')?.textContent`)}));
  await click('[aria-label="关闭对象设置"]');
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
