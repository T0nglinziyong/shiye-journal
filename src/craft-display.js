import {craftAssert} from './craft-errors.js';
import {sceneLayerEntries} from './scene-model.js';
import {materialMaskGeometry} from './material-mask.js';
import {normalizeGeometry,geometryIntersection,geometryDifference,geometryUnion,geometryArea,geometryBounds,rectangleGeometry,transformGeometry,AREA_EPSILON} from './craft-topology.js';

const open=ring=>ring.length>3&&ring[0][0]===ring.at(-1)[0]&&ring[0][1]===ring.at(-1)[1]?ring.slice(0,-1):ring;
const rectangle=()=>rectangleGeometry(0,0,1,1);
export function localMaterialGeometry(item){
 const g=materialMaskGeometry(item.materialMask);
 return g?normalizeGeometry([[g.outer,...g.holes]]):rectangle();
}
const keyOf=item=>item.creativePieceID||item.agentKey||item.key||item.id;
const rotate=(p,degrees)=>{const a=degrees*Math.PI/180;return [p[0]*Math.cos(a)-p[1]*Math.sin(a),p[0]*Math.sin(a)+p[1]*Math.cos(a)];};
const toPage=(item,p)=>{const [x,y]=rotate([(p[0]-.5)*item.width*(item.isFlippedHorizontally?-1:1),(p[1]-.5)*item.height],item.rotation||0);return [item.x+x,item.y+y];};
const fromPage=(item,p)=>{const [x,y]=rotate([p[0]-item.x,p[1]-item.y],-(item.rotation||0));return [x/item.width*(item.isFlippedHorizontally?-1:1)+.5,y/item.height+.5];};

export function validateDisplaySlices(item){
 if(item.craftDisplaySlices===undefined)return;
 const slices=item.craftDisplaySlices;
 craftAssert(Array.isArray(slices)&&slices.length<=8,'DISPLAY_FRAGMENT_BUDGET','同一实体最多 8 组局部显示层');
 let used=[];const ids=new Set();
 for(const slice of slices){
  craftAssert(slice&&Object.keys(slice).every(k=>['id','geometryRatio','zOffset','targetId','kind'].includes(k)),'INVALID_DISPLAY_FRAGMENT','局部显示不能包含独立位置、缩放或新的材料');
  craftAssert(typeof slice.id==='string'&&/^[a-zA-Z0-9_-]{1,96}$/.test(slice.id)&&!ids.has(slice.id),'INVALID_DISPLAY_FRAGMENT','局部显示编号无效');ids.add(slice.id);
  craftAssert(Number.isInteger(slice.zOffset)&&Math.abs(slice.zOffset)<=20000,'INVALID_DISPLAY_FRAGMENT','局部显示层序无效');
  craftAssert(typeof slice.targetId==='string'&&slice.targetId.length<=192&&slice.kind==='two-hole-weave','INVALID_DISPLAY_FRAGMENT','局部显示来源无效');
  const g=normalizeGeometry(slice.geometryRatio);
  craftAssert(g.flat(2).every(p=>p[0]>=0&&p[0]<=1&&p[1]>=0&&p[1]<=1),'DISPLAY_FRAGMENT_OUTSIDE','局部显示必须在原片比例坐标内');
  craftAssert(geometryArea(geometryIntersection(used,g))<=1e-10,'DISPLAY_FRAGMENT_OVERLAP','同一实体的显示片段不可重复');used=geometryUnion(used,g);
 }
}
// Render projections only. A projected fragment has its owner's source crop,
// physical transform and appearance. It is never added as a source material.
export function projectMaterialViews(item){
 if(!item.craftDisplaySlices?.length)return [{...item,renderKey:item.id,ownerID:item.id}];
 validateDisplaySlices(item);
 const source=localMaterialGeometry(item),parts=[];let claimed=[];
 const emit=(geometry,suffix,z)=>{for(const [index,polygon] of geometry.entries())parts.push({...item,
  materialMask:{shape:'region',outer:open(polygon[0]),holes:polygon.slice(1).map(open)},
  zIndex:z,renderKey:item.id+':'+suffix+':'+index,ownerID:item.id});};
 for(const slice of item.craftDisplaySlices){const g=geometryIntersection(source,normalizeGeometry(slice.geometryRatio));claimed=geometryUnion(claimed,g);emit(g,slice.id,(item.zIndex||0)+slice.zOffset);}
 emit(geometryDifference(source,claimed),'base',item.zIndex||0);
 craftAssert(parts.length<=64,'DISPLAY_FRAGMENT_BUDGET','局部显示碎片过多');return parts;
}
// A single source piece may be projected into front/back visibility pieces.
// These projections never exist in the saved Scene and consume no new source material.
// Calling surfaces must sort siblings AFTER expansion, so a piece can actually
// pass both behind and in front of another independent physical layer.
export function sceneDisplaySiblings(nodes){
 const z=node=>node.zIndex??(node.type==='ink'?2000:0);
 return (nodes||[]).flatMap(node=>node.type==='material'
   ?projectMaterialViews(node).map(piece=>({...piece,type:'material',__sceneProjection:true}))
   :[node]).sort((a,b)=>z(a)-z(b));
}
export function sceneRenderEntries(draft){
 // The tree controls ordering for material, text, graphics and ink.
 return sceneLayerEntries(draft,{ink:true})
  .flatMap(entry=>entry.kind==='material'
    ?projectMaterialViews(entry.value).map(value=>({kind:'material',value}))
    :[{kind:entry.kind,value:entry.value}]);
}

export function weaveOpeningPosition(strip,target,index){
 const holes=materialMaskGeometry(target.materialMask)?.holes||[];
 craftAssert(holes[index],'WEAVE_NEEDS_OPENINGS','穿插引用的真实开孔不存在');
 const hole=transformGeometry(normalizeGeometry([[holes[index]]]),p=>fromPage(strip,toPage(target,p))),b=geometryBounds(hole);
 return strip.width>=strip.height?b.x+b.width/2:b.y+b.height/2;
}

// Each crossing must pass through a real aperture wide enough for the full
// physical strip. The saved slices are display projections of one source piece.
export function compileTwoHoleWeaves(draft,weaves=[]){
 craftAssert(Array.isArray(weaves)&&weaves.length<=8,'WEAVE_BUDGET','一次最多 8 组穿插');
 const lookup=key=>draft.items.find(i=>keyOf(i)===key||i.id===key),seen=new Set();
 for(const weave of weaves){
  const strip=lookup(weave.piece);
  const crossings=weave.through||weave.holes?.map((hole,i)=>({target:weave.target,hole,
   sideAfter:i===0?(weave.front==='outside'?'back':'front'):(weave.front==='outside'?'front':'back')}));
  craftAssert(strip&&Array.isArray(crossings)&&crossings.length>=2&&crossings.length<=16&&!seen.has(strip.id),
   'INVALID_WEAVE','穿插需要一件纸条和 2–16 个真实开孔');seen.add(strip.id);
  craftAssert(!strip.isLocked&&!strip.locked,'LAYER_LOCKED','不能对锁定素材制作穿插');
  const targets=crossings.map(entry=>lookup(entry.target));
  craftAssert(targets.every(target=>target&&target!==strip&&!target.craftDisplaySlices?.length),
   'UNSUPPORTED_WEAVE_GRAPH','穿插目标不存在、与纸条相同或已经局部穿插');
  const horizontal=strip.width>=strip.height,centers=[],used=new Set();
  const stripGeometry=localMaterialGeometry(strip);
  craftAssert(geometryArea(stripGeometry)>.98,'WEAVE_STRIP_SHAPE','此穿插宏需要接近完整的直条；复杂形状请明确设计独立裁片');
  for(const [i,entry] of crossings.entries()){
   const target=targets[i],holes=materialMaskGeometry(target.materialMask)?.holes||[],index=entry.hole;
   craftAssert(Number.isInteger(index)&&index>=0&&index<holes.length&&!used.has(target.id+':'+index),
    'WEAVE_NEEDS_OPENINGS','穿插引用的真实开孔不存在或重复');used.add(target.id+':'+index);
   const hole=transformGeometry(normalizeGeometry([[holes[index]]]),p=>fromPage(strip,toPage(target,p)));
   const center=weaveOpeningPosition(strip,target,index);
   craftAssert(center>.01&&center<.99,'WEAVE_OUTSIDE_STRIP','开孔必须落在纸条的有效长度内');
   // A narrow band on each opening's midpoint must contain the complete width.
   const band=horizontal?rectangleGeometry(center-.00005,0,.0001,1):rectangleGeometry(0,center-.00005,1,.0001);
   craftAssert(geometryArea(geometryDifference(band,hole))<1e-10,'WEAVE_OPENING_TOO_NARROW','开孔无法容纳纸条的实际宽度；不可缩小或拉伸素材');
   centers.push({center,sideAfter:entry.sideAfter,target});
  }
  centers.sort((a,b)=>a.center-b.center);
  for(let i=1;i<centers.length;i++)craftAssert(centers[i].center-centers[i-1].center>.01&&centers[i].sideAfter!==centers[i-1].sideAfter,
   'WEAVE_OPENINGS_OVERLAP','开孔重叠或穿插正反顺序未交替');
  const bands=[];let begin=0,side=centers[0].sideAfter==='front'?'back':'front';
  for(const entry of [...centers,{center:1}]){
   if(side==='front'&&entry.center-begin>1e-9)
    bands.push(horizontal?rectangleGeometry(begin,0,entry.center-begin,1):rectangleGeometry(0,begin,1,entry.center-begin));
   begin=entry.center;side=entry.sideAfter;
  }
  const geometry=bands.length?geometryUnion(...bands):[];
  const targetZ=targets.map(target=>target.zIndex||0);
  strip.zIndex=Math.min(...targetZ)-1;
  strip.craftDisplaySlices=geometry.length?[{id:'weave-front',kind:'two-hole-weave',targetId:targets[0].id,
   geometryRatio:geometry,zOffset:Math.max(...targetZ)-strip.zIndex+1}]:[];
  validateDisplaySlices(strip);
 }
}
