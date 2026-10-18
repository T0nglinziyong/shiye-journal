import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';

const base=process.env.SHIYE_TEST_URL||'http://127.0.0.1:5173';
const browser=await browserHarness('shiye-tape',base+'/');
const {click,command,evaluate,wait,sleep}=browser;
try{
  await wait('.series-grid');
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
  await click('.asset-editor-tabs button:nth-child(2)');
  assert.equal(await evaluate('document.querySelector("#asset-tapeAxis")?.value'),'x');
  assert.equal(await evaluate('document.querySelector(".material-info-panel:not([hidden])")?.textContent.includes("普通素材在同一创作方案")'),false);
  await click('#asset-dialog-close');
  await click('[data-route="works"]','.works-grid');
  await click('#work-create','#blank-create-confirm');
  await click('#blank-create-confirm','#canvas-page');
  await wait('.upper-canvas');
  await click('[data-val="material"]','.swift-material-picker');
  await click('[data-material-id="demo-repeat-tape"]');
  await wait('.canvas-tool-hint');
  assert.ok(await evaluate('document.querySelector(".canvas-tool-hint")?.textContent.includes("胶带")'));
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
  assert.ok(scene.every(item=>item.points>=2&&item.width>0));
  assert.deepEqual(browser.errors,[]);
  console.log('Tape picker, live gesture, two independent editable strips and saved Scene passed');
}finally{await browser.close();}
