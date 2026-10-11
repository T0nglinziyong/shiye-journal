import {sceneRenderEntries} from './craft-display.js';
import {materialMaskGeometry} from './material-mask.js';
import {shapeSVG,textLines} from './editor-tools-model.js';

const xml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]));
const number=value=>Number.isFinite(value)?Number(value.toFixed(3)):0;
const bounded=(value,fallback=1)=>Number.isFinite(value)?Math.max(0,Math.min(1,value)):fallback;
const path=points=>'M'+points.map(([x,y])=>`${number(x)} ${number(y)}`).join(' L')+' Z';
const visible=value=>!value.isHidden&&!value.hidden&&!value.isParked;

// This is a portable composition preview, not the browser's final font/image
// renderer. Geometry comes from the same validated draft used on import.
export function renderOfflinePreviewSVG(draft,source,previewFiles={}){
  const {width,height}=draft.canvas;
  if(![width,height].every(value=>Number.isFinite(value)&&value>0&&value<10000))throw Error('预览画布尺寸无效');
  const images=new Map((source.materials||[]).map(({alias,assetID})=>[assetID,{alias,bytes:previewFiles[alias]}]));
  const defs=[],layers=[],entries=sceneRenderEntries(draft);
  for(const [index,{kind,value}] of entries.entries()){
    const x=number(value.x),y=number(value.y),w=number(value.width),h=number(value.height),rotation=number(value.rotation||0);
    if(!(w>0&&h>0))continue;
    const transform=`translate(${x} ${y}) rotate(${rotation})`;
    if(kind==='material'){
      const image=images.get(value.assetID),crop=value.cropRect||{x:0,y:0,width:1,height:1};
      const bytes=image?.bytes,mask=materialMaskGeometry(value.materialMask),clip=`clip-${index}`;
      if(mask){
        const outline=path(mask.outer.map(([px,py])=>[px*w,py*h]));
        const holes=mask.holes.map(points=>path(points.map(([px,py])=>[px*w,py*h]))).join(' ');
        defs.push(`<clipPath id="${clip}" clipPathUnits="userSpaceOnUse"><path d="${outline} ${holes}" clip-rule="evenodd"/></clipPath>`);
      }
      const content=bytes?.length
        ?`<image href="data:image/webp;base64,${Buffer.from(bytes).toString('base64')}" x="${number(-crop.x*w/crop.width)}" y="${number(-crop.y*h/crop.height)}" width="${number(w/crop.width)}" height="${number(h/crop.height)}" preserveAspectRatio="none"/>`
        :`<rect width="${w}" height="${h}" fill="#e8ebe5" stroke="#8b9a8c"/><text x="8" y="24" font-size="17" fill="#53645a">${xml(image?.alias||'素材')}</text>`;
      layers.push(`<g transform="${transform}" opacity="${bounded(value.opacity)}"><svg x="${number(-w/2)}" y="${number(-h/2)}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" overflow="hidden"><g transform="${value.isFlippedHorizontally?`translate(${w} 0) scale(-1 1)`:''}"${mask?` clip-path="url(#${clip})"`:''}>${content}</g></svg></g>`);
    }else if(kind==='shape'){
      layers.push(`<g transform="${transform}" opacity="${bounded(value.opacity)}"><svg x="${number(-w/2)}" y="${number(-h/2)}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${shapeSVG(value)}</svg></g>`);
    }else{
      const font=Math.max(1,number(value.fontSize||18));
      const fallback=content=>Array.from(content).reduce((total,char)=>total+font*(/^[\x00-\x7f]$/.test(char)?.65:1)+(value.letterSpacing||0),0);
      const lines=textLines(value,fallback).lines;
      // The original UTF-8 text stays editable in project.shiyeproject.json.\n      // A generic serif/sans fallback alone often renders CJK as tofu boxes.\n      const family=value.style==='serif'?'Noto Serif CJK SC, Source Han Serif SC, Songti SC, SimSun, serif':\n        value.style==='hand'?'Ma Shan Zheng, Noto Sans CJK SC, PingFang SC, Microsoft YaHei, cursive':\n        'Noto Sans CJK SC, Source Han Sans SC, PingFang SC, Microsoft YaHei, sans-serif';
      const alignment=value.alignment||'left',anchor=alignment==='center'?'middle':alignment==='right'?'end':'start';
      const tx=alignment==='center'?0:alignment==='right'?w/2:-w/2;
      const top=-h/2+font;
      const text=lines.map(line=>`<text x="${number(tx)}" y="${number(top+line.y)}" text-anchor="${anchor}">${xml(line.text)}</text>`).join('');
      layers.push(`<g transform="${transform}" opacity="${bounded(value.opacity)}" fill="${xml(value.color||'#30463d')}" font-family="${family}" font-size="${font}" font-weight="${value.bold?'bold':'normal'}" font-style="${value.italic?'italic':'normal'}" letter-spacing="${number(value.letterSpacing||0)}">${text}</g>`);
    }
  }
  for(const stroke of draft.strokes||[]){
    const points=(stroke.points||[]).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));
    if(!points.length)continue;
    const d=points.map((point,index)=>`${index?'L':'M'}${number(point.x)} ${number(point.y)}`).join(' ');
    layers.push(`<path d="${d}" fill="none" stroke="${xml(stroke.color||'#30463d')}" stroke-width="${number(stroke.width||3)}" stroke-linecap="round" stroke-linejoin="round" opacity="${bounded(stroke.opacity)}"/>`);
  }
  const paperColor=xml(draft.paperColor||'#fcfaf0'),paper=[];
  if(['lines','grid'].includes(draft.paperPattern)){
    for(let y=40;y<height;y+=40)paper.push(`<path d="M0 ${y}H${number(width)}"/>`);
    if(draft.paperPattern==='grid')for(let x=40;x<width;x+=40)paper.push(`<path d="M${x} 0V${number(height)}"/>`);
  }else if(draft.paperPattern==='dots'){
    for(let y=42;y<height-42;y+=42)for(let x=42;x<width-42;x+=42)paper.push(`<circle cx="${x}" cy="${y}" r="1"/>`);
  }else if(draft.paperPattern==='columns')for(const x of [.08,.48,.52,.92])paper.push(`<path d="M${number(width*x)} ${number(height*.1)}V${number(height*.9)}"/>`);
  if(draft.pageMode==='spread'&&draft.drawCenterGutter!==false)paper.push(`<path d="M${number(width/2)} 0V${number(height)}" stroke="#b9bbb4" stroke-width="2"/>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${number(width)}" height="${number(height+42)}" viewBox="0 0 ${number(width)} ${number(height+42)}"><defs>${defs.join('')}<clipPath id="page"><rect width="${number(width)}" height="${number(height)}"/></clipPath></defs><g clip-path="url(#page)"><rect width="${number(width)}" height="${number(height)}" fill="${paperColor}"/><g stroke="#d5d6cc" fill="none" opacity=".72">${paper.join('')}</g>${layers.join('')}</g><rect y="${number(height)}" width="${number(width)}" height="42" fill="#e9ede7"/><text x="16" y="${number(height+28)}" font-size="17" font-family="Noto Sans CJK SC, PingFang SC, Microsoft YaHei, sans-serif" fill="#415748">构图预览 · 基于可编辑图层与任务包缩略图；字体、抠图边缘及最终效果以拾页为准</text></svg>\n`;
}
