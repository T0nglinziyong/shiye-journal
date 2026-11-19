import {mergeSamRegions} from './sam-region-merge.js';
import {splitSources,splitBySource,subtractRegion,intersectRegion,findSourceAt,findSourceInBox} from './sam-region-split.js';

const area=region=>region?.pixels||region?.w*region?.h*(region?.segmentationFrameWidth||1)*(region?.segmentationFrameHeight||1)||0;
const overlap=(a,b)=>Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))*
  Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
const sameRegion=(a,b)=>{
  if(overlap(a,b)/Math.max(1e-8,a.w*a.h+b.w*b.h-overlap(a,b))<=.8)return false;
  const am=a.mask,bm=b.mask;
  if(!am?.alpha||!bm?.alpha||am.width!==bm.width||am.height!==bm.height)return true;
  if(Math.abs(a.x-b.x)+Math.abs(a.y-b.y)+Math.abs(a.w-b.w)+Math.abs(a.h-b.h)>.001)return true;
  const step=Math.max(1,Math.floor(am.alpha.length/4096));
  let intersection=0,union=0;
  for(let index=0;index<am.alpha.length;index+=step){
    const first=am.alpha[index]>=128,second=bm.alpha[index]>=128;
    if(first&&second)intersection++;
    if(first||second)union++;
  }
  return union===0||intersection/union>.8;
};

export function regionMergeWarning(regions,selected,backgrounds=[]){
  if(selected.length<2)return false;
  const chosen=selected.map(index=>regions[index]).filter(Boolean);
  if(chosen.length!==selected.length)return false;
  const selectedArea=chosen.reduce((sum,item)=>sum+item.w*item.h,0);
  const carrier=backgrounds.filter(item=>chosen.every(child=>overlap(item,child)>=child.w*child.h*.9))
    .sort((a,b)=>a.w*a.h-b.w*b.h)[0];
  const x0=Math.min(...chosen.map(item=>item.x)),y0=Math.min(...chosen.map(item=>item.y));
  const x1=Math.max(...chosen.map(item=>item.x+item.w)),y1=Math.max(...chosen.map(item=>item.y+item.h));
  return (carrier?carrier.w*carrier.h:(x1-x0)*(y1-y0))>selectedArea*2.5;
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

export function findCachedRegion(regions,rawCandidates=[],point=null,box=null){
  const matches=[];
  const descendants=region=>{
    const found=[],stack=[...splitSources(region)],seen=new Set();
    while(stack.length){
      const child=stack.pop();
      if(!child||seen.has(child))continue;
      seen.add(child);found.push(child);stack.push(...splitSources(child));
    }
    return found;
  };
  const hit=source=>point?findSourceAt([source],point.x,point.y)>=0:findSourceInBox([source],box)>=0;
  for(let index=0;index<regions.length;index++){
    const parent=regions[index];
    descendants(parent).forEach(source=>{
      if(!source?.mask?.alpha||sameRegion(source,parent))return;
      if(hit(source))matches.push({region:source,parentIndex:index});
    });
  }
  for(const region of rawCandidates.flatMap(source=>[source,...descendants(source)])){
    if(!region?.mask?.alpha||regions.some(displayed=>sameRegion(region,displayed)))continue;
    if(hit(region)){
      const parentIndex=regions.findIndex(parent=>overlap(parent,region)>=region.w*region.h*.7&&
        parent.segmentationFrameWidth===region.segmentationFrameWidth&&
        parent.segmentationFrameHeight===region.segmentationFrameHeight);
      matches.push({region,parentIndex});
    }
  }
  return matches.sort((a,b)=>area(a.region)-area(b.region))[0]||null;
}

export function planRegionAdd(regions,child,parentIndex=-1){
  if(!child?.mask?.alpha)throw Error('没有找到可新增的分割 Mask');
  if(regions.some(region=>sameRegion(region,child)))throw Error('这个区域已经在候选结果中');
  const next=regions.filter((_,index)=>index!==parentIndex);
  if(parentIndex>=0){
    const parent=regions[parentIndex];
    const clipped=intersectRegion(parent,child);
    const remainder=subtractRegion(parent,clipped);
    next.push({...remainder,splitSources:undefined},clipped);
  }else next.push(child);
  return {kind:'add',regions:next,highlight:[next.length-1],message:'已找到未展示的分割。请检查彩色预览。'};
}
