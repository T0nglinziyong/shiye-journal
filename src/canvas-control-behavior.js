// Platform-independent decisions used by iPad/phone pointer navigation.
export function fingerMayPanCanvas({pointerType,tool,background,pencilEnabled}={}){
  if(pointerType!=='touch'||!background)return false;
  // Real Pencil continues to draw. Finger moves the page when Pencil-only ink
  // is enabled; when disabled fingers retain the ability to draw themselves.
  return ['select','text','shape'].includes(tool)||(['pen','highlighter','eraser'].includes(tool)&&pencilEnabled===true);
}
export function clampedCanvasOffset(pageStart,pageEnd,hostStart,hostEnd,{slackRatio=.24,maxSlack=130}={}){
  const content=pageEnd-pageStart,available=hostEnd-hostStart;
  if(!(content>0&&available>0))return 0;
  if(content>available){
    if(pageStart>hostStart)return hostStart-pageStart;
    if(pageEnd<hostEnd)return hostEnd-pageEnd;
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
