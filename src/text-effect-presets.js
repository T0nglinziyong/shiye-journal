// UI presets lower into the SAME public style used by AI. No new Scene type,
// no bitmap text, no hidden tool-specific effect state.
export const textEffectPresets=Object.freeze([
 ['plain','无字效'],['outline','完整描边'],['offset','偏移轮廓'],
 ['gradient','渐变字'],['gradient-outline','渐变描边'],['shadow','柔和投影']
]);
export function textEffectStyle(preset){
 if(!textEffectPresets.some(([id])=>id===preset))throw Error('未知文字效果');
 const style={outline:null,gradient:null,shadow:null};
 if(['outline','offset','gradient-outline'].includes(preset))style.outline={color:'#E5D1B5',widthMm:.5,offsetMm:preset==='offset'?[.5,.5]:[0,0]};
 if(['gradient','gradient-outline'].includes(preset))style.gradient={angleDeg:90,stops:[{offset:0,color:'#A66743'},{offset:1,color:'#385F8E'}]};
 if(preset==='shadow')style.shadow={color:'#B9B5AE',blurMm:.5,offsetMm:[.6,.6]};
 return style;
}
export function textEffectName(node){
 if(node.textGradient)return node.textOutline?'gradient-outline':'gradient';
 if(node.textOutline)return node.textOutline.offsetX||node.textOutline.offsetY?'offset':'outline';
 return node.shadow?'shadow':'plain';
}
// Granular controls preserve arbitrary imported gradients (including middle
// stops), rather than flattening them merely by opening the inspector.
export function editTextEffectStyle(node,key,value,scale){
 if(!(scale>0))throw Error('纸张比例无效');
 if(key.startsWith('outline-')){
  const o=node.textOutline;if(!o)throw Error('请先选择描边效果');
  const outline={color:o.color,widthMm:o.width/scale,offsetMm:[o.offsetX/scale,o.offsetY/scale]};
  if(key==='outline-color')outline.color=value;
  else if(key==='outline-width')outline.widthMm=Number(value);
  else if(key==='outline-x')outline.offsetMm[0]=Number(value);
  else if(key==='outline-y')outline.offsetMm[1]=Number(value);
  else throw Error('未知描边设置');
  return {outline};
 }
 const gradient=structuredClone(node.textGradient);if(!gradient)throw Error('请先选择渐变效果');
 if(key==='gradient-start')gradient.stops[0].color=value;
 else if(key==='gradient-end')gradient.stops.at(-1).color=value;
 else if(key==='gradient-angle')gradient.angleDeg=Number(value);
 else throw Error('未知渐变设置');
 return {gradient};
}
