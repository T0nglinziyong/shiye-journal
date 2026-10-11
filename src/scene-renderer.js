import {sceneDisplaySiblings} from './craft-display.js';
import {validateSceneExtensions,sceneLayerStyle,applyVectorMask} from './scene-model.js';
import {clipMaterial} from './material-mask.js';
import {drawPaper} from './paper-rendering.js';
import {shapeSVG,drawInk,textFont,textLines,textFontFamily} from './editor-tools-model.js';
import {craftSceneHash} from './craft-fingerprint.js';

export const SCENE_RENDERER_VERSION='shiye-scene-v2';
export async function decodeSceneImage(source){
 const image=new Image();image.src=source;
 await image.decode();if(!image.naturalWidth)throw Error('素材图像未解码，不能生成缺图预览');return image;
}
export async function prepareSceneFonts(draft){
 const fonts=globalThis.document?.fonts;
 const requested=[...new Set((draft.textBlocks||[]).map(textFontFamily))];
 if(!fonts)return {status:'environment-unavailable',families:requested};
 await Promise.all((draft.textBlocks||[]).map(t=>fonts.load(textFont(t),String(t.content||'示例'))));
 await fonts.ready;
 return {status:'environment-fonts-loaded',families:requested,note:'同一字体名称不证明跨设备字体文件一致'};
}
export async function renderSceneCanvas(draft,{scale=1,loadMaterialImage,createCanvas=()=>document.createElement('canvas'),loadShapeImage=decodeSceneImage,waitForFonts=true}={}){
 if(!Number.isFinite(scale)||scale<=0||scale>8)throw Error('画面输出比例无效');
 validateSceneExtensions(draft);
 const width=Math.round(draft.canvas.width*scale),height=Math.round(draft.canvas.height*scale);
 if(width<1||height<1||width*height>32_000_000)throw Error('画面输出超过像素预算');
 const fontProfile=waitForFonts?await prepareSceneFonts(draft):{status:'not-checked'};
 const canvas=createCanvas();canvas.width=width;canvas.height=height;
 const ctx=canvas.getContext('2d');if(!ctx)throw Error('无法创建画布');ctx.scale(scale,scale);drawPaper(ctx,draft);
 const decoded=new Map(),shapes=new Map(),drawMaterial=async(item,target)=>{
   if(!decoded.has(item.assetID))decoded.set(item.assetID,Promise.resolve(loadMaterialImage?.(item.assetID,item)));
   const image=await decoded.get(item.assetID);if(!image)throw Error('缺少素材图像：'+item.assetID);
   const w=image.naturalWidth||image.width,h=image.naturalHeight||image.height;if(!(w>0&&h>0))throw Error('素材图像尺寸无效');
   target.scale(item.isFlippedHorizontally?-1:1,1);
   const style=sceneLayerStyle(item);if(style.mask)applyVectorMask(target,style.mask,item.width,item.height);
   clipMaterial(target,item);
   const crop=item.cropRect||{x:0,y:0,width:1,height:1};
   target.drawImage(image,crop.x*w,crop.y*h,crop.width*w,crop.height*h,-item.width/2,-item.height/2,item.width,item.height);
 };
 const drawLeaf=async(kind,item,target)=>{
   target.save();
   try{
     if(kind==='ink'){target.globalAlpha=item.opacity??1;target.globalCompositeOperation=(item.blendMode==='multiply'?'multiply':'source-over');drawInk(target,[item]);return;}
     target.translate(item.x,item.y);target.rotate((item.rotation||0)*Math.PI/180);
     target.globalAlpha=item.opacity??1;
     const style=sceneLayerStyle(item);
     target.globalCompositeOperation=style.blendMode==='multiply'?'multiply':'source-over';
     if(style.mask&&kind!=='material')applyVectorMask(target,style.mask,item.width,item.height);
     if(kind==='material')await drawMaterial(item,target);
     else if(kind==='shape'){
       const svg=shapeSVG(item);
       if(!shapes.has(svg))shapes.set(svg,loadShapeImage('data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg)));
       target.drawImage(await shapes.get(svg),-item.width/2,-item.height/2,item.width,item.height);
     }else if(kind==='text'){
       target.fillStyle=item.color;target.font=textFont(item);target.letterSpacing=(item.letterSpacing||0)+'px';target.textAlign=item.alignment||'left';target.textBaseline='alphabetic';
       const left=target.textAlign==='center'?0:target.textAlign==='right'?item.width/2:-item.width/2;
       for(const line of textLines(item,text=>target.measureText(text).width).lines){
         const y=-item.height/2+item.fontSize+line.y;target.fillText(line.text,left,y);
         if(item.underline||item.strikethrough){
           const length=target.measureText(line.text).width,x=target.textAlign==='center'?-length/2:target.textAlign==='right'?item.width/2-length:-item.width/2;
           target.strokeStyle=item.color;target.lineWidth=Math.max(1,item.fontSize/18);
           for(const offset of [item.underline?2:null,item.strikethrough?-item.fontSize*.35:null].filter(v=>v!==null)){target.beginPath();target.moveTo(x,y+offset);target.lineTo(x+length,y+offset);target.stroke();}
         }
       }
     }
   }finally{target.restore();}
 };
 let isolatedGroups=0;
 const drawTree=async(nodes,target,depth=0)=>{
   if(depth>8)throw Error('图层组嵌套超过渲染预算');
   // Physical weave display fragments are projections of one stock item.
   const expanded=sceneDisplaySiblings(nodes).map(node=>({type:node.type,value:node}));
   for(const entry of expanded){
     const node=entry.value;
     if(node.hidden||node.isHidden||node.isParked||node.parked)continue;
     if(entry.type!=='group'){await drawLeaf(entry.type,node,target);continue;}
     const style=sceneLayerStyle(node);
     const isolate=(node.opacity??1)!==1||style.blendMode!=='normal'||!!style.mask;
     if(!isolate){await drawTree(node.children||[],target,depth+1);continue;}
     if(++isolatedGroups>8)throw Error('复杂图层组超出高清渲染预算（最多 8 个隔离组）');
     const surface=createCanvas();surface.width=width;surface.height=height;
     const inner=surface.getContext('2d');if(!inner)throw Error('无法创建图层组合缓冲');
     inner.scale(scale,scale);await drawTree(node.children||[],inner,depth+1);
     target.save();
     try{
       target.globalAlpha=node.opacity??1;
       target.globalCompositeOperation=style.blendMode==='multiply'?'multiply':'source-over';
       if(style.mask){
         target.translate(draft.canvas.width/2,draft.canvas.height/2);
         applyVectorMask(target,style.mask,draft.canvas.width,draft.canvas.height);
         target.translate(-draft.canvas.width/2,-draft.canvas.height/2);
       }
       target.drawImage(surface,0,0,draft.canvas.width,draft.canvas.height);
     }finally{target.restore();}
   }
 };
 await drawTree(draft.layers,ctx);
 return {canvas,report:{rendererVersion:'shiye-scene-v2',sceneHash:craftSceneHash(draft),width,height,fontProfile,resources:'provided-source-images',isolatedGroups}};
}
