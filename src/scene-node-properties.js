import {validateGraphicEffects} from './graphic-effects.js';
import {replaceGraphicGeometry} from './graphic-geometry.js';
import {validateTextEffects} from './text-effects.js';
// Public property language -> canonical Scene data, followed by ONE reflow.
// Called by all create/update paths before anchors and linked dependencies.
import {dimension,dimensions,resizeDigitalNode} from './scene-sizing.js';
export {dimension,dimensions} from './scene-sizing.js';
import {assertSceneCapability,AI_SCENE_POLICY} from './scene-edit-policy.js';
const sceneScale=page=>page.canvas.height/page.physicalPageHeightMM;
import {reflowSceneText} from './scene-text-layout.js';

export function styleFor(type,style,page,node={}){
 if(!style)return {};
 const s=sceneScale(page),mapping={opacity:'opacity',blendMode:'blendMode',shadow:'shadow'};
 if(type==='material')mapping.flipHorizontal='isFlippedHorizontally';
 if(type==='text')Object.assign(mapping,{outline:'textOutline',gradient:'textGradient',color:'color',fontSizePt:'fontSize',fontFamily:'fontName',fontPreset:'style',fontWeight:'bold',textAlign:'alignment',italic:'italic',underline:'underline',strikethrough:'strikethrough',letterSpacingMm:'letterSpacing',paragraphSpacingMm:'paragraphSpacing',lineSpacingMm:'lineSpacing',curveHeightMm:'curveHeight',lineHeight:'fixedLineHeight'});
 if(['shape','ink'].includes(type))Object.assign(mapping,{outline:'graphicOutline',gradient:'graphicGradient'});
 if(type==='shape')Object.assign(mapping,{fill:'fill',stroke:'stroke',strokeWidthMm:'lineWidth',fillOpacity:'fillOpacity',strokeOpacity:'strokeOpacity',strokeDash:'strokeDash',cornerRadiusRatio:'cornerRadius'});
 if(type==='ink')Object.assign(mapping,{stroke:'color',strokeWidthMm:'width',penStyle:'penStyle'});
 const result={};
 if(type==='text'&&Object.hasOwn(style,'fontPreset')&&!Object.hasOwn(style,'fontFamily'))result.fontName=null;
 for(const [key,value] of Object.entries(style)){
  if(!mapping[key])throw Error(type+' 不支持 style.'+key);
  if(type==='ink'&&(key==='stroke'&&value===null||key==='strokeWidthMm'&&!(value>0)))throw Error('笔迹需要非空 stroke 和正 strokeWidthMm');
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
 if(change.content!==undefined){if(node.type!=='text')throw Error('content 只适用于文字');next.content=change.content;}
 if(change.name!==undefined){if(node.type!=='group')throw Error('name 只适用于组合');next.name=change.name;}
 if(change.hidden!==undefined){next.hidden=change.hidden;next.isHidden=change.hidden;if(!change.hidden)next.isParked=false;}
 if(change.locked!==undefined){next.isLocked=change.locked;next.locked=change.locked;}
 if(change.layoutBox){if(node.type!=='group'||!node.localTransform)throw Error('layoutBox 只适用于空间组');next.layoutBox={width:change.layoutBox.width*s,height:change.layoutBox.height*s};}
 if(change.kind!==undefined){if(node.type!=='shape'||node.svgPaths)throw Error('kind 只适用于基础图形');next.kind=change.kind==='rect'?'rectangle':change.kind;}
 if(change.geometry)replaceGraphicGeometry(next,change.geometry,s);
 if(change.size&&node.type!=='text'){
  if(node.type==='material'){
   assertSceneCapability(policy,'material.visualResize',[node],confirmation);
   const d=dimensions(page,change.size,{parentID,ratio:node.width/node.height});next.width=d.width*s;next.height=d.height*s;
  }else resizeDigitalNode(page,next,change.size,parentID,change.geometry?.kind==='path'?change.geometry.viewBox[2]/change.geometry.viewBox[3]:undefined);
 }
 if(node.type==='text'){
  if(change.size?.width!==undefined)next.width=dimension(page,change.size,'width',parentID)*s;
  reflowSceneText(next,{...(change.size?.height===undefined?{}:{minimumHeight:dimension(page,change.size,'height',parentID)*s}),...(change.style?.lineHeight===undefined?{}:{lineHeightRatio:change.style.lineHeight})});
 }
 validateTextEffects(next);
 validateGraphicEffects(next);
 const values={};for(const key of new Set([...Object.keys(node),...Object.keys(next)]))if(JSON.stringify(node[key])!==JSON.stringify(next[key]))values[key]=next[key];
 return values;
}
