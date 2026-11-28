import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {browserHarness} from './browser-harness.mjs';
const browser=await browserHarness('shiye-paper-surface',(process.env.SHIYE_TEST_URL||'http://127.0.0.1:5173')+'/tests/fixtures/fabric-preview.html');
try{
 await browser.wait('.upper-canvas');
 const report=await browser.evaluate(`(async()=>{
  const {createFabricSceneBridge}=await import('/src/fabric-scene-bridge.js'),fabric=await import('/node_modules/.vite/deps/fabric.js');
  const {renderSceneCanvas}=await import('/src/scene-renderer.js');
  const original={id:'paper',type:'shape',kind:'rectangle',x:160,y:140,width:240,height:180,rotation:0,fill:'#D6DFCF',stroke:null,lineWidth:0,paperSurface:{kind:'torn',intensity:.6,seed:17,unitScale:5}};
  const reports=[];for(const node of [original,{...original,kind:'paper',paperSurface:undefined,shapeOptions:{paperPattern:'grid',torn:true,translucency:.45,grain:.8,rows:12,columns:8}}]){
  const bridge=createFabricSceneBridge(fabric),object=await bridge.fromNode(node),element=document.createElement('canvas');
  const stage=new fabric.StaticCanvas(element,{width:320,height:280,enableRetinaScaling:false});stage.add(object);stage.renderAll();
  const page={sceneVersion:2,canvas:{width:320,height:280},physicalPageHeightMM:56,paperColor:'#FFFFFF',paperPattern:'plain',layers:[node]};
  const exported=(await renderSceneCanvas(page,{waitForFonts:false})).canvas;
  const flat=document.createElement('canvas');flat.width=320;flat.height=280;const ctx=flat.getContext('2d');ctx.fillStyle='#FFFFFF';ctx.fillRect(0,0,320,280);ctx.drawImage(element,0,0);
  const a=ctx.getImageData(0,0,320,280).data,b=exported.getContext('2d').getImageData(0,0,320,280).data;
  let total=0;for(let i=0;i<a.length;i+=4)total+=Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]);
  const out={meanRGBError:total/(320*280*3),objectType:object.type,paperSurface:node.paperSurface};stage.dispose();reports.push(out);}
  return reports;
 })()`);
 for(const row of report){assert.equal(row.objectType,'image');assert.ok(row.meanRGBError<1,JSON.stringify(row));}assert.deepEqual(browser.errors,[]);
 await writeFile('/tmp/shiye-paper-browser-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
