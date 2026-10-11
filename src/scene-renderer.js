import {sceneRenderEntries} from './craft-display.js';
import {validateSceneExtensions,sceneLayerStyle,applyVectorMask} from './scene-model.js';
import {clipMaterial} from './material-mask.js';
import {drawPaper} from './paper-rendering.js';
import {shapeSVG,drawInk,textFont,textLines,textFontFamily} from './editor-tools-model.js';
import {craftSceneHash} from './craft-fingerprint.js';

export const SCENE_RENDERER_VERSION='shiye-canvas-v2';
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
 const decoded=new Map(),shapes=new Map();
 for(const {kind,value:item} of sceneRenderEntries(draft)){
  ctx.save();ctx.translate(item.x,item.y);ctx.rotate((item.rotation||0)*Math.PI/180);ctx.globalAlpha=item.opacity??1;
   const style=sceneLayerStyle(item);ctx.globalCompositeOperation=style.blendMode==='multiply'?'multiply':'source-over';
   if(style.mask)applyVectorMask(ctx,style.mask,item.width,item.height);
  try{
   if(kind==='material'){
    if(!decoded.has(item.assetID))decoded.set(item.assetID,Promise.resolve(loadMaterialImage?.(item.assetID,item)));
    const image=await decoded.get(item.assetID);if(!image)throw Error('缺少素材图像：'+item.assetID);
    const w=image.naturalWidth||image.width,h=image.naturalHeight||image.height;if(!(w>0&&h>0))throw Error('素材图像尺寸无效');
    ctx.scale(item.isFlippedHorizontally?-1:1,1);clipMaterial(ctx,item);
    const crop=item.cropRect||{x:0,y:0,width:1,height:1};
    ctx.drawImage(image,crop.x*w,crop.y*h,crop.width*w,crop.height*h,-item.width/2,-item.height/2,item.width,item.height);
   }else if(kind==='shape'){
    const svg=shapeSVG(item);if(!shapes.has(svg))shapes.set(svg,loadShapeImage('data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg)));
    ctx.drawImage(await shapes.get(svg),-item.width/2,-item.height/2,item.width,item.height);
   }else{
    ctx.fillStyle=item.color;ctx.font=textFont(item);ctx.letterSpacing=(item.letterSpacing||0)+'px';ctx.textAlign=item.alignment||'left';ctx.textBaseline='alphabetic';
    const left=ctx.textAlign==='center'?0:ctx.textAlign==='right'?item.width/2:-item.width/2;
    for(const line of textLines(item,text=>ctx.measureText(text).width).lines){
     const y=-item.height/2+item.fontSize+line.y;ctx.fillText(line.text,left,y);
     if(item.underline||item.strikethrough){
      const length=ctx.measureText(line.text).width,x=ctx.textAlign==='center'?-length/2:ctx.textAlign==='right'?item.width/2-length:-item.width/2;
      ctx.strokeStyle=item.color;ctx.lineWidth=Math.max(1,item.fontSize/18);
      for(const offset of [item.underline?2:null,item.strikethrough?-item.fontSize*.35:null].filter(v=>v!==null)){ctx.beginPath();ctx.moveTo(x,y+offset);ctx.lineTo(x+length,y+offset);ctx.stroke();}
     }
    }
   }
  }finally{ctx.restore();}
 }
 drawInk(ctx,draft.strokes||[]);
 return {canvas,report:{rendererVersion:SCENE_RENDERER_VERSION,sceneHash:craftSceneHash(draft),width,height,fontProfile,resources:'provided-source-images'}};
}
