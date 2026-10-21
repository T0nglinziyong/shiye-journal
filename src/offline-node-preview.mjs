import {sceneLayerEntries} from './scene-v2.js';
import {renderSceneCanvas} from './scene-renderer.js';
import {auditOfflineCanvasDraft} from './offline-canvas-audit.js';
import {previewImageFormat} from './offline-preview.js';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const require=createRequire(resolve(process.cwd(),'package.json'));

function identifyCanvasBackend(module){
  // A small module named "canvas" may merely adapt another renderer. Only
  // report node-canvas when its native binding and public package API exist.
  try{
    const binding=require.resolve('canvas/build/Release/canvas.node');
    if(binding&&typeof module.registerFont==='function'&&typeof module.Canvas==='function'&&module.version==='3.2.3')return 'node-canvas@3.2.3';
  }catch{}
  return 'unverified-canvas-adapter';
}

export async function loadOfflineCanvas(){
  try{
    const module=await import('canvas');
    if(typeof module.createCanvas!=='function'||typeof module.loadImage!=='function')throw Error('canvas 接口不完整');
    return {...module,rendererBackend:identifyCanvasBackend(module)};
  }catch(error){
    throw Error('当前 Node 环境缺少 Canvas 渲染器。请在任务包目录执行 npm install 后先运行 runtime/self-test.cjs；原错误：'+error.message);
  }
}

export async function renderOfflinePNG(draft,source,previews,canvasModule,{decodedCache}={}){
  const {createCanvas,loadImage}=canvasModule;
  const sources=new Map(source.materials.map(m=>[m.assetID,previews[m.alias]]));
  const used=[...new Set(sceneLayerEntries(draft).filter(e=>e.kind==='material'&&!e.value.isParked).map(e=>e.value.assetID))];
  for(const id of used)if(!previewImageFormat(sources.get(id)))throw Error('缺少本次素材 PNG/WebP 预览：'+id);
  const decoded=decodedCache||new Map();
  const result=await renderSceneCanvas(draft,{waitForFonts:false,createCanvas:()=>createCanvas(1,1),
    // node-canvas accepts SVG bytes here, but its data: URL decoder rejects
    // the charset form emitted by the shared browser renderer.
    loadShapeImage:(url,shape)=>{
      const svg=decodeURIComponent(url.slice(url.indexOf(',')+1));
      const width=Math.max(1,Math.round(shape.width)),height=Math.max(1,Math.round(shape.height));
      return loadImage(Buffer.from(svg.replace('<svg ',`<svg width="${width}" height="${height}" `)));
    },
    loadMaterialImage:id=>{
      if(!decoded.has(id))decoded.set(id,loadImage(Buffer.from(sources.get(id))));
      return decoded.get(id);
    }});
  const png=result.canvas.toBuffer('image/png');
  const geometry=auditOfflineCanvasDraft(draft,{createCanvas:()=>createCanvas(1,1)});
  return {png,report:{...result.report,...geometry,visibleSourceCount:used.length,decodedSourceCount:decoded.size,
    visualReview:'manual-required',fontReview:'environment-dependent',rendererBackend:canvasModule.rendererBackend||'unverified-canvas-adapter'}};
}
