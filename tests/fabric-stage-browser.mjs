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
  const paintedPoint=await evaluate(`(()=>{const canvas=window.__fabricCanvas,
    r=document.querySelector('.upper-canvas').getBoundingClientRect();
    for(let y=280;y<490;y+=8)for(let x=170;x<510;x+=8){
      const clientX=r.left+r.width*x/600,clientY=r.top+r.height*y/800;
      if(canvas.findTarget(new PointerEvent('pointerdown',{
        clientX,clientY,pointerType:'mouse'}))?.target?.sceneID==='paper-material')
        return {x:clientX,y:clientY};
    }
    return null;
  })()`);
  assert.ok(paintedPoint,'material must expose a painted pixel for selection');
  const {x,y}=paintedPoint;
  const bounds=await evaluate('(()=>{const r=document.querySelector(".upper-canvas").getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height};})()');
  await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,x,y,clickCount:1});
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,x,y,clickCount:1});
  assert.equal(await evaluate('document.querySelector("#events").textContent'),'选中：paper-material');
  const groupHit=await evaluate(`(async()=>{const {selectableFabricObjectAt}=await import('/src/fabric-hit-test.js');
    const canvas=window.__fabricCanvas,group=canvas.getObjects().find(object=>object.sceneID==='paper-group');
    return {visible:selectableFabricObjectAt(canvas,group,{x:100,y:160},{x:100,y:160}),
      masked:selectableFabricObjectAt(canvas,group,{x:300,y:160},{x:300,y:160})};})()`);
  assert.deepEqual(groupHit,{visible:true,masked:false},
    'Tapping a transparent part of a group frame must not select the group');
  assert.deepEqual(await evaluate('Object.keys(window.__fabricCanvas.getActiveObject().controls).sort()'),
    ['br','mb','ml','mr','mt'],
    'One bottom-right control scales and rotates; no second rotate button is drawn');
  await evaluate(`(()=>{
    const canvas=window.__fabricCanvas;
    const material=canvas.getObjects().find(object=>object.sceneID==='paper-material');
    const text=canvas.getObjects().find(object=>object.sceneID==='paper-text');
    const active=canvas.getActiveObjects.bind(canvas);
    canvas.getActiveObjects=()=>[material,text];
    canvas.fire('selection:updated',{selected:[text]});
    canvas.getActiveObjects=active;
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
  const shapePixels=()=>evaluate(`(()=>{const ctx=document.querySelector('.lower-canvas').getContext('2d');
    const pixels=ctx.getImageData(60,105,320,155).data;let hash=2166136261;
    for(let i=0;i<pixels.length;i+=4)hash=Math.imul(hash^pixels[i]^pixels[i+1]^pixels[i+2],16777619);
    return hash>>>0;})()`);
  const shapeBefore=await shapePixels();
  const nestedStart={x:bounds.left+bounds.width*190/600,y:bounds.top+bounds.height*160/800};
  await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,
    clickCount:1,...nestedStart});
  await command('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,
    x:nestedStart.x+24,y:nestedStart.y+12});
  const nestedPreview=await evaluate(`(()=>{
    const group=window.__fabricCanvas.getObjects().find(item=>item.sceneID==='paper-group');
    const child=group.getObjects().find(item=>item.sceneID==='paper-shape');
    return {x:child.calcTransformMatrix()[4],y:child.calcTransformMatrix()[5]};})()`);
  assert.ok(nestedPreview.x>205&&nestedPreview.y>165,
    'Nested content must follow its editing frame before pointer release');
  await sleep(40);
  assert.notEqual(await shapePixels(),shapeBefore,
    'Nested content must repaint on the page during the gesture');
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
  await sleep(40);const beforeCancelPixels=await shapePixels();
  const beforeCancelCommits=await evaluate('window.__fabricFixture.commits.length');
  await evaluate(`document.addEventListener('pointerdown',event=>{
    window.__cancelPointerID=event.pointerId;
  },{capture:true,once:true})`);
  await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,
    clickCount:1,...at(214,160)});
  await command('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,
    ...at(244,175)});
  assert.equal(await evaluate('JSON.stringify(window.__fabricFixture.draft.layers[0].children[0])'),
    beforeCancel,'Lasso drag previews must not modify the authoritative Scene');
  await sleep(40);assert.notEqual(await shapePixels(),beforeCancelPixels,'Lasso drag must still repaint the moving content');
  await evaluate(`(()=>{const upper=document.querySelector('.upper-canvas');
    upper.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,
      pointerId:window.__cancelPointerID,pointerType:'mouse'}));})()`);
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,
    clickCount:1,...at(244,175)});
  assert.equal(await evaluate('JSON.stringify(window.__fabricFixture.draft.layers[0].children[0])'),
    beforeCancel,'Cancelled lasso gesture must preserve the original Scene node');
  assert.equal(await evaluate('window.__fabricFixture.commits.length'),beforeCancelCommits,'Cancelled preview must not commit a change');
  await sleep(40);assert.equal(await shapePixels(),beforeCancelPixels,'Cancelled preview must restore visible content');
  await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,
    clickCount:1,...at(214,160)});
  await command('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,
    ...at(234,170)});
  await click('[data-tool="select"]');
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,
    clickCount:1,...at(234,170)});
  assert.equal(await evaluate('JSON.stringify(window.__fabricFixture.draft.layers[0].children[0])'),
    beforeCancel,'Leaving the lasso tool mid-drag must roll back the preview');
  const textPoint=await evaluate(`(()=>{const canvas=window.__fabricCanvas,
    r=document.querySelector('.upper-canvas').getBoundingClientRect();
    for(let y=505;y<675;y+=4)for(let x=60;x<480;x+=4){
      const clientX=r.left+r.width*x/600,clientY=r.top+r.height*y/800;
      const painted=(dx,dy)=>canvas.findTarget(new PointerEvent('pointerdown',{
        clientX:clientX+dx,clientY:clientY+dy,pointerType:'mouse'}))?.target?.sceneID==='paper-text';
      if([[0,0],[-3,0],[3,0],[0,-3],[0,3]].every(([dx,dy])=>painted(dx,dy)))
        return {x:clientX,y:clientY};
    }
    return null;
  })()`);
  assert.ok(textPoint,'text must expose a painted pixel for selection');
  const textX=textPoint.x,textY=textPoint.y;
  await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,x:textX,y:textY,clickCount:1});
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,x:textX,y:textY,clickCount:1});
  const firstTextSelection=await evaluate(`({active:window.__fabricCanvas.getActiveObject()?.sceneID,
    events:document.querySelector('#events').textContent})`);
  assert.equal(firstTextSelection.active,'paper-text',JSON.stringify(firstTextSelection));
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
  await evaluate(`(()=>{const {draft,refresh}=window.__fabricFixture;
    draft.layers.push({id:'preview-ink',type:'ink',points:[{x:70,y:625},{x:180,y:645}],
      width:7,color:'#315647',zIndex:6000});refresh();})()`);
  await click('[data-tool="select"]');
  await sleep(80);
  await evaluate('window.__fabricFixture.select(["preview-ink"])');
  for(let attempt=0;attempt<40;attempt++){
    if(await evaluate('window.__fabricCanvas.getActiveObject()?.sceneID==="preview-ink"'))break;
    await sleep(25);
  }
  const inkSelection=await evaluate(`({active:window.__fabricCanvas.getActiveObject()?.sceneID,
    events:document.querySelector('#events').textContent,
    proxies:window.__fabricCanvas.getObjects().filter(o=>o.sceneSelectionProxy).map(o=>o.sceneID),
    ink:window.__fabricFixture.draft.layers.find(o=>o.id==='preview-ink')})`);
  assert.equal(inkSelection.active,'preview-ink',JSON.stringify(inkSelection));
  const inkStart=await evaluate(`(()=>{const c=window.__fabricCanvas,
    r=document.querySelector('.upper-canvas').getBoundingClientRect(),
    point=c.getActiveObject().getCenterPoint(),
    ink=c.getObjects().find(item=>item.sceneID==='preview-ink');
    return {x:r.left+point.x*r.width/620,y:r.top+point.y*r.height/800,
      before:ink.calcTransformMatrix()[4]};})()`);
  const inkPixels=()=>evaluate(`(()=>{const ctx=document.querySelector('.lower-canvas').getContext('2d');
    const pixels=ctx.getImageData(50,605,190,65).data;let hash=2166136261;
    for(let i=0;i<pixels.length;i+=4)hash=Math.imul(hash^pixels[i]^pixels[i+1]^pixels[i+2],16777619);
    return hash>>>0;})()`);
  const inkBefore=await inkPixels();
  await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,
    clickCount:1,x:inkStart.x,y:inkStart.y});
  await command('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,
    x:inkStart.x+25,y:inkStart.y+10});
  const inkLive=await evaluate(`window.__fabricCanvas.getObjects()
    .find(item=>item.sceneID==='preview-ink').calcTransformMatrix()[4]`);
  assert.ok(inkLive>inkStart.before+15,'Ink content follows its shared frame during dragging');
  await sleep(40);
  assert.notEqual(await inkPixels(),inkBefore,'Ink pixels repaint during dragging');
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,
    clickCount:1,x:inkStart.x+25,y:inkStart.y+10});
  await evaluate(`(()=>{const {draft,refresh}=window.__fabricFixture;
    draft.layers[0].children.push({id:'grouped-text',type:'text',content:'组合里的文字',
      x:180,y:218,width:180,height:48,fontSize:24,color:'#30463d',zIndex:2});refresh();})()`);
  for(let attempt=0;attempt<40;attempt++){
    if(await evaluate('window.__fabricCanvas.getObjects().find(o=>o.sceneID==="paper-group")?._objects?.some(o=>o.sceneID==="grouped-text")'))break;
    await sleep(25);
  }
  await evaluate('window.__fabricFixture.select(["paper-group"])');
  for(let attempt=0;attempt<40;attempt++){
    if(await evaluate('window.__fabricCanvas.getActiveObject()?.sceneID==="paper-group"'))break;
    await sleep(25);
  }
  assert.deepEqual(await evaluate('Object.keys(window.__fabricCanvas.getActiveObject().controls).sort()'),
    ['br','mb','ml','mr','mt'],'A selected group has the same frame controls as other objects');
  const groupStart=await evaluate(`(()=>{const rect=document.querySelector('.upper-canvas').getBoundingClientRect();
    return {x:rect.left+190*rect.width/620,y:rect.top+160*rect.height/800}})()`);
  const beforeGroupMove=await evaluate(`(()=>{const children=window.__fabricFixture.draft.layers[0].children;
    return children.map(node=>({id:node.id,x:node.x,y:node.y}))})()`);
  await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,
    clickCount:1,...groupStart});
  await command('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,
    x:groupStart.x+25,y:groupStart.y+14});
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,
    x:groupStart.x+25,y:groupStart.y+14,clickCount:1});
  const afterGroupMove=await evaluate(`(()=>{const children=window.__fabricFixture.draft.layers[0].children;
    return {nodes:children.map(node=>({id:node.id,x:node.x,y:node.y})),
      selected:window.__fabricCanvas.getActiveObject()?.sceneID}})()`);
  assert.equal(afterGroupMove.selected,'paper-group','Moving a group keeps its editing frame');
  for(const child of afterGroupMove.nodes){
    const prior=beforeGroupMove.find(node=>node.id===child.id);
    assert.ok(child.x>prior.x+10&&child.y>prior.y+5,
      'Moving a group must carry its '+child.id+' child without moving the paper');
  }
  const groupWidthBefore=await evaluate('window.__fabricFixture.draft.layers[0].children[0].width');
  await evaluate(`(()=>{const canvas=window.__fabricCanvas,group=canvas.getActiveObject();
    group.set({scaleX:1.2,scaleY:1.2});group.setCoords();
    canvas.fire('object:modified',{target:group});})()`);
  assert.ok(await evaluate('window.__fabricFixture.draft.layers[0].children[0].width')>
    groupWidthBefore*1.19,'Resizing the group frame persists its child geometry');
  const stableCoordinates=await evaluate(`(()=>{const c=window.__fabricCanvas;
    return ['paper-material','paper-text'].map(id=>{const o=c.getObjects().find(item=>item.sceneID===id);
      return [o.left,o.top]})})()`);
  await evaluate(`(()=>{const {draft,refresh}=window.__fabricFixture;
    draft.layers.find(node=>node.id==='paper-material').locked=true;refresh();
    window.__fabricFixture.select(['paper-material','paper-text']);})()`);
  await sleep(120);
  assert.equal(await evaluate('window.__fabricCanvas.getActiveObject()?.type'),undefined,
    'An uneditable multi-selection never falls back to a geometry-changing ActiveSelection');
  assert.deepEqual(await evaluate(`(()=>{const c=window.__fabricCanvas;
    return ['paper-material','paper-text'].map(id=>{const o=c.getObjects().find(item=>item.sceneID===id);
      return [o.left,o.top]})})()`),stableCoordinates,
  'Rejecting a mixed locked selection cannot move unrelated projection objects');
  assert.deepEqual(browser.errors,[]);
  await evaluate(`(()=>{
    const f=window.__fabricFixture;
    f.draft.layers.push({id:'delayed-top-level',type:'material',assetID:'fabric-delayed',x:300,y:400,width:100,height:100});
    f.refresh();f.select(['delayed-top-level']);
  })()`);
  await sleep(100);
  assert.equal(await evaluate('window.__fabricCanvas.getObjects().some(o=>o.sceneSelectionProxy)'),false,
    'An undecoded top-level image must never acquire a nested selection proxy');
  await sleep(600);
  assert.deepEqual(await evaluate(`(()=>{const o=window.__fabricCanvas.getActiveObject();return {id:o?.sceneID,proxy:!!o?.sceneSelectionProxy,edges:!!o?.controls.mr};})()`),
    {id:'delayed-top-level',proxy:false,edges:true},'Decoded top-level image keeps its real stretch controls');
  await evaluate(`(()=>{const f=window.__fabricFixture;
    f.draft.layers.push({id:'progressive-material',type:'material',assetID:'fabric-progressive',
      x:430,y:740,width:100,height:100,zIndex:100});f.refresh();f.select(['progressive-material']);})()`);
  for(let attempt=0;attempt<20;attempt++){
    if(await evaluate('window.__fabricCanvas.getObjects().find(o=>o.sceneID==="progressive-material")?.getElement()?.width===16'))break;
    await sleep(10);
  }
  assert.equal(await evaluate('window.__fabricCanvas.getObjects().find(o=>o.sceneID==="progressive-material")?.getElement()?.width'),16,
    'A cover should paint before the sharp material finishes loading');
  for(let attempt=0;attempt<60;attempt++){
    if(await evaluate('window.__fabricCanvas.getObjects().find(o=>o.sceneID==="progressive-material")?.getElement()?.width===512'))break;
    await sleep(25);
  }
  assert.deepEqual(await evaluate(`(()=>{const c=window.__fabricCanvas,o=c.getObjects().find(o=>o.sceneID==='progressive-material');
    return {pixels:o?.getElement()?.width,selected:c.getActiveObject()?.sceneID,
      x:o?.left,y:o?.top};})()`),{pixels:512,selected:'progressive-material',x:430,y:740},
    'The sharp image replaces the cover in place without losing selection');
  const localGroupParity=await evaluate(`(async()=>{
    const {renderSceneCanvas}=await import('/src/scene-renderer.js');
    const f=window.__fabricFixture;
    f.draft.layers=[{id:'local-group',type:'group',zIndex:1,
      localTransform:[0.8660254,0.5,-0.5,0.8660254,260,300],
      layoutBox:{width:180,height:140},children:[
        {id:'local-shape',type:'shape',kind:'ellipse',x:0,y:0,width:90,height:60,
          fill:'#ad5142',zIndex:1}]}];
    f.select([]);f.refresh();
    await new Promise(resolve=>setTimeout(resolve,250));
    const reference=(await renderSceneCanvas(f.draft,{waitForFonts:false})).canvas;
    const actual=document.querySelector('.lower-canvas');
    const a=actual.getContext('2d').getImageData(0,0,600,800).data;
    const b=reference.getContext('2d').getImageData(0,0,600,800).data;
    let total=0;for(let i=0;i<a.length;i+=4)
      total+=Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]);
    const group=window.__fabricCanvas.getObjects().find(o=>o.sceneID==='local-group');
    return {error:total/(600*800*3),group:!!group,
      child:group?.getObjects().some(o=>o.sceneID==='local-shape')};
  })()`);
  assert.ok(localGroupParity.group&&localGroupParity.child&&localGroupParity.error<2,
    'Fabric must display group-local Scene coordinates like the export renderer: '+JSON.stringify(localGroupParity));
  const persistedLocalGroupMove=await evaluate(`(()=>{
    const canvas=window.__fabricCanvas;
    const group=canvas.getObjects().find(o=>o.sceneID==='local-group');
    group.set({left:group.left+34,top:group.top+18});
    group.setCoords();canvas.fire('object:modified',{target:group});
    const node=window.__fabricFixture.draft.layers[0];
    return {matrix:node.localTransform,child:[node.children[0].x,node.children[0].y]};
  })()`);
  assert.ok(persistedLocalGroupMove.matrix[4]>290&&persistedLocalGroupMove.matrix[5]>315,
    'Moving a local group must persist the group transform');
  assert.deepEqual(persistedLocalGroupMove.child,[0,0],
    'Moving a local group must not rewrite child-local coordinates');
  console.log('Fabric stage browser check passed:',JSON.stringify({background,parity,coverParity,weaveParity,inkParity}),
    'screenshots /tmp/shiye-fabric-stage.png and /tmp/shiye-fabric-reference.png');
}finally{await browser.close();}
