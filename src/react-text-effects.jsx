import React,{useEffect,useRef} from 'react';
import {drawSceneText} from './editor-tools-model.js';
import {prepareJournalFont} from './journal-fonts.js';
import {textEffectPresets,textEffectStyle} from './text-effect-presets.js';
import {scaleTextEffects} from './text-effects.js';
import {renderSceneCanvas} from './scene-renderer.js';
import {graphicEffectPreviewNode} from './graphic-effect-preview.js';
function TextEffectPreview({node}){
 const canvas=useRef(null);
 useEffect(()=>{let cancelled=false;
  const preview={...node,type:'text',content:String(node.content||'拾页 · 文字').split('\n')[0].slice(0,12),fontSize:36,width:264,height:74,alignment:'center',curveHeight:0,fixedLineHeight:null,lineSpacing:0,paragraphSpacing:0,letterSpacing:0};
  const factor=36/(node.fontSize||36);scaleTextEffects(preview,factor);
  if(preview.shadow)preview.shadow={...preview.shadow,offsetX:preview.shadow.offsetX*factor,offsetY:preview.shadow.offsetY*factor,blur:preview.shadow.blur*factor};
  void prepareJournalFont(preview).then(()=>{if(cancelled||!canvas.current)return;const c=canvas.current,ctx=c.getContext('2d');if(!ctx)return;c.width=560;c.height=164;ctx.scale(2,2);ctx.fillStyle='#F8F5EF';ctx.fillRect(0,0,280,82);ctx.translate(140,41);if(preview.shadow){ctx.shadowColor=preview.shadow.color;ctx.shadowOffsetX=preview.shadow.offsetX;ctx.shadowOffsetY=preview.shadow.offsetY;ctx.shadowBlur=preview.shadow.blur;}drawSceneText(ctx,preview);}).catch(()=>{});
  return()=>{cancelled=true;};
 },[JSON.stringify(node)]);
 return <canvas ref={canvas} className="text-effects-preview" role="img" aria-label="当前艺术文字效果预览"/>;
}
function GraphicEffectPreview({node}){
 const canvas=useRef(null);
 useEffect(()=>{let cancelled=false;const copy=graphicEffectPreviewNode(node);
  void renderSceneCanvas({sceneVersion:2,canvas:{width:280,height:82},physicalPageHeightMM:100,paperColor:'#F8F5EF',paperPattern:'plain',layers:[copy]},{waitForFonts:false}).then(result=>{
   if(cancelled||!canvas.current)return;const c=canvas.current;c.width=560;c.height=164;c.getContext('2d')?.drawImage(result.canvas,0,0,560,164);
  }).catch(()=>{});return()=>{cancelled=true;};
 },[JSON.stringify(node)]);
 return <canvas ref={canvas} className="text-effects-preview" role="img" aria-label="当前图形效果预览"/>;
}
export function PaintEffectsPanel({node,page,onChange}){
 const isText=node.type==='text'||!node.type,label=isText?'文字':'图形',s=(page?.canvas?.height||1000)/(page?.physicalPageHeightMM||297),outline=isText?node.textOutline:node.graphicOutline,gradient=isText?node.textGradient:node.graphicGradient,shadow=node.shadow;
 const updateOutline=patch=>onChange({outline:{color:outline?.color||'#FFFFFF',widthMm:(outline?.width||s*.5)/s,offsetMm:[(outline?.offsetX||0)/s,(outline?.offsetY||0)/s],...patch}});
 return <section className="text-effects-panel" aria-label={isText?"艺术文字效果":"图形艺术效果"}>
  {isText?<TextEffectPreview node={node}/>:<GraphicEffectPreview node={node}/>}
  <div className="text-effects-presets">{textEffectPresets.map(([id,label])=><button key={id} type="button" data-text-effect={id} onClick={()=>onChange(textEffectStyle(id,isText?node.color:node.fill||node.stroke||node.color))}>{label}</button>)}</div>
  {outline?<div className="text-effects-fields"><label>轮廓颜色<input type="color" aria-label={label+'轮廓颜色'} value={outline.color} onChange={e=>updateOutline({color:e.target.value})}/></label>
   <label>轮廓宽度 · mm<input type="number" aria-label={label+'轮廓宽度 mm'} min="0.01" max="8" step="0.1" value={Math.round(outline.width/s*100)/100} onChange={e=>{const n=Number(e.target.value);if(n>=.01&&n<=8)updateOutline({widthMm:n});}}/></label>
   {['X','Y'].map((axis,i)=><label key={axis}>轮廓偏移 {axis} · mm<input type="number" aria-label={'轮廓偏移 '+axis} min="-10" max="10" step="0.1" value={Math.round((i?outline.offsetY:outline.offsetX)/s*100)/100} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n)&&Math.abs(n)<=10)updateOutline({offsetMm:i?[outline.offsetX/s,n]:[n,outline.offsetY/s]});}}/></label>)}
   <button type="button" onClick={()=>onChange({outline:null})}>清除轮廓</button></div>:null}
  {gradient?<div className="text-effects-fields">{[['起始颜色',0],['结束颜色',gradient.stops.length-1]].map(([label,index])=><label key={label}>{label}<input type="color" aria-label={(isText?'文字':'图形')+'渐变'+label} value={gradient.stops[index].color} onChange={e=>onChange({gradient:{...gradient,stops:gradient.stops.map((stop,i)=>i===index?{...stop,color:e.target.value}:stop)}})}/></label>)}
   <label>方向<select aria-label={label+'渐变方向'} value={gradient.angleDeg} onChange={e=>onChange({gradient:{...gradient,angleDeg:Number(e.target.value)}})}>
    {[...new Set([0,45,90,135,gradient.angleDeg])].sort((a,b)=>a-b).map(deg=><option key={deg} value={deg}>{deg}°</option>)}</select></label><button type="button" onClick={()=>onChange({gradient:null})}>清除渐变</button></div>:null}
  {shadow?<div className="text-effects-fields"><label>投影颜色<input type="color" aria-label={label+'投影颜色'} value={shadow.color} onChange={e=>onChange({shadow:{color:e.target.value,offsetMm:[shadow.offsetX/s,shadow.offsetY/s],blurMm:shadow.blur/s}})}/></label><label>投影模糊 · mm<input type="number" aria-label={label+'投影模糊 mm'} min="0" max="30" step="0.1" value={Math.round(shadow.blur/s*100)/100} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n)&&n>=0&&n<=30)onChange({shadow:{color:shadow.color,offsetMm:[shadow.offsetX/s,shadow.offsetY/s],blurMm:n}});}}/></label><button type="button" onClick={()=>onChange({shadow:null})}>清除投影</button></div>:null}
  <small>{isText?"效果保留为可编辑文字；输入时保留光标，退出输入后显示完整字效。":"效果与 AI 使用同一 style；保留原始矢量或压感点。渐变作用于填充，无填充时作用于线条；局部路径颜色优先。"}</small>
 </section>;
}
