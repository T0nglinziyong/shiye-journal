import {measureSceneText} from '../../src/scene-text-layout.js';
import {styleFor} from '../../src/scene-node-properties.js';

export function fitTemplateText(content,style,width,height,scale=1,maxLines){
 const desired=style.fontSizePt*scale,min=Math.min(desired,Math.max(6,desired*.65));
 const page={canvas:{height:100},physicalPageHeightMM:100};
 const measure=fontSizePt=>measureSceneText({type:'text',content,width,...styleFor('text',{...style,fontSizePt},page)});
 const fits=size=>{const m=measure(size);return m.height<=height&&(!maxLines||m.lines.length<=maxLines)&&(style.curveHeightMm?m.unwrappedWidth:m.width)<=width;};
 let size=desired;
 if(!fits(size)){
  let low=min,high=desired;
  for(let i=0;i<24;i++){const mid=(low+high)/2;if(fits(mid))low=mid;else high=mid;}
  size=Math.floor(low*10000)/10000;
 }
 const metrics=measure(size);
 return {style:{...style,fontSizePt:size},height:metrics.height,report:{fontSizePt:size,preferredFontSizePt:desired,widthMm:width,heightMm:height,measuredHeightMm:metrics.height,overflow:!fits(size),measurement:metrics.measurement}};
}
