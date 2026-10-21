import {findOfflineChromium,renderChromiumPNG} from './offline-chromium-preview.mjs';
import {sceneLayerEntries} from './scene-v2.js';
import {renderSceneCanvas} from './scene-renderer.js';
import {auditOfflineCanvasDraft} from './offline-canvas-audit.js';
import {previewImageFormat} from './offline-preview.js';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const require=createRequire(resolve(process.cwd(),'package.json'));

function identifyCanvasBackend(module){
 try{
  const binding=require.resolve('canvas/build/Release/canvas.node');
  if(binding&&typeof module.registerFont==='function'&&typeof module.Canvas==='function'&&module.version==='3.2.3')return 'node-canvas@3.2.3';
 }catch{}
 return 'unverified-canvas-adapter';
}
export async function loadOfflineCanvas(){
 const requested=process.env.SHIYE_RENDERER||'auto';
 if(!['auto','node','browser'].includes(requested))throw Error('SHIYE_RENDERER 只能是 auto/node/browser');
 let reason='';
 if(requested!=='browser')try{
  const module=await import('canvas');
  if(typeof module.createCanvas!=='function'||typeof module.loadImage!=='function')throw Error('canvas 接口不完整');
  return {...module,rendererBackend:identifyCanvasBackend(module)};
 }catch(error){reason=error.message;if(requested==='node')throw Error('Node Canvas 不可用。执行 npm install 后运行 node runtime/shiye.cjs self-test；'+reason);}
 const browser=findOfflineChromium();
 if(browser)return {...browser,renderPNG:(draft,source,images)=>renderChromiumPNG(draft,source,images,browser)};
 throw Error('没有可用的确定性渲染器。安装 Node Canvas（npm install），或安装 Chromium 并设置 SHIYE_CHROMIUM_PATH；然后运行 node runtime/shiye.cjs self-test。'+reason);
}
export async function renderOfflinePNG(draft,source,previews,canvasModule,{decodedCache}={}){
 if(canvasModule.renderPNG)return canvasModule.renderPNG(draft,source,previews);
 const {createCanvas,loadImage}=canvasModule,sources=new Map(source.materials.map(m=>[m.assetID,previews[m.alias]]));
 const used=[...new Set(sceneLayerEntries(draft).filter(e=>e.kind==='material'&&!e.value.isParked).map(e=>e.value.assetID))];
 for(const id of used)if(!previewImageFormat(sources.get(id)))throw Error('缺少本次素材 PNG/WebP 预览：'+id);
 const decoded=decodedCache||new Map();
 const result=await renderSceneCanvas(draft,{waitForFonts:false,createCanvas:()=>createCanvas(1,1),
  loadShapeImage:(url,shape)=>{
   const svg=decodeURIComponent(url.slice(url.indexOf(',')+1)),width=Math.max(1,Math.round(shape.width)),height=Math.max(1,Math.round(shape.height));
   return loadImage(Buffer.from(svg.replace('<svg ',`<svg width="${width}" height="${height}" `)));
  },
  loadMaterialImage:id=>{if(!decoded.has(id))decoded.set(id,loadImage(Buffer.from(sources.get(id))));return decoded.get(id);}
 });
 const png=result.canvas.toBuffer('image/png'),geometry=auditOfflineCanvasDraft(draft,{createCanvas:()=>createCanvas(1,1)});
 return {png,report:{...result.report,...geometry,visibleSourceCount:used.length,decodedSourceCount:decoded.size,visualReview:'manual-required',fontReview:'environment-dependent',rendererBackend:canvasModule.rendererBackend||'unverified-canvas-adapter'}};
}
