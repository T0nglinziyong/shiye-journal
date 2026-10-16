// Platform-independent decisions used by iPad/phone pointer navigation.
export function isIPadPointerDevice({userAgent='',platform='',maxTouchPoints=0}={}){
  return /iPad/i.test(userAgent)||platform==='MacIntel'&&maxTouchPoints>1;
}
export function fingerNavigatesCanvas({pointerType,tool,iPad=false}={}){
  return pointerType==='touch'&&iPad&&['pen','highlighter','eraser','lasso'].includes(tool);
}
export function fingerMayPanCanvas({pointerType,tool,background,pencilEnabled}={}){
  if(pointerType!=='touch'||!background)return false;
  // Real Pencil continues to draw. Finger moves the page when Pencil-only ink
  // is enabled; when disabled fingers retain the ability to draw themselves.
  return ['select','text','shape'].includes(tool)||(['pen','highlighter','eraser'].includes(tool)&&pencilEnabled===true);
}
export function clampedCanvasOffset(pageStart,pageEnd,hostStart,hostEnd,{slackRatio=.04,maxSlack=24}={}){
  const content=pageEnd-pageStart,available=hostEnd-hostStart;
  if(!(content>0&&available>0))return 0;
  if(content>available){
    // A zoomed page may expose a narrow margin, but can never leave the view.
    const margin=Math.min(36,available*.06);
    if(pageStart>hostStart+margin)return hostStart+margin-pageStart;
    if(pageEnd<hostEnd-margin)return hostEnd-margin-pageEnd;
    return 0;
  }
  // Let a finger move an already fitted page within a modest bounded range.
  // Exact centering here swallowed every single-finger Panzoom update.
  const delta=(hostStart+hostEnd-pageStart-pageEnd)/2;
  const slack=Math.min(maxSlack,available*slackRatio);
  return Math.abs(delta)>slack?delta-Math.sign(delta)*slack:0;
}
export const FONT_SIZE_PRESETS=Object.freeze([14,16,18,20,22,24,28,32,36,40,44,48,56,64,72,84,96,120,144,180,240,320,400]);
export function adjacentFontSize(current,direction){
  const value=Number(current)||40;
  if(direction>0)return FONT_SIZE_PRESETS.find(size=>size>value)||FONT_SIZE_PRESETS.at(-1);
  return FONT_SIZE_PRESETS.slice().reverse().find(size=>size<value)||FONT_SIZE_PRESETS[0];
}

export function boundedCanvasViewport({scale=1,x=0,y=0},{width,height,hostWidth,hostHeight}){
  scale=Math.max(1,Math.min(4,Number(scale)||1));
  const axis=(offset,size,available)=>{
    const limit=Math.max(0,(size*scale-available)/2+12);
    // Fitted paper stays centered; larger paper covers the viewport apart
    // from a small, symmetric edge margin.
    return size*scale<=available?0:Math.max(-limit,Math.min(limit,(Number(offset)||0)*scale))/scale;
  };
  return {scale,x:axis(x,width,hostWidth),y:axis(y,height,hostHeight)};
}
