import {paperDimensions} from './paper-sizes.js';
import {itemFromAsset} from './domain.js';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const inside=(value,size)=>size>=1?.5:clamp(value,size/2,1-size/2);

export function matchingPageSize(ratio){
  const paper=paperDimensions(ratio)||paperDimensions('a4');
  return {width:paper.width*2,height:paper.height};
}

export function matchingStageItems(assets,positions,ratio){
  const page=matchingPageSize(ratio),placed=[];
  return assets.map(asset=>{
    const width=(asset.physicalWidthMM||35)/page.width;
    const height=(asset.physicalHeightMM||35)/page.height;
    const stored=positions?.[asset.id];
    let x=stored?.x,y=stored?.y;
    if(!Number.isFinite(x)||!Number.isFinite(y)){
      const margin=.012,step=.018;
      let best={x:.5,y:.5,overlap:Infinity};
      for(let top=margin;top<=Math.max(margin,1-height-margin);top+=step){
        for(let left=margin;left<=Math.max(margin,1-width-margin);left+=step){
          const candidate={x:inside(left+width/2,width),y:inside(top+height/2,height)};
          const overlap=placed.reduce((area,other)=>area+Math.max(0,(width+other.width)/2-Math.abs(candidate.x-other.x))*
            Math.max(0,(height+other.height)/2-Math.abs(candidate.y-other.y)),0);
          if(overlap<best.overlap)best={...candidate,overlap};
          if(overlap===0)break;
        }
        if(best.overlap===0)break;
      }
      x=best.x;y=best.y;
    }
    const item={asset,x:inside(x,width),y:inside(y,height),width,height};
    placed.push(item);
    return item;
  });
}

export function applyMatchingStage(draft,assets,basket,positions){
  const selected=basket.map(id=>assets.find(asset=>asset.id===id)).filter(Boolean);
  const stage=matchingStageItems(selected,positions,draft.pageRatio);
  draft.items=stage.map(({asset,x,y},index)=>{
    const item=itemFromAsset(asset,draft,x*draft.canvas.width,y*draft.canvas.height,10+index,true);
    item.x=inside(x,item.width/draft.canvas.width)*draft.canvas.width;
    item.y=inside(y,item.height/draft.canvas.height)*draft.canvas.height;
    item.generationBaseline={...item.generationBaseline,x:item.x,y:item.y};
    return item;
  });
  return {placed:draft.items.length,remaining:0,template:'素材页'};
}
