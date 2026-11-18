import {paperDimensions} from './paper-sizes.js';
import {itemFromAsset} from './domain.js';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
export const matchingItemOnPage=(x,y,width,height)=>
  x-width/2>0&&x+width/2<1&&y-height/2>0&&y+height/2<1;

export function matchingPageSize(ratio,mode){
  const paper=paperDimensions(ratio)||paperDimensions('a4');
  return {width:paper.width*(mode==='spread'?2:1),height:paper.height};
}

export function matchingStageItems(assets,positions,ratio,mode,initialIDs=null){
  const page=matchingPageSize(ratio,mode),placed=[];
  const initial=new Set(initialIDs||assets.map(asset=>asset.id));
  return assets.map((asset,index)=>{
    const width=(asset.physicalWidthMM||35)/page.width;
    const height=(asset.physicalHeightMM||35)/page.height;
    const stored=positions?.[asset.id];
    let x=stored?.x,y=stored?.y;
    if((!Number.isFinite(x)||!Number.isFinite(y))&&initial.has(asset.id)){
      const margin=.015;
      const step=.025;
      let found=false;
      for(let top=margin;top+height<=1-margin&&!found;top+=step){
        for(let left=margin;left+width<=1-margin;left+=step){
          const candidate={x:left+width/2,y:top+height/2,width,height};
          if(placed.filter(other=>other.onPage).every(other=>Math.abs(other.x-candidate.x)>=(other.width+width)/2+margin||
            Math.abs(other.y-candidate.y)>=(other.height+height)/2+margin)){
            x=candidate.x;y=candidate.y;found=true;break;
          }
        }
      }
      if(!found){
        if(width>1-.03||height>1-.03){x=.5;y=1;}
        else{x=NaN;y=NaN;}
      }
    }
    if(!Number.isFinite(x)||!Number.isFinite(y)){
      let found=false;
      for(let top=1.06;top<4&&!found;top+=.04){
        for(let left=0;left+width<=1.001;left+=.025){
          const candidate={x:left+width/2,y:top+height/2};
          if(placed.filter(other=>!other.onPage).every(other=>Math.abs(other.x-candidate.x)>=(other.width+width)/2+.025||
            Math.abs(other.y-candidate.y)>=(other.height+height)/2+.025)){
            x=candidate.x;y=candidate.y;found=true;break;
          }
        }
      }
      if(!found){x=.5;y=4+index*(height+.05);}
    }
    const item={asset,x:clamp(x,-.25,1.25),y:Math.max(-.15,y),width,height,
      onPage:matchingItemOnPage(x,y,width,height)};
    placed.push(item);
    return item;
  });
}

export function applyMatchingStage(draft,assets,basket,positions,initialIDs=null){
  const selected=basket.map(id=>assets.find(asset=>asset.id===id)).filter(Boolean);
  const stage=matchingStageItems(selected,positions,draft.pageRatio,draft.pageMode,initialIDs);
  draft.items=stage.map(({asset,x,y,onPage},index)=>{
    const item=itemFromAsset(asset,draft,x*draft.canvas.width,y*draft.canvas.height,10+index,true);
    item.isParked=!onPage;
    if(onPage){
      item.x=item.width>=draft.canvas.width?draft.canvas.width/2:clamp(item.x,item.width/2,draft.canvas.width-item.width/2);
      item.y=item.height>=draft.canvas.height?draft.canvas.height/2:clamp(item.y,item.height/2,draft.canvas.height-item.height/2);
    }else{item.x=draft.canvas.width/2;item.y=draft.canvas.height/2;}
    item.generationBaseline={...item.generationBaseline,x:item.x,y:item.y};
    return item;
  });
  return {placed:draft.items.length,remaining:0,template:'素材页'};
}
