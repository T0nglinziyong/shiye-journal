// Real Chromium acceptance for native cutout dialog loading -> editor paint.
// Uses a fresh browser context and synthetic IndexedDB blobs; never touches COS.
import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';

const b=await browserHarness('shiye-cutout-dialog-visibility',
  process.env.SHIYE_TEST_URL||'http://127.0.0.1:5173');
const {command,evaluate,wait,click,sleep}=b;

async function snapshot(){
  return evaluate(`(()=>{
    const dialog=document.querySelector('#modal'),
      editor=dialog.querySelector('.cutout-modal'),
      canvas=dialog.querySelector('#cutout-canvas');
    if(!editor||!canvas)return null;
    const r=dialog.getBoundingClientRect(),
      c=canvas.getBoundingClientRect(),
      screen={width:innerWidth,height:innerHeight};
    const rgba=canvas.width&&canvas.height
      ?Array.from(canvas.getContext('2d').getImageData(
          Math.floor(canvas.width/2),Math.floor(canvas.height/2),1,1).data)
      :[0,0,0,0];
    const target=document.elementFromPoint(
      Math.min(screen.width-1,Math.max(0,c.left+c.width/2)),
      Math.min(screen.height-1,Math.max(0,c.top+c.height/2)));
    return {
      modalOpen:dialog.open,topLayer:dialog.matches(':modal'),
      loading:dialog.classList.contains('cutout-loading-dialog'),
      mode:getComputedStyle(editor).display,
      dialog:{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height},
      canvas:{width:c.width,height:c.height,pixels:[canvas.width,canvas.height],
        centerAlpha:rgba[3],hitTest:dialog.contains(target)},
      screen,phases:window.__cutoutDialogPhases||[]
    };
  })()`);
}
async function painted(){
  let result;
  for(let i=0;i<100;i++){
    result=await snapshot();
    if(result?.canvas.centerAlpha>0&&result.canvas.height>10)return result;
    await sleep(50);
  }
  throw Error('Cutout editor did not paint: '+JSON.stringify(result));
}
function assertVisible(x,expect){
  assert.equal(x.modalOpen,true,'dialog must remain open after loading');
  assert.equal(x.topLayer,true,'dialog must remain in the native top layer');
  assert.equal(x.loading,false,'loading style must be removed at handoff');
  assert.equal(x.mode,expect,'desktop grid / mobile flex is viewport-scoped');
  assert.ok(x.dialog.width>200&&x.dialog.height>200,JSON.stringify(x));
  assert.ok(x.dialog.left>=-2&&x.dialog.top>=-2,JSON.stringify(x));
  assert.ok(x.dialog.right<=x.screen.width+2,JSON.stringify(x));
  assert.ok(x.dialog.bottom<=x.screen.height+2,JSON.stringify(x));
  assert.ok(x.canvas.width>=65&&x.canvas.height>=65,JSON.stringify(x));
  assert.ok(x.canvas.pixels.every(n=>n>0)&&x.canvas.centerAlpha>0,
    'Canvas must contain actual painted pixels: '+JSON.stringify(x));
  assert.equal(x.canvas.hitTest,true,'modal/preview must not be hidden behind backdrop');
  assert.ok(x.phases.some(row=>row.loading&&row.open&&row.topLayer),
    'loading step must be visible and modal: '+JSON.stringify(x.phases));
  assert.ok(x.phases.some(row=>row.editor&&row.open&&row.topLayer),
    'editor handoff must preserve top layer: '+JSON.stringify(x.phases));
}
try{
  await wait('.series-grid');
  await evaluate(`(async()=>{
    const db=await new Promise((resolve,reject)=>{
      const request=indexedDB.open('shiye-pwa-full-v1');
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    });
    const make=async cutout=>{
      const c=document.createElement('canvas');c.width=180;c.height=140;
      const x=c.getContext('2d');
      x.fillStyle='#f5f0e7';x.fillRect(0,0,180,140);
      x.fillStyle='#7da56d';x.fillRect(25,20,130,100);
      x.fillStyle='#fff';x.fillRect(65,48,50,44);
      if(cutout){
        x.globalCompositeOperation='destination-in';
        x.fillStyle='#000';x.fillRect(25,20,130,100);
      }
      return new Promise(resolve=>c.toBlob(resolve,'image/png'));
    };
    const frame=await make(false),cut=await make(true);
    const now=new Date().toISOString();
    const common={kind:'paper',role:'support',reviewStatus:'ready',
      createdAt:now,physicalWidthMM:40,physicalHeightMM:30,
      supply:{quantity:1},
      processingRecord:{recognitionPixels:900,
        candidateFramePlacement:{x:0,y:0,width:180,height:140,
          frameWidth:180,frameHeight:140}}};
    const assets=[
      {...common,id:'dialog-check-legacy',title:'旧图片编辑',
        blobId:'dialog-legacy-cut',originalBlobId:'dialog-legacy-original',
        originalCutoutBlobId:'dialog-legacy-recognition',
        candidateFrameBlobId:'dialog-legacy-frame'},
      {...common,id:'dialog-check-modern',title:'RGB+最终蒙版编辑',
        blobId:'dialog-modern-cut',candidateFrameBlobId:'dialog-modern-frame',
        finalMaskBlobId:'dialog-modern-mask'}
    ];
    const alpha=new Uint8Array(12+180*140),view=new DataView(alpha.buffer);
    alpha.set([83,72,77,49]);view.setUint32(4,180,true);view.setUint32(8,140,true);
    for(let y=20;y<120;y++)for(let x=25;x<155;x++)alpha[12+y*180+x]=255;
    const gz=new Blob([await new Response(
      new Blob([alpha]).stream().pipeThrough(new CompressionStream('gzip'))
    ).arrayBuffer()],{type:'application/gzip'});
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(['assets','blobs'],'readwrite');
      for(const a of assets)tx.objectStore('assets').put(a);
      for(const [id,data] of [
        ['dialog-legacy-cut',cut],['dialog-legacy-original',frame],
        ['dialog-legacy-recognition',cut],['dialog-legacy-frame',frame],
        ['dialog-modern-cut',cut],['dialog-modern-frame',frame],
        ['dialog-modern-mask',gz]
      ])tx.objectStore('blobs').put({id,data});
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
    });
    db.close();
  })()`);
  await command('Page.reload');
  await wait('.series-grid');
  await evaluate(`(()=>{
    const dialog=document.querySelector('#modal');
    const phases=[];window.__cutoutDialogPhases=phases;
    const collect=()=>phases.push({
      open:dialog.open,topLayer:dialog.matches(':modal'),
      loading:dialog.classList.contains('cutout-loading-dialog'),
      editor:dialog.classList.contains('cutout-dialog')
    });
    new MutationObserver(collect).observe(dialog,{
      attributes:true,attributeFilter:['open','class']
    });
  })()`);
  const cases=[
    [320,640,'dialog-check-modern','flex'],
    [390,844,'dialog-check-legacy','flex'],
    [768,1024,'dialog-check-modern','grid'],
    [1440,900,'dialog-check-legacy','grid']
  ];
  for(const [width,height,id,expect] of cases){
    await command('Emulation.setDeviceMetricsOverride',{
      width,height,deviceScaleFactor:width<700?2:1,mobile:width<700
    });
    await click('[data-route="library"]');
    if(!(await evaluate('!!document.querySelector(".asset-grid")')))
      await click('.swift-tabs button:nth-child(2)','.asset-grid');
    await click('[data-id="'+id+'"]','.detail-page');
    await evaluate('window.__cutoutDialogPhases.length=0');
    await click('[data-act="detail-check"]');
    await wait('.cutout-modal');
    const result=await painted();
    assertVisible(result,expect);
    await click('[data-cut-step="recognition"]');
    assert.ok((await evaluate('document.querySelector(".cutout-steps .current")?.textContent'))
      .includes('边缘优化'),'editor controls must respond after native handoff');
    assert.equal(await evaluate('document.querySelectorAll(".cutout-bounded-slider button").length'),0);
    const slider=await evaluate(`(()=>{const rect=document.querySelector('#cutout-strength').getBoundingClientRect();
      return {left:rect.left+1,right:rect.right-1,y:rect.top+rect.height/2}})()`);
    await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,
      x:slider.left,y:slider.y,clickCount:1});
    await command('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,
      x:slider.right,y:slider.y});
    await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,
      x:slider.right,y:slider.y,clickCount:1});
    assert.equal(await evaluate('document.querySelector("#cutout-strength")?.value'),'20',
      'Dragging the brush slider reaches the far right endpoint');
    await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,
      x:slider.right,y:slider.y,clickCount:1});
    await command('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,
      x:slider.left,y:slider.y});
    await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,
      x:slider.left,y:slider.y,clickCount:1});
    assert.equal(await evaluate('document.querySelector("#cutout-strength")?.value'),'0.5',
      'Dragging the brush slider reaches the far left endpoint');
    await click('#cutout-cancel');
    assert.equal(await evaluate('document.querySelector("#modal").open'),false);
    await click('[data-act="detail-back"]');
    await wait('.asset-grid');
  }
  assert.deepEqual(b.errors,[],'no unhandled JS exception during handoff');
}finally{
  await b.close();
}
