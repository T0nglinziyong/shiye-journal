import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {browserHarness} from './browser-harness.mjs';

const url=process.env.SHIYE_TEST_URL||'http://127.0.0.1:5173';
const browser=await browserHarness('shiye-fabric-stage',url+'/tests/fixtures/fabric-preview.html',
  async({command})=>command('Emulation.setDeviceMetricsOverride',
    {width:1280,height:1000,deviceScaleFactor:1,mobile:false}));
const {command,evaluate,wait,sleep}=browser;
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
  assert.equal(await evaluate('window.__fabricFixture.draft.layers.filter(node=>node.penStyle==="pressure").length'),1);
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
  assert.equal(await evaluate('window.__fabricFixture.draft.layers.filter(node=>node.penStyle==="pressure").length'),2);
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
  console.log('Fabric stage browser check passed:',JSON.stringify({background,parity,inkParity}),
    'screenshots /tmp/shiye-fabric-stage.png and /tmp/shiye-fabric-reference.png');
}finally{await browser.close();}
