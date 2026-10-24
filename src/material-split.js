import {itemSourceGeometry,geometryMaterialRecipe} from './craft-region-ops.js';
import {rectangleGeometry,normalizeGeometry,geometryIntersection,geometryDifference,
 geometryArea,geometryBounds,transformGeometry,assertConnected,AREA_EPSILON} from './craft-topology.js';

const square=[[0,0],[1,0],[1,1],[0,1]];
const valid=p=>Array.isArray(p)&&p.length===2&&p.every(x=>Number.isFinite(x)&&x>=0&&x<=1);
function clipSide(points,from,to,sign){
 const cross=p=>(to[0]-from[0])*(p[1]-from[1])-(to[1]-from[1])*(p[0]-from[0]);
 const inside=p=>cross(p)*sign>=-1e-9;
 const output=[];
 for(let i=0;i<points.length;i++){
  const a=points[i],b=points[(i+1)%points.length],da=cross(a),db=cross(b);
  if(inside(a))output.push(a);
  if(inside(a)!==inside(b)){
   const t=da/(da-db);output.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);
  }
 }
 return output.filter((p,i)=>i===0||Math.hypot(p[0]-output[i-1][0],p[1]-output[i-1][1])>1e-8);
}
export function splitMaterialRegions(item,asset,{mode='vertical',position=.5,from,to,points}={}){
 if(!(asset?.physicalWidthMM>0&&asset?.physicalHeightMM>0))throw Error('请先确认源素材的真实尺寸');
 const crop=item.cropRect||{x:0,y:0,width:1,height:1};
 const full=itemSourceGeometry(item,asset),sx=crop.width*asset.physicalWidthMM,sy=crop.height*asset.physicalHeightMM;
 if(!(sx>0&&sy>0))throw Error('没有可分割的有效素材区域');
 let selected;
 if(mode==='vertical'||mode==='horizontal'||mode==='line'){
  if(mode!=='line'&&!(position>.02&&position<.98))throw Error('分割位置须处于素材内部');
  const a=mode==='vertical'?[position,0]:mode==='horizontal'?[0,position]:from;
  const b=mode==='vertical'?[position,1]:mode==='horizontal'?[1,position]:to;
  if(!valid(a)||!valid(b)||Math.hypot(a[0]-b[0],a[1]-b[1])<.05)
    throw Error('分割线无效');
  const clipped=clipSide(square,a,b,1);
  if(clipped.length<3)throw Error('分割线没有穿过素材');
  selected=normalizeGeometry([[clipped]]);
 }else if(mode==='lasso'){
  if(!Array.isArray(points)||points.length<3||points.length>128||!points.every(valid))
   throw Error('套索至少需要三个有效顶点');
  selected=normalizeGeometry([[points]]);
 }else throw Error('不支持的分割方式');
 const selectedGlobal=transformGeometry(selected,p=>[
  (crop.x+p[0]*crop.width)*asset.physicalWidthMM,
  (crop.y+p[1]*crop.height)*asset.physicalHeightMM]);
 const left=geometryIntersection(full,selectedGlobal);
 const right=geometryDifference(full,selectedGlobal);
 if(geometryArea(left)<=AREA_EPSILON||geometryArea(right)<=AREA_EPSILON)
   throw Error('分割必须产生两个非空裁片');
 assertConnected(left);assertConnected(right);
 const recipes=[left,right].map(g=>geometryMaterialRecipe(g,asset));
 // Keeping both pieces must conserve real source area and never overlap.
 if(Math.abs(geometryArea(left)+geometryArea(right)-geometryArea(full))>AREA_EPSILON)
   throw Error('裁片面积校验失败，未修改原图层');
 return recipes;
}
export function splitMaterialInDraft(draft,asset,itemId,spec,{uid=()=>crypto.randomUUID()}={}){
 const parent=draft.items.find(item=>item.id===itemId);
 if(!parent||parent.assetID!==asset.id)throw Error('画布上找不到要分割的素材');
 if(parent.isLocked||parent.locked)throw Error('请先解锁素材');
 const [first,second]=splitMaterialRegions(parent,asset,spec),crop=parent.cropRect||
   {x:0,y:0,width:1,height:1};
 const oldCenter=[(crop.x+crop.width/2)*asset.physicalWidthMM,
                  (crop.y+crop.height/2)*asset.physicalHeightMM],
  scale=draft.canvas.height/(draft.physicalPageHeightMM||297),
  rad=(parent.rotation||0)*Math.PI/180,
  id=uid(),sourceParent=parent.splitParentId||parent.id;
 const pieces=[first,second].map((recipe,i)=>{
   const bbox=recipe.box;
   const dx=(bbox.x+bbox.width/2-oldCenter[0])*scale,dy=(bbox.y+bbox.height/2-oldCenter[1])*scale;
   const extra=(i===0?-10:10);
   const value={...structuredClone(parent),id:uid(),
     cropRect:recipe.crop,materialMask:recipe.mask,
     cropSteps:[recipe.crop],
     splitParentId:sourceParent,splitGroupId:id,
     splitPartIndex:i,isParked:false,
     materialSteps:[{op:'crop',box:{unit:'ratio',mode:'keep',values:[
       recipe.crop.x,recipe.crop.y,recipe.crop.width,recipe.crop.height]}}],
     x:parent.x+dx*Math.cos(rad)-dy*Math.sin(rad)+extra*Math.cos(rad),
     y:parent.y+dx*Math.sin(rad)+dy*Math.cos(rad)+extra*Math.sin(rad),
     width:bbox.width*scale,height:bbox.height*scale,
     zIndex:(parent.zIndex||0)+i};
   delete value.craftDisplaySlices;
   value.userOverrideFlags=[...new Set([...(value.userOverrideFlags||[]),'split'])];
   return value;
 });
 const ix=draft.items.findIndex(item=>item.id===itemId);
 draft.items.splice(ix,1,...pieces);
 return pieces;
}
// A split part is never silently thrown away by a normal Delete action:
// it becomes a recoverable physical offcut in the editor's standby drawer.
export function retireSplitPiece(draft,id){
 const item=draft.items.find(row=>row.id===id);
 if(!item?.splitParentId)return false;
 item.isParked=true;return true;
}
