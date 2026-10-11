// A Scene is the existing editable Draft, not a second copy of its layers.
// Four leaf collections remain authoritative to preserve the editor and
// physical-material algorithms; shared presentation metadata is validated here.
export const SCENE_VERSION=1;
export const SCENE_FORMAT='shiye-scene';
export const PHYSICAL_BLEND_MODES=Object.freeze(['normal','multiply']);
const kinds=[['material','items'],['shape','primitives'],['text','textBlocks'],['ink','strokes']];
const visible=item=>!item.hidden&&!item.isHidden&&!item.isParked&&!item.parked;
const numeric=(n,lo,hi)=>typeof n==='number'&&Number.isFinite(n)&&n>=lo&&n<=hi;
export function sceneLayerEntries(draft,{hidden=false,ink=true}={}){
  const all=kinds.flatMap(([kind,field])=>kind==='ink'&&!ink?[]:
    (draft?.[field]||[]).filter(item=>hidden||visible(item)).map((value,index)=>({kind,value,index})));
  return all.sort((a,b)=>(a.value.zIndex??(a.kind==='ink'?2000:0))-
    (b.value.zIndex??(b.kind==='ink'?2000:0)));
}
export function sceneGroupMembers(draft,id){
  return sceneLayerEntries(draft,{hidden:true}).filter(e=>e.value.creativeGroupID===id);
}
export function groupSceneLayers(draft,ids,{id='group-'+crypto.randomUUID(),name='手帐组合'}={}){
  if(!Array.isArray(ids)||ids.length<2||ids.length>80||new Set(ids).size!==ids.length)throw Error('请选择 2–80 个不同图层进行编组');
  const all=sceneLayerEntries(draft,{hidden:true}),chosen=all.filter(e=>ids.includes(e.value.id));
  if(chosen.length!==ids.length||chosen.some(e=>e.value.isLocked||e.value.locked))throw Error('分组包含不存在或锁定的图层');
  if(!/^[-a-zA-Z0-9_]{1,96}$/.test(id))throw Error('组合编号无效');
  draft.layerGroups||=[];
  if(draft.layerGroups.some(g=>g.id===id))throw Error('组合编号重复');
  // A group is an edit-together selection, not a scale transform. This
  // guarantees physical sticker dimensions and piece inventory do not change.
  for(const entry of chosen)entry.value.creativeGroupID=id;
  draft.layerGroups.push({id,name:String(name).slice(0,80),kind:'physical-arrangement'});
  draft.sceneVersion=SCENE_VERSION;
  return id;
}
export function ungroupSceneLayers(draft,id){
  const group=(draft.layerGroups||[]).find(x=>x.id===id);
  if(!group)return false;
  for(const e of sceneGroupMembers(draft,id))delete e.value.creativeGroupID;
  draft.layerGroups=draft.layerGroups.filter(x=>x.id!==id);
  draft.sceneVersion=SCENE_VERSION;
  return true;
}
export function validateVectorMask(mask){
  if(!mask||typeof mask!=='object'||Array.isArray(mask)||Object.keys(mask).some(k=>!['outer','holes'].includes(k)))throw Error('图层蒙版必须是轮廓和孔洞');
  const ring=(points)=>Array.isArray(points)&&points.length>=3&&points.length<=256&&
    points.every(p=>Array.isArray(p)&&p.length===2&&p.every(v=>numeric(v,0,1)));
  if(!ring(mask.outer)||!Array.isArray(mask.holes||[])||(mask.holes||[]).length>16||!(mask.holes||[]).every(ring))throw Error('图层蒙版坐标无效（必须为 0–1 轮廓）');
  return mask;
}
export function maskSVG(mask){
  validateVectorMask(mask);
  // All SVG content is numeric; no markup or URI from untrusted AI output.
  const part=pts=>pts.map(([x,y],i)=>(i?'L':'M')+x+' '+y).join(' ')+' Z';
  const geometry=[mask.outer,...mask.holes||[]].map(part).join(' ');
  return '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 1 1" preserveAspectRatio="none"><path fill="white" fill-rule="evenodd" d="'+geometry+'"/></svg>';
}
export function applyVectorMask(ctx,mask,width,height){
  validateVectorMask(mask);
  ctx.beginPath();
  for(const ring of [mask.outer,...mask.holes||[]]){
    ring.forEach(([x,y],i)=>{if(i)ctx.lineTo((x-.5)*width,(y-.5)*height);else ctx.moveTo((x-.5)*width,(y-.5)*height);});
    ctx.closePath();
  }
  ctx.clip('evenodd');
}
export function sceneLayerStyle(layer){
  if(layer.blendMode!==undefined&&!PHYSICAL_BLEND_MODES.includes(layer.blendMode))throw Error('不支持不符合实体叠压的混合模式');
  if(layer.vectorMask)validateVectorMask(layer.vectorMask);
  return {blendMode:layer.blendMode||'normal',mask:layer.vectorMask||null};
}
export function validateSceneExtensions(draft){
  if(!draft||!draft.canvas||!numeric(draft.canvas.width,1,10000)||!numeric(draft.canvas.height,1,10000))throw Error('Scene 画布尺寸无效');
  if(draft.sceneVersion!==undefined&&draft.sceneVersion!==SCENE_VERSION)throw Error('不支持的 Scene 版本');
  const groups=draft.layerGroups||[];
  if(!Array.isArray(groups)||groups.length>256)throw Error('Scene 分组数量无效');
  const groupIDs=new Set();
  for(const g of groups){
    if(!g||!/^[-a-zA-Z0-9_]{1,96}$/.test(g.id||'')||groupIDs.has(g.id)||typeof g.name!=='string'||g.name.length>80||g.kind!=='physical-arrangement')throw Error('Scene 图层组无效');
    groupIDs.add(g.id);
  }
  const seen=new Set();
  for(const {value,kind} of sceneLayerEntries(draft,{hidden:true})){
    if(typeof value.id!=='string'||!value.id||seen.has(value.id))throw Error('Scene 图层 ID 无效或重复');
    seen.add(value.id);
    sceneLayerStyle(value);
    if(kind==='ink'&&value.vectorMask)throw Error('笔迹蒙版应先转换为独立路径后使用');
    // creativeGroupID existed before the formal group registry; imported
    // legacy selection groups remain valid until explicitly regrouped.
    if(kind==='ink'&&value.zIndex!==undefined&&!numeric(value.zIndex,-100000,100000))throw Error('笔迹图层顺序无效');
  }
  return true;
}
export function canonicalScene(draft){
  validateSceneExtensions(draft);
  return {format:SCENE_FORMAT,version:SCENE_VERSION,scene:structuredClone({...draft,sceneVersion:SCENE_VERSION})};
}
