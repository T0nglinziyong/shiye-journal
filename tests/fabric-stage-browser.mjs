import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {browserHarness} from './browser-harness.mjs';

const url=process.env.SHIYE_TEST_URL||'http://127.0.0.1:5173';
const browser=await browserHarness('shiye-fabric-stage',url+'/tests/fixtures/fabric-preview.html',
  async({command})=>command('Emulation.setDeviceMetricsOverride',
    {width:1280,height:1000,deviceScaleFactor:1,mobile:false}));
const {command,evaluate,wait,sleep,click}=browser;
try{
  await wait('.upper-canvas');
  await sleep(800);
  const initial=await evaluate('({error:document.querySelector("#events").textContent,width:document.querySelector(".upper-canvas").width,height:document.querySelector(".upper-canvas").height})');
  assert.equal(initial.error,'');
  assert.deepEqual([initial.width,initial.height],[600,800]);
  const background=await evaluate('(()=>{const c=window.__fabricCanvas,b=c.backgroundImage;return {canvas:[c.width,c.height],retina:c.getRetinaScaling(),image:[b.width,b.height],scale:[b.scaleX,b.scaleY],origin:[b.originX,b.originY],position:[b.left,b.top],source:[b.getElement().width,b.getElement().height]};})()');
  const parity=await evaluate(`(async()=>{
    const {renderSceneCanvas}=await import('/src/scene-renderer.js');
    const {draft,image}=window.__fabricFixture;
    const reference=(await renderSceneCanvas(draft,{waitForFonts:false,
      loadMaterialImage:async()=>image})).canvas;
    window.__fabricReference=reference;
    const actual=document.querySelector('.lower-canvas');
    const a=actual.getContext('2d').getImageData(0,0,600,800).data;
    const b=reference.getContext('2d').getImageData(0,0,600,800).data;
    const regions={paper:[0,0,600,800],shape:[60,95,320,235],material:[170,270,510,490],
      text:[60,505,480,675],ink:[75,655,350,755]};
    const report={};
    for(const [name,[left,top,right,bottom]] of Object.entries(regions)){
      let total=0,changed=0;
      for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
        const i=(y*600+x)*4,diff=Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]);
        total+=diff;if(diff>24)changed++;
      }
      report[name]={meanRGBError:total/((right-left)*(bottom-top)*3),
        changedPixelFraction:changed/((right-left)*(bottom-top))};
    }
    report.textShift=[...Array(25)].map((_,index)=>index-12).map(dy=>{
      let total=0;
      for(let y=530;y<665;y++)for(let x=70;x<475;x++){
        const i=((y+dy)*600+x)*4,j=(y*600+x)*4;
        total+=Math.abs(a[i]-b[j])+Math.abs(a[i+1]-b[j+1])+Math.abs(a[i+2]-b[j+2]);
      }
      return {dy,error:total/(405*135*3)};
    }).sort((a,b)=>a.error-b.error).slice(0,3);
    return report;
  })()`);
  assert.ok(parity.paper.meanRGBError<1,JSON.stringify(parity));
  assert.ok(parity.shape.meanRGBError<1,JSON.stringify(parity));
  assert.ok(parity.material.meanRGBError<.1,JSON.stringify(parity));
  assert.ok(parity.text.meanRGBError<5,JSON.stringify(parity));
  assert.ok(parity.ink.meanRGBError<1,JSON.stringify(parity));
  const coverParity=await evaluate(`(async()=>{
    const {renderSceneCanvas}=await import('/src/scene-renderer.js');
    const {renderWorkCoverSnapshot}=await import('/src/work-cover-snapshot.js');
    const {draft,image}=window.__fabricFixture;
    const source=image.toDataURL();
    const decode=async url=>{const result=new Image();result.src=url;await result.decode();return result;};
    const cover=await renderWorkCoverSnapshot({id:'parity-work',drafts:[draft],activeDraftID:draft.id},{
      resolveAsset:async()=>({staticPath:source}),decodeStatic:decode,renderScene:renderSceneCanvas
    });
    const bitmap=await createImageBitmap(cover);
    const expected=(await renderSceneCanvas(draft,{scale:480/800,
      loadMaterialImage:async()=>image})).canvas;
    const actual=document.createElement('canvas');actual.width=bitmap.width;actual.height=bitmap.height;
    actual.getContext('2d').drawImage(bitmap,0,0);bitmap.close();
    const a=actual.getContext('2d').getImageData(0,0,actual.width,actual.height).data;
    const b=expected.getContext('2d').getImageData(0,0,expected.width,expected.height).data;
    let total=0;for(let i=0;i<a.length;i+=4)
      total+=Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]);
    return {width:actual.width,height:actual.height,meanRGBError:total/(a.length/4*3)};
  })()`);
  assert.deepEqual([coverParity.width,coverParity.height],[360,480]);
  assert.ok(coverParity.meanRGBError<7,`Cover differs from PNG renderer: ${JSON.stringify(coverParity)}`);
  await evaluate(`(()=>{const {draft,refresh}=window.__fabricFixture;
    draft.layers.push({id:'woven-material',type:'material',assetID:'fabric-sample',
      x:360,y:400,width:240,height:144,zIndex:1.5,
      craftDisplaySlices:[{id:'front',kind:'two-hole-weave',targetId:'paper-material',
        geometryRatio:[[[[0,0],[.5,0],[.5,1],[0,1]]]],zOffset:2}]});
    refresh();})()`);
  await sleep(300);
  const weaveParity=await evaluate(`(async()=>{
    const {renderSceneCanvas}=await import('/src/scene-renderer.js');
    const {draft,image}=window.__fabricFixture;
    const reference=(await renderSceneCanvas(draft,{waitForFonts:false,
      loadMaterialImage:async()=>image})).canvas;
    const actual=document.querySelector('.lower-canvas');
    const a=actual.getContext('2d').getImageData(0,0,600,800).data;
    const b=reference.getContext('2d').getImageData(0,0,600,800).data;
    let total=0;for(let i=0;i<a.length;i+=4)
      total+=Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]);
    return {pieces:window.__fabricCanvas.getObjects().filter(item=>item.sceneID==='woven-material').length,
      meanRGBError:total/(600*800*3)};
  })()`);
  assert.equal(weaveParity.pieces,2,'One physical material needs two display projections');
  assert.ok(weaveParity.meanRGBError<3,`Woven material differs from export: ${JSON.stringify(weaveParity)}`);
  await evaluate(`(()=>{const {draft,refresh}=window.__fabricFixture;
    draft.layers=draft.layers.filter(node=>node.id!=='woven-material');refresh();})()`);
  await sleep(150);
  await evaluate(`(()=>{
    const {draft,refresh}=window.__fabricFixture;
    window.__oldMaterial=window.__fabricCanvas.getObjects().find(object=>object.sceneID==='paper-material');
    draft.layers.find(node=>node.id==='paper-material').assetID='fabric-delayed';
    refresh();
  })()`);
  assert.equal(await evaluate('window.__fabricCanvas.getObjects().find(object=>object.sceneID==="paper-material")===window.__oldMaterial'),true);
  await sleep(150);
  assert.equal(await evaluate('window.__fabricCanvas.getObjects().find(object=>object.sceneID==="paper-material")===window.__oldMaterial'),true);
  await sleep(300);
  assert.equal(await evaluate('window.__fabricCanvas.getObjects().find(object=>object.sceneID==="paper-material")===window.__oldMaterial'),false);
  const bounds=await evaluate('(()=>{const r=document.querySelector(".upper-canvas").getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height};})()');
  const x=bounds.left+bounds.width*340/600,y=bounds.top+bounds.height*380/800;
  await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,x,y,clickCount:1});
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,x,y,clickCount:1});
  assert.equal(await evaluate('document.querySelector("#events").textContent'),'选中：paper-material');
  assert.deepEqual(await evaluate('Object.keys(window.__fabricCanvas.getActiveObject().controls).sort()'),
    ['br','mb','ml','mr','mt'],
    'One bottom-right control scales and rotates; no second rotate button is drawn');
  await evaluate(`(()=>{
    const canvas=window.__fabricCanvas;
    const material=canvas.getObjects().find(object=>object.sceneID==='paper-material');
    const text=canvas.getObjects().find(object=>object.sceneID==='paper-text');
    canvas.setActiveObject(new window.__fabricActiveSelection([material,text],{canvas}));
    canvas.fire('selection:updated',{selected:[text]});
  })()`);
  assert.equal(await evaluate('document.querySelector("#events").textContent'),
    '选中：paper-material, paper-text',
    'Selection updates must report every active object, not only the newly selected one');
  await evaluate('window.__fabricCanvas.discardActiveObject();window.__fabricCanvas.requestRenderAll()');
  await evaluate('window.__fabricFixture.select(["paper-shape"])');
  for(let attempt=0;attempt<40;attempt++){
    if(await evaluate('window.__fabricCanvas.getActiveObject()?.sceneMultiIDs?.[0]==="paper-shape"'))break;
    await sleep(25);
  }
  assert.equal(await evaluate('window.__fabricCanvas.getActiveObject()?.sceneMultiIDs?.[0]'),
    'paper-shape','Selecting a nested layer must show a movable canvas frame');
  const nestedStart={x:bounds.left+bounds.width*190/600,y:bounds.top+bounds.height*160/800};
  await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,
    clickCount:1,...nestedStart});
  await command('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,
    x:nestedStart.x+24,y:nestedStart.y+12});
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,
    clickCount:1,x:nestedStart.x+24,y:nestedStart.y+12});
  assert.ok(Math.abs(await evaluate('window.__fabricFixture.draft.layers[0].children[0].x')-214)<1,
    'Dragging a nested selection must persist its Scene position');
  await evaluate('window.__fabricFixture.select([])');
  await click('[data-tool="lasso"]');
  const at=(px,py)=>({x:bounds.left+bounds.width*px/600,
    y:bounds.top+bounds.height*py/800});
  const lassoPath=[[80,90],[350,90],[350,235],[80,235],[80,90]];
  await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,
    clickCount:1,...at(...lassoPath[0])});
  for(const point of lassoPath.slice(1))await command('Input.dispatchMouseEvent',{
    type:'mouseMoved',button:'left',buttons:1,...at(...point)});
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,
    clickCount:1,...at(...lassoPath.at(-1))});
  assert.equal(await evaluate('document.querySelector("#events").textContent'),
    '选中：paper-shape','Lasso must select the nested shape');
  const beforeCancel=await evaluate('JSON.stringify(window.__fabricFixture.draft.layers[0].children[0])');
  await evaluate(`document.addEventListener('pointerdown',event=>{
    window.__cancelPointerID=event.pointerId;
  },{capture:true,once:true})`);
  await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,
    clickCount:1,...at(214,160)});
  await command('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,
    ...at(244,175)});
  assert.notEqual(await evaluate('JSON.stringify(window.__fabricFixture.draft.layers[0].children[0])'),
    beforeCancel,'Lasso drag should preview a Scene change');
  await evaluate(`(()=>{const upper=document.querySelector('.upper-canvas');
    upper.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,
      pointerId:window.__cancelPointerID,pointerType:'mouse'}));})()`);
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,
    clickCount:1,...at(244,175)});
  assert.equal(await evaluate('JSON.stringify(window.__fabricFixture.draft.layers[0].children[0])'),
    beforeCancel,'Cancelled lasso gesture must restore the original Scene node');
  await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,
    clickCount:1,...at(214,160)});
  await command('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,
    ...at(234,170)});
  await click('[data-tool="select"]');
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,
    clickCount:1,...at(234,170)});
  assert.equal(await evaluate('JSON.stringify(window.__fabricFixture.draft.layers[0].children[0])'),
    beforeCancel,'Leaving the lasso tool mid-drag must roll back the preview');
  const textX=bounds.left+bounds.width*270/600,textY=bounds.top+bounds.height*590/800;
  await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,x:textX,y:textY,clickCount:1});
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,x:textX,y:textY,clickCount:1});
  await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,x:textX,y:textY,clickCount:2});
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,x:textX,y:textY,clickCount:2});
  assert.equal(await evaluate('window.__fabricCanvas.getActiveObject()?.sceneID'),'paper-text');
  assert.equal(await evaluate('!!window.__fabricCanvas.getActiveObject()?.isEditing'),true);
  await command('Input.insertText',{text:'新'});
  assert.ok(await evaluate('window.__fabricFixture.draft.layers.find(node=>node.id==="paper-text").content.includes("新")'));
  const screenshot=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile('/tmp/shiye-fabric-stage.png',Buffer.from(screenshot.data,'base64'));
  await evaluate(`(()=>{
    const stage=document.querySelector('.canvas-container'),r=stage.getBoundingClientRect();
    stage.style.visibility='hidden';
    const reference=window.__fabricReference;
    Object.assign(reference.style,{position:'fixed',left:r.left+'px',top:r.top+'px',zIndex:'10'});
    document.body.append(reference);
  })()`);
  const referenceShot=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile('/tmp/shiye-fabric-reference.png',Buffer.from(referenceShot.data,'base64'));
  await evaluate('(()=>{window.__fabricReference.remove();document.querySelector(".canvas-container").style.visibility="";})()');
  const stroke=async(start,end)=>{
    const from={x:bounds.left+bounds.width*start.x/600,y:bounds.top+bounds.height*start.y/800};
    const to={x:bounds.left+bounds.width*end.x/600,y:bounds.top+bounds.height*end.y/800};
    await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...from});
    for(let i=1;i<=12;i++)await command('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,
      x:from.x+(to.x-from.x)*i/12,y:from.y+(to.y-from.y)*i/12});
    await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,...to});
  };
  await evaluate('document.querySelector("[data-tool=pen]").click()');
  await stroke({x:100,y:760},{x:300,y:760});
  assert.equal(await evaluate('window.__fabricFixture.draft.layers.flatMap(node=>node.type==="group"?node.children:[node]).filter(node=>node.penStyle==="pressure").length'),1);
  const inkParity=await evaluate(`(async()=>{
    const {renderSceneCanvas}=await import('/src/scene-renderer.js');
    const {draft,image}=window.__fabricFixture;
    const reference=(await renderSceneCanvas(draft,{waitForFonts:false,
      loadMaterialImage:async()=>image})).canvas;
    const a=document.querySelector('.lower-canvas').getContext('2d').getImageData(0,735,600,55).data;
    const b=reference.getContext('2d').getImageData(0,735,600,55).data;
    let total=0;for(let i=0;i<a.length;i+=4)
      total+=Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]);
    return total/(600*55*3);
  })()`);
  assert.ok(inkParity<1,`New pressure stroke differs from export: ${inkParity}`);
  await evaluate('document.querySelector("[data-tool=eraser]").click()');
  await stroke({x:200,y:745},{x:200,y:775});
  assert.equal(await evaluate('window.__fabricFixture.draft.layers.flatMap(node=>node.type==="group"?node.children:[node]).filter(node=>node.penStyle==="pressure").length'),2);
  await evaluate(`(()=>{
    const {draft,refresh}=window.__fabricFixture;
    const protectedInk=id=>({id,type:'ink',points:[{x:150,y:760},{x:250,y:760}],
      width:7,color:'#aa6655',zIndex:5000});
    draft.layers.push({...protectedInk('locked-ink'),locked:true});
    draft.layers.push({id:'hidden-ink-group',type:'group',zIndex:5001,hidden:true,
      children:[protectedInk('hidden-ink')]});
    draft.layers.push({id:'locked-ink-group',type:'group',zIndex:5002,isLocked:true,
      children:[protectedInk('nested-locked-ink')]});
    refresh();
  })()`);
  await sleep(150);
  const protectedBefore=await evaluate(`JSON.stringify(window.__fabricFixture.draft.layers
    .filter(node=>['locked-ink','hidden-ink-group','locked-ink-group'].includes(node.id)))`);
  await stroke({x:200,y:745},{x:200,y:775});
  const protectedAfter=await evaluate(`JSON.stringify(window.__fabricFixture.draft.layers
    .filter(node=>['locked-ink','hidden-ink-group','locked-ink-group'].includes(node.id)))`);
  assert.equal(protectedAfter,protectedBefore,'Eraser must preserve hidden and locked handwriting');
  await evaluate(`(()=>{
    const {draft,refresh}=window.__fabricFixture;
    draft.layers.push({id:'external-layer',type:'shape',kind:'ellipse',x:500,y:80,
      width:70,height:50,fill:'#f3bb91',stroke:'#74543d',lineWidth:2,zIndex:10000});
    refresh();
  })()`);
  await sleep(150);
  assert.ok(await evaluate('window.__fabricCanvas.getObjects().some(item=>item.sceneID==="external-layer")'));
  await evaluate(`(()=>{
    const {draft,refresh}=window.__fabricFixture;
    draft.layers.find(node=>node.id==='external-layer').zIndex=-1;
    refresh();
  })()`);
  await sleep(150);
  assert.equal(await evaluate('window.__fabricCanvas.getObjects()[0]?.sceneID'),'external-layer');
  await evaluate(`(()=>{
    const {draft,refresh}=window.__fabricFixture;
    draft.layers=draft.layers.filter(node=>node.id!=='external-layer');
    refresh();
  })()`);
  await sleep(150);
  assert.equal(await evaluate('window.__fabricCanvas.getObjects().some(item=>item.sceneID==="external-layer")'),false);
  await evaluate(`(()=>{
    const {draft,refresh}=window.__fabricFixture;
    draft.paperPattern='plain';draft.canvas.width=620;refresh();
  })()`);
  await sleep(150);
  assert.deepEqual(await evaluate('[window.__fabricCanvas.width,window.__fabricCanvas.backgroundImage.getElement().width]'),[620,620]);
  assert.deepEqual(browser.errors,[]);
  console.log('Fabric stage browser check passed:',JSON.stringify({background,parity,coverParity,weaveParity,inkParity}),
    'screenshots /tmp/shiye-fabric-stage.png and /tmp/shiye-fabric-reference.png');
}finally{await browser.close();}
