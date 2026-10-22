import {validateTextEffects} from './text-effects.js';
// Public property language -> canonical Scene data, followed by ONE reflow.
// Called by all create/update paths before anchors and linked dependencies.
import {creationReferenceBox} from './creation-placement.js';
import {assertSceneCapability,AI_SCENE_POLICY} from './scene-edit-policy.js';
const sceneScale=page=>page.canvas.height/page.physicalPageHeightMM;
import {reflowSceneText} from './scene-text-layout.js';

export function dimension(page,size,key,parentID=null){
 const value=size?.[key];if(!(Number.isFinite(value)&&value>0))throw Error('size.'+key+' 必须是正数');
 if(size.unit==='mm')return value;
 if(size.unit==='ratio'){const ref=creationReferenceBox(page,size.reference,parentID);return value*(key==='width'?ref.w:ref.h)/sceneScale(page);}
 throw Error('尺寸单位无效');
}
export function dimensions(page,size,{parentID=null,ratio=1}={}){
 let width=size.width===undefined?null:dimension(page,size,'width',parentID),height=size.height===undefined?null:dimension(page,size,'height',parentID);
 if(width===null&&height===null)throw Error('size 需要宽或高');
 if(size.aspect==='preserve'&&width!==null&&height!==null&&Math.abs(width/height-ratio)>1e-6)throw Error('保持宽高比与指定尺寸矛盾');
 if(width===null)width=height*ratio;if(height===null)height=width/ratio;return {width,height};
}
export function styleFor(type,style,page,node={}){
 if(!style)return {};
 const s=sceneScale(page),mapping={opacity:'opacity',blendMode:'blendMode',shadow:'shadow'};
 if(type==='material')mapping.flipHorizontal='isFlippedHorizontally';
 if(type==='text')Object.assign(mapping,{outline:'textOutline',gradient:'textGradient',color:'color',fontSizePt:'fontSize',fontFamily:'fontName',fontPreset:'style',fontWeight:'bold',textAlign:'alignment',italic:'italic',underline:'underline',strikethrough:'strikethrough',letterSpacingMm:'letterSpacing',paragraphSpacingMm:'paragraphSpacing',lineSpacingMm:'lineSpacing',curveHeightMm:'curveHeight',lineHeight:'fixedLineHeight'});
 if(type==='shape')Object.assign(mapping,{fill:'fill',stroke:'stroke',strokeWidthMm:'lineWidth',fillOpacity:'fillOpacity',strokeOpacity:'strokeOpacity',strokeDash:'strokeDash',cornerRadiusRatio:'cornerRadius'});
 if(type==='ink')Object.assign(mapping,{color:'color',strokeWidthMm:'width',penStyle:'penStyle'});
 const result={};
 for(const [key,value] of Object.entries(style)){
  if(!mapping[key])throw Error(type+' 不支持 style.'+key);
  result[mapping[key]]=key==='outline'?(value===null?null:{color:value.color,width:value.widthMm*s,offsetX:(value.offsetMm?.[0]||0)*s,offsetY:(value.offsetMm?.[1]||0)*s}):key==='gradient'?structuredClone(value):key==='fontSizePt'?value*25.4/72*s:key==='fontWeight'?value==='bold':
   key==='lineHeight'?value*(style.fontSizePt===undefined?(node.fontSize||12*25.4/72*s):style.fontSizePt*25.4/72*s):
   ['strokeWidthMm','letterSpacingMm','paragraphSpacingMm','lineSpacingMm','curveHeightMm'].includes(key)?value*s:
   key==='shadow'?(value===null?null:{offsetX:value.offsetMm[0]*s,offsetY:value.offsetMm[1]*s,blur:value.blurMm*s,color:value.color}):value;
 }
 return result;
}
export function changedNodeProperties(page,node,change,parentID=null,{policy=AI_SCENE_POLICY,confirmation}={}){
 const next=structuredClone(node),s=sceneScale(page);
 Object.assign(next,styleFor(node.type,change.style,page,node));
 if(node.type==='text'&&change.style?.fontPreset!==undefined&&change.style.fontFamily===undefined)next.fontName=null;
 if(change.content!==undefined){if(node.type!=='text')throw Error('content 只适用于文字');next.content=change.content;}
 if(change.name!==undefined){if(node.type!=='group')throw Error('name 只适用于组合');next.name=change.name;}
 if(change.hidden!==undefined){next.hidden=change.hidden;next.isHidden=change.hidden;if(!change.hidden)next.isParked=false;}
 if(change.locked!==undefined){next.isLocked=change.locked;next.locked=change.locked;}
 if(change.layoutBox){if(node.type!=='group'||!node.localTransform)throw Error('layoutBox 只适用于空间组');next.layoutBox={width:change.layoutBox.width*s,height:change.layoutBox.height*s};}
 if(change.kind!==undefined){if(node.type!=='shape'||node.svgPaths)throw Error('kind 只适用于基础图形');next.kind=change.kind==='rect'?'rectangle':change.kind;}
 if(change.geometry){
  const g=change.geometry;
  if(g.kind==='vector'){
   if(node.type!=='shape'||node.kind!=='vector')throw Error('vector 几何只适用于矢量节点');
   next.svgViewBox=structuredClone(g.viewBox);next.svgPaths=g.paths.map(path=>({d:path.d,...(path.fillRule?{fillRule:path.fillRule}:{}),...(path.style||{})}));
  }else if(g.kind==='shape'){
   if(node.type!=='shape'||node.kind==='vector')throw Error('shape 几何只适用于基础图形');next.kind=g.shape==='rect'?'rectangle':g.shape;
  }else if(g.kind==='ink'){
   if(node.type!=='ink')throw Error('ink 几何只适用于笔迹');
   const a=(node.layoutRotation||0)*Math.PI/180,c=Math.cos(a),sn=Math.sin(a);
   const unrotated=node.points.map(p=>({x:p.x*c+p.y*sn,y:-p.x*sn+p.y*c}));
   const cx=(Math.min(...unrotated.map(p=>p.x))+Math.max(...unrotated.map(p=>p.x)))/2,cy=(Math.min(...unrotated.map(p=>p.y))+Math.max(...unrotated.map(p=>p.y)))/2;
   const gx=(Math.min(...g.points.map(p=>p.x))+Math.max(...g.points.map(p=>p.x)))/2,gy=(Math.min(...g.points.map(p=>p.y))+Math.max(...g.points.map(p=>p.y)))/2;
   next.points=g.points.map(p=>{const x=cx+(p.x-gx)*s,y=cy+(p.y-gy)*s;return {x:x*c-y*sn,y:x*sn+y*c,p:p.pressure??.5};});
  }
 }
 if(change.size&&node.type!=='text'){
  if(node.type==='material')assertSceneCapability(policy,'material.visualResize',[node],confirmation);
  else if(node.type!=='shape')throw Error('组合和笔迹不能通过 size 隐式缩放');
  const result=dimensions(page,change.size,{parentID,ratio:node.width/node.height});next.width=result.width*s;next.height=result.height*s;
 }
 if(node.type==='text'){
  if(change.size?.width!==undefined)next.width=dimension(page,change.size,'width',parentID)*s;
  reflowSceneText(next,{...(change.size?.height===undefined?{}:{minimumHeight:dimension(page,change.size,'height',parentID)*s}),...(change.style?.lineHeight===undefined?{}:{lineHeightRatio:change.style.lineHeight})});
 }
 validateTextEffects(next);
 const values={};for(const [key,value] of Object.entries(next))if(JSON.stringify(node[key])!==JSON.stringify(value))values[key]=value;
 return values;
}
