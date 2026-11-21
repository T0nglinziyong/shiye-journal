import {textFont,textLines} from './editor-tools-model.js';

// Lightweight, deterministic diagnostics based on the same font metrics and
// text wrapping helper as the Canvas renderer. These are warnings, not claims
// that the scene has passed a subjective visual review.
export function auditOfflineCanvasDraft(draft,{createCanvas=()=>document.createElement('canvas')}={}){
  const warnings=[],canvas=createCanvas(),ctx=canvas.getContext('2d');
  const size=draft.canvas||{},W=size.width||0,H=size.height||0;
  if(!ctx)return {warnings:['当前环境无法测量文字，必须人工检查'],textOverflows:0,outsideElements:0};
  let textOverflows=0,outsideElements=0;
  for(const [index,item] of (draft.textBlocks||[]).entries()){
    if(item.hidden||item.isHidden||item.isParked)continue;
    ctx.font=textFont(item);
    const lines=textLines(item,value=>ctx.measureText(value).width);
    if(Number.isFinite(item.height)&&lines.height>item.height+Math.max(3,(item.fontSize||18)*.12)){
      textOverflows++;
      if(warnings.length<12)warnings.push('文字 '+(index+1)+' 预计超出文本框（'+Math.round(lines.height)+' / '+Math.round(item.height)+'），检查是否盖住其他内容');
    }
  }
  for(const [index,item] of [...(draft.items||[]),...(draft.textBlocks||[]),...(draft.primitives||[])].entries()){
    if(item.hidden||item.isHidden||item.isParked)continue;
    if(![item.x,item.y,item.width,item.height].every(Number.isFinite))continue;
    const excess=Math.min(W,H)*.04;
    // This is a conservative warning: deliberate page bleed is legal.
    if(item.x+item.width/2 < -excess || item.x-item.width/2 > W+excess ||
       item.y+item.height/2 < -excess || item.y-item.height/2 > H+excess){
      outsideElements++;
      if(warnings.length<12)warnings.push('图层 '+(index+1)+' 可能完全位于页面外，请检查是否有意出血');
    }
  }
  return {warnings,textOverflows,outsideElements,reviewRequired:true};
}
