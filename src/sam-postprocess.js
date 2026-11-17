import {visionTask} from './vision-runtime.js';
import {sourcePixels} from './recognition-raster.js';
import {mergeSamRegions} from './sam-region-merge.js';
import {splitSources,splitBySource} from './sam-region-split.js';
import {detectRemovedPhysicalInterior} from './material-physical-mask-guard.js';

export function expandSavedRegions(region,depth=0){
  if(depth>4)return [region];
  const sources=splitSources(region);
  if(sources.length>1)return sources.flatMap(source=>expandSavedRegions(source,depth+1));
  if(sources.length===1){
    try{return splitBySource(region,0).flatMap(part=>expandSavedRegions(part,depth+1));}
    catch{/* The single child covers its parent. */}
  }
  return [region];
}

// These operations consume saved SAM masks and the already corrected page.
// The caller retains `raw` so toggling an option off restores the original.
export async function postprocessSamCandidates(raw,source,{
  mergeSharedCarrier=false,shapeRegularization=false,apertures=false,
  backgrounds=[],paperWidthMM=210,paperHeightMM=297
}={}){
  if(!raw?.length||!source)return raw||[];
  // Manual re-correction may use a 1536px preview while SAM still returns a
  // 1024px mask. Keep all postprocessed masks in the model's coordinate frame.
  const width=raw[0].segmentationFrameWidth||source.width;
  const height=raw[0].segmentationFrameHeight||source.height;
  let frame=source;
  if(source.width!==width||source.height!==height){
    frame=document.createElement('canvas');frame.width=width;frame.height=height;
    const context=frame.getContext('2d',{willReadFrequently:true});
    context.imageSmoothingQuality='high';context.drawImage(source,0,0,width,height);
  }
  const pixels=sourcePixels(frame);
  let regions=mergeSharedCarrier?mergeLightCarriers(raw,backgrounds,pixels,width,height):
    raw.flatMap(region=>expandSavedRegions(region));
  if(shapeRegularization){
    const shaped=await visionTask('material-boundary-refine',{
      pixels,width,height,candidates:regions,mode:'postprocess',
      postprocess:{edgePolish:false,shapeRegularization:true,curveSmooth:false,apertures:false}
    });
    regions=regions.map((before,index)=>{
      const after=shaped?.[index];
      if(!after?.mask?.alpha?.length)return before;
      const loss=after.pixels&&before.pixels?after.pixels/before.pixels:1;
      const interior=detectRemovedPhysicalInterior(before,after);
      return loss<.9||interior.sampled&&interior.removed>Math.max(5,interior.sampled*.01)
        ?before:{...after,splitSources:before.splitSources};
    });
  }
  if(apertures){
    const before=regions;
    const restored=await visionTask('restore-repeated-apertures',{
      pixels,width,height,candidates:regions,paperWidthMM,paperHeightMM
    });
    regions=restored.map((region,index)=>({...region,splitSources:region.splitSources||before[index]?.splitSources}));
  }
  return regions.map(region=>({...region,maskAntialias:!!shapeRegularization}));
}

export function mergeLightCarriers(raw,backgrounds,pixels,width,height){
  const candidates=(backgrounds||[]).filter(background=>background?.mask?.alpha&&
    background.w*background.h<.35&&background.w*background.h>.002)
    .filter(background=>{
      const {x,y,w,h,mask}=background,light=[];
      for(let row=1;row<=5;row++)for(let col=1;col<=5;col++){
        const mx=Math.min(mask.width-1,Math.floor(col*mask.width/6));
        const my=Math.min(mask.height-1,Math.floor(row*mask.height/6));
        if(mask.alpha[my*mask.width+mx]<128)continue;
        const px=Math.min(width-1,Math.max(0,Math.floor((x+w*col/6)*width)));
        const py=Math.min(height-1,Math.max(0,Math.floor((y+h*row/6)*height)));
        const at=(py*width+px)*4;
        light.push((pixels[at]+pixels[at+1]+pixels[at+2])/3);
      }
      light.sort((a,b)=>a-b);
      return light.length>=5&&light[Math.floor(light.length/2)]>=180;
    }).sort((a,b)=>a.w*a.h-b.w*b.h);
  const used=new Set(),merged=[];
  for(const background of candidates){
    const group=raw.flatMap((region,index)=>{
      if(used.has(index))return [];
      const left=Math.max(background.x,region.x),top=Math.max(background.y,region.y);
      const right=Math.min(background.x+background.w,region.x+region.w);
      const bottom=Math.min(background.y+background.h,region.y+region.h);
      const coverage=Math.max(0,right-left)*Math.max(0,bottom-top)/Math.max(1e-8,region.w*region.h);
      return coverage>.9&&region.w*region.h<background.w*background.h*.75?[index]:[];
    });
    if(group.length<2)continue;
    const result=mergeSamRegions(raw,group,[background]);
    for(const index of result.absorbedIndices||group)used.add(index);
    merged.push(result);
  }
  return [...raw.filter((_,index)=>!used.has(index)),...merged];
}
