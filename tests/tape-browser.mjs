import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';

const base=process.env.SHIYE_TEST_URL||'http://127.0.0.1:5173';
const browser=await browserHarness('shiye-tape',base+'/');
const {click,command,evaluate,wait,sleep}=browser;
try{
  await wait('.series-grid');
  const idlePriority=await evaluate(`(async()=>{
    const {scheduleForegroundIdle}=await import('/src/foreground-idle.js');
    let ran=false;
    window.dispatchEvent(new PointerEvent('pointerdown',{pointerId:908,bubbles:true}));
    const cancel=scheduleForegroundIdle(()=>{ran=true;},{minIdleMs:100});
    await new Promise(resolve=>setTimeout(resolve,320));const duringGesture=ran;
    window.dispatchEvent(new PointerEvent('pointerup',{pointerId:908,bubbles:true}));
    await new Promise(resolve=>setTimeout(resolve,350));cancel();
    return {duringGesture,afterRelease:ran};
  })()`);
  assert.deepEqual(idlePriority,{duringGesture:false,afterRelease:true});
  const croppedTexture=await evaluate(`(async()=>{
    const {paintTapeStrip}=await import('/src/tape-strip.js');
    const source=document.createElement('canvas');source.width=100;source.height=40;
    source.getContext('2d').fillStyle='#217a40';source.getContext('2d').fillRect(20,10,60,20);
    const output=document.createElement('canvas');output.width=200;output.height=40;
    const ctx=output.getContext('2d');ctx.translate(100,20);
    paintTapeStrip(ctx,{width:200,height:40,tapeStrip:{axis:'x',baseWidth:200,baseHeight:40,
      bandWidthScene:20,points:[[.1,.5],[.9,.5]],pathLengthMM:80,
      sourceLengthMM:100,sourcePeriodMM:20}},source);
    return [...output.getContext('2d').getImageData(25,20,1,1).data];
  })()`);
  assert.ok(croppedTexture[1]>60&&croppedTexture[3]>100,
    'The first repeat must use the tape pattern, not transparent photo padding');
  const denseStroke=await evaluate(`(async()=>{
    const {paintTapeStrip}=await import('/src/tape-strip.js');
    const image=new Image();image.src='/samples/demo-repeat-tape.png';await image.decode();
    const output=document.createElement('canvas');output.width=480;output.height=64;
    const ctx=output.getContext('2d');ctx.translate(240,32);
    const points=Array.from({length:441},(_,i)=>[i/440,.5+.0006*Math.sin(i)]);
    paintTapeStrip(ctx,{width:440,height:40,tapeStrip:{axis:'x',baseWidth:440,baseHeight:40,
      bandWidthScene:24,points,pathLengthMM:110,sourceLengthMM:120,sourcePeriodMM:20}},image);
    const pixels=output.getContext('2d').getImageData(25,32,430,1).data;
    return Array.from({length:430},(_,i)=>pixels[i*4+3]).filter(alpha=>alpha<100).length;
  })()`);
  assert.ok(denseStroke<4,`A dense touch path must render continuous tape, not ${denseStroke} transparent slats`);
  const ribbon=await evaluate(`(async()=>{
    const {createTapeStrip,paintTapeStrip}=await import('/src/tape-strip.js');
    const {project}=await import('/src/domain.js');
    const asset={id:'render-tape',title:'胶带',kind:'tape',physicalWidthMM:100,
      physicalHeightMM:16,tapeAxis:'x',tapeRepeatMode:'repeatablePattern',
      tapeRepeatStartMM:0,tapeRepeatEndMM:20};
    const draft=project('渲染').drafts[0];
    const node=createTapeStrip(asset,draft,[[20,100],[180,100],[280,150]],1,
      {textureMode:'repeat',widthMM:18,startCap:'angled',endCap:'torn'});
    const image=document.createElement('canvas');image.width=100;image.height=16;
    const ic=image.getContext('2d');ic.fillStyle='#5a8b63';ic.fillRect(0,0,100,16);
    const output=document.createElement('canvas');output.width=320;output.height=220;
    const ctx=output.getContext('2d');ctx.translate(node.x,node.y);
    paintTapeStrip(ctx,node,image);
    const row=output.getContext('2d').getImageData(30,100,135,1).data;
    return {holes:Array.from({length:135},(_,i)=>row[i*4+3]).filter(a=>a<100).length,
      endAlpha:output.getContext('2d').getImageData(275,147,1,1).data[3]};
  })()`);
  assert.ok(ribbon.holes<3&&ribbon.endAlpha>50,JSON.stringify(ribbon));
  const straight=await evaluate(`(async()=>{
    const {createTapeStrip,paintTapeStrip}=await import('/src/tape-strip.js');
    const {project}=await import('/src/domain.js');
    const asset={id:'opaque-tape',title:'测试胶带',kind:'tape',physicalWidthMM:100,
      physicalHeightMM:16,tapeAxis:'x',tapeRepeatMode:'repeatablePattern',
      tapeRepeatStartMM:0,tapeRepeatEndMM:20};
    const node=createTapeStrip(asset,project('检查').drafts[0],[[20,100],[150,130],[300,100]]);
    const source=document.createElement('canvas');source.width=100;source.height=16;
    const sc=source.getContext('2d');sc.fillStyle='#70a376';sc.fillRect(0,0,100,16);
    sc.fillStyle='#f5df8e';sc.fillRect(8,0,4,16);
    const output=document.createElement('canvas');output.width=320;output.height=200;
    const ctx=output.getContext('2d');ctx.translate(node.x,node.y);paintTapeStrip(ctx,node,source);
    const data=output.getContext('2d').getImageData(22,100,276,1).data;
    return {points:node.tapeStrip.points.length,
      gaps:Array.from({length:276},(_,i)=>data[i*4+3]).filter(alpha=>alpha<100).length};
  })()`);
  assert.equal(straight.points,2);
  assert.ok(straight.gaps<2,`Straight ribbon has ${straight.gaps} transparent seams`);
  const flattened=await evaluate(`(async()=>{
    const {tapeFlatCanvas}=await import('/src/tape-flat-crop.js');
    const original=document.createElement('canvas');original.width=100;original.height=30;
    const ctx=original.getContext('2d');ctx.fillStyle='#6d9a77';ctx.fillRect(15,7,70,16);
    ctx.fillRect(0,15,100,1);
    const {canvas,crop}=tapeFlatCanvas(original,'x');
    const output=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    return {crop,corners:[0,canvas.width-1,(canvas.height-1)*canvas.width,
      canvas.height*canvas.width-1].map(index=>output[index*4+3]),
      originalWidth:original.width};
  })()`);
  assert.ok(flattened.crop.left>.1&&flattened.crop.right<.9,JSON.stringify(flattened));
  assert.ok(flattened.corners.every(alpha=>alpha>100),JSON.stringify(flattened));
  assert.equal(flattened.originalWidth,100);
  await evaluate(`(async()=>{
    const image=await (await fetch('/samples/demo-repeat-tape.png')).blob();
    const db=await new Promise(resolve=>{const request=indexedDB.open('shiye-pwa-full-v1');
      request.onsuccess=()=>resolve(request.result)});
    await new Promise((resolve,reject)=>{const tx=db.transaction(['assets','blobs'],'readwrite');
      tx.objectStore('assets').put({id:'demo-repeat-tape',blobId:'demo-repeat-tape',
        title:'连续花纹胶带示例',kind:'tape',physicalWidthMM:120,physicalHeightMM:16,
        tapeAxis:'x',tapeRepeatMode:'repeatablePattern',tapeRepeatPeriodMM:20,
        createdAt:new Date().toISOString()});
      tx.objectStore('blobs').put({id:'demo-repeat-tape',data:image});
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
    });db.close();
  })()`);
  await command('Page.reload');await wait('.series-grid');
  await click('[data-route="library"]','.swift-tabs');
  await click('.swift-tabs button:nth-child(2)','.asset-grid');
  await click('[data-id="demo-repeat-tape"][data-act="detail"]','.detail-page');
  assert.equal(await evaluate('!!document.querySelector("[data-act=detail-tape]")'),false);
  await click('[data-act="detail-edit"]','[aria-label="编辑素材"]');
  assert.ok(await evaluate('!!document.querySelector("#asset-usageStatus")'),
    'Tape can be marked used or unused in the ordinary asset editor');
  assert.ok(await evaluate('!!document.querySelector(".material-editor-preview .tape-flat-preview")'),
    'Tape detail previews use a disposable flat view of the original PNG');
  assert.equal(await evaluate('document.querySelector(".material-editor-preview img[data-asset-image-id]")?.style.opacity'),'0',
    'The untrimmed source image must never flash before the flat tape cover is ready');
  await click('.asset-editor-tabs button:nth-child(2)');
  await wait('.tape-source-guide .tape-guide-crop');
  assert.equal(await evaluate('document.querySelectorAll(".material-editor-preview canvas").length'),0,
    'Dragging tape settings must not rebuild a pixel canvas on every slider input');
  assert.ok(await evaluate('!!document.querySelector(".tape-source-guide .tape-guide-crop")'),
    'The original-photo guide marks the flat crop with dashed boundaries');
  assert.equal(await evaluate('document.querySelector("#asset-repeatStart")?.type'),'range');
  assert.equal(await evaluate('document.querySelector("#asset-repeatEnd")?.type'),'range');
  assert.equal(await evaluate('document.querySelectorAll(".tape-guide-repeat").length'),2);
  assert.equal(await evaluate('document.querySelector("#asset-tapeAxis")?.value'),'x');
  assert.equal(await evaluate('document.querySelector("#asset-flatCropMode")?.value'),'auto');
  await evaluate(`(()=>{const select=document.querySelector('#asset-flatCropMode');
    select.value='manual';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  assert.equal(await evaluate('document.querySelector("#asset-flatLeft")?.type'),'range');
  await evaluate(`(()=>{const input=document.querySelector('#asset-flatLeft');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'25');
    input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  assert.equal(await evaluate('document.querySelector(".tape-guide-crop")?.style.left'),'25%',
    'Moving a crop slider updates the dashed guide without saving the asset');
  assert.equal(await evaluate('document.querySelectorAll(".material-editor-preview canvas").length'),0);
  await click('.asset-editor-tabs button:nth-child(1)');
  await evaluate(`(()=>{const select=document.querySelector('#asset-kind');
    select.value='sticker';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  assert.equal(await evaluate('!!document.querySelector(".material-editor-preview .tape-flat-preview")'),false,
    'Changing away from tape shows the original PNG');
  await evaluate(`(()=>{const select=document.querySelector('#asset-kind');
    select.value='tape';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  assert.ok(await evaluate('!!document.querySelector(".material-editor-preview .tape-flat-preview")'));
  assert.equal(await evaluate('document.querySelector(".material-info-panel:not([hidden])")?.textContent.includes("普通素材在同一创作方案")'),false);
  await click('#asset-dialog-close');
  await click('[data-route="works"]','.works-grid');
  await click('#work-create','#blank-create-confirm');
  await click('#blank-create-confirm','#canvas-page');
  await wait('.upper-canvas');
  await click('[data-val="tape"]','.swift-tape-picker');
  assert.ok(await evaluate('!!document.querySelector(".swift-tape-picker .canvas-material-search")'));
  assert.equal(await evaluate('!!document.querySelector(".swift-tape-picker .canvas-material-filters")'),false);
  assert.ok(await evaluate(`(()=>{const names=[...document.querySelectorAll('.editor-tools [data-val]')]
    .map(node=>node.dataset.val);return names.indexOf('tape')===names.indexOf('material')+1})()`),
  'Tape tool follows the material tool');
  await click('[data-val="tape"]');
  assert.equal(await evaluate('document.querySelector("[data-val=tape]")?.getAttribute("aria-pressed")'),'false');
  await click('[data-val="tape"]','.swift-tape-picker');
  await click('.swift-tape-picker .canvas-material-search');
  await evaluate('document.querySelector(".swift-tape-picker .canvas-material-search").focus()');
  await command('Input.insertText',{text:'连续'});
  assert.equal(await evaluate('document.querySelectorAll(".swift-tape-picker [data-tape-id]").length'),1);
  await click('.swift-tape-picker [data-tape-id="demo-repeat-tape"]');
  assert.equal(await evaluate('!!document.querySelector(".swift-tape-picker")'),false);
  await wait('.canvas-context-tools button');
  assert.ok(await evaluate('document.querySelector(".canvas-context-tools")?.textContent.includes("胶带")'));
  const rect=await evaluate('document.querySelector(".upper-canvas").getBoundingClientRect().toJSON()');
  const before=await evaluate('document.querySelector(".upper-canvas").toDataURL()');
  const drag=async(y)=>{
    const start={x:rect.left+rect.width*.20,y:rect.top+rect.height*y};
    const end={x:rect.left+rect.width*.80,y:start.y+15};
    await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...start});
    for(let i=1;i<=8;i++)await command('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,
      x:start.x+(end.x-start.x)*i/8,y:start.y+(end.y-start.y)*i/8});
    await sleep(70);
    if(y===.40)assert.notEqual(await evaluate('document.querySelector(".upper-canvas").toDataURL()'),before,
      'The strip must be visible while the pointer is still down');
    await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,...end});
  };
  await drag(.40);await sleep(250);
  await drag(.58);await sleep(250);
  const scene=await evaluate(`(async()=>{
    const db=await new Promise(resolve=>{const request=indexedDB.open('shiye-pwa-full-v1');
      request.onsuccess=()=>resolve(request.result)});
    const projects=await new Promise(resolve=>{const request=db.transaction('projects').objectStore('projects').getAll();
      request.onsuccess=()=>resolve(request.result)});db.close();
    const latest=projects.filter(p=>p.title==='未命名手账').sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0];
    return latest.drafts[0].layers.filter(item=>item.assetID==='demo-repeat-tape')
      .map(item=>({unit:item.materialUnitIndex,points:item.tapeStrip?.points.length,
        width:item.tapeStrip?.bandWidthScene,asset:item.assetID}));
  })()`);
  assert.equal(scene.length,2,JSON.stringify(scene));
  assert.deepEqual(scene.map(item=>item.unit),[0,1]);
  assert.ok(scene.every(item=>item.points===2&&item.width>0));
  await click('[data-val="material"]','.swift-material-picker');
  await click('.swift-segments button:first-child');
  assert.equal(await evaluate('document.querySelectorAll(".swift-material-picker [data-material-id=demo-repeat-tape]").length'),0,
    'A tape roll remains available through its own searchable picker');
  assert.deepEqual(browser.errors,[]);
  console.log('Tape picker, live gesture, two independent editable strips and saved Scene passed');
}finally{await browser.close();}
