import {mergeSamRegions} from './sam-region-merge.js';
import {splitSources,splitBySource} from './sam-region-split.js';

const pageArea=region=>region?.pixels&&region.segmentationFrameWidth&&region.segmentationFrameHeight
  ?region.pixels/(region.segmentationFrameWidth*region.segmentationFrameHeight):region.w*region.h;
const overlap=(a,b)=>Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))*
  Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
export function regionMergeWarning(regions,selected,backgrounds=[]){
  if(selected.length<2)return false;
  const chosen=selected.map(index=>regions[index]).filter(Boolean);
  if(chosen.length!==selected.length)return false;
  const selectedArea=chosen.reduce((sum,item)=>sum+pageArea(item),0);
  const carrier=backgrounds.filter(item=>chosen.every(child=>overlap(item,child)>=child.w*child.h*.9))
    .sort((a,b)=>a.w*a.h-b.w*b.h)[0];
  const x0=Math.min(...chosen.map(item=>item.x)),y0=Math.min(...chosen.map(item=>item.y));
  const x1=Math.max(...chosen.map(item=>item.x+item.w)),y1=Math.max(...chosen.map(item=>item.y+item.h));
  return (carrier?pageArea(carrier):(x1-x0)*(y1-y0))>selectedArea*2.5;
}

export function planRegionMerge(regions,selected,backgrounds,frame){
  const merged=mergeSamRegions(regions,selected,backgrounds,frame);
  const excluded=new Set(merged.absorbedIndices||selected);
  const next=regions.filter((_,index)=>!excluded.has(index));
  next.push(merged);
  return {kind:'merge',regions:next,highlight:[next.length-1],message:merged.mergeBasis==='sam-background'
    ?'将包含共同载体与其内部区域。请检查彩色预览。':'将包含所选区域间的底色。请检查彩色预览。'};
}

export function planRegionSplit(regions,index){
  const parent=regions[index],sources=splitSources(parent);
  if(!parent?.mask?.alpha||!sources.length)return null;
  let parts;
  try{parts=splitBySource(parent,0);}catch{return null;}
  if(parts.length<2)return null;
  const next=regions.filter((_,at)=>at!==index),first=next.length;
  next.push(...parts);
  return {kind:'split',regions:next,highlight:parts.map((_,at)=>first+at),
    message:`将恢复 ${parts.length} 个原始区域。请检查彩色预览。`};
}
