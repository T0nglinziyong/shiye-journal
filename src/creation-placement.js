// Public creation commands use millimetres. The existing Scene v2 stores
// centres and dimensions in canvas units; convert only at this boundary.
import {spatialPath,worldBox,matrixAngle} from './scene-spatial.js';
const anchors={
 'top-left':[0,0],'top-center':[.5,0],'top-right':[1,0],
 'middle-left':[0,.5],center:[.5,.5],'middle-right':[1,.5],
 'bottom-left':[0,1],'bottom-center':[.5,1],'bottom-right':[1,1]
};
const rotate=(x,y,degrees)=>{const a=degrees*Math.PI/180,c=Math.cos(a),s=Math.sin(a);return [x*c-y*s,x*s+y*c];};
export function creationReferenceBox(page,reference,parentID){
 const width=page.canvas.width,height=page.canvas.height;
 if(reference==='page'||reference==='parent'&&!parentID)return {cx:width/2,cy:height/2,w:width,h:height,rotation:0};
 if(reference==='parent')return worldBox(page,parentID);
 if(reference==='page.left'||reference==='page.right'){
  if(page.pageMode!=='spread')throw Error('单页不能引用 page.left/right');
  return {cx:reference==='page.left'?width/4:width*3/4,cy:height/2,w:width/2,h:height,rotation:0};
 }
 if(reference.startsWith('node:')){
  return worldBox(page,reference.slice(5));
 }
 throw Error('尚未定义的定位参照：'+reference);
}
export function resolveCreationPlace(page,place,{widthMm,heightMm,rotationDeg=0,parentID=null}={}){
 if(!place||typeof place!=='object')throw Error('缺少 place');
 if(place.referenceBounds==='visible'||place.targetBounds==='visible')throw Error('当前 Scene 尚不能解析 visible 锚点');
 if(!Number.isFinite(widthMm)||!Number.isFinite(heightMm)||widthMm<=0||heightMm<=0)throw Error('定位需要已确定的目标尺寸');
 const scale=page.canvas.height/page.physicalPageHeightMM,ref=creationReferenceBox(page,place.reference,parentID);
 if(!(ref.w>0&&ref.h>0))throw Error('定位参照没有有效边界');
 const at=place.at,ra=place.referenceAnchor;
 if((at!==undefined)===(ra!==undefined))throw Error('place.at 与 referenceAnchor 必须且只能选择其一');
 let lx,ly;
 if(at){
  if(!Array.isArray(at)||at.length!==2||!at.every(Number.isFinite)||!['mm','ratio'].includes(place.unit))throw Error('place.at 坐标或单位无效');
  [lx,ly]=place.unit==='mm'?[at[0]*scale-ref.w/2,at[1]*scale-ref.h/2]:[(at[0]-.5)*ref.w,(at[1]-.5)*ref.h];
 }else{
  const a=anchors[ra];if(!a||place.unit!==undefined)throw Error('referenceAnchor 或 unit 无效');
  [lx,ly]=[(a[0]-.5)*ref.w,(a[1]-.5)*ref.h];
 }
 if(place.axes==='page'&&ref.rotation){
  const corners=[[-ref.w/2,-ref.h/2],[ref.w/2,-ref.h/2],[-ref.w/2,ref.h/2],[ref.w/2,ref.h/2]].map(([x,y])=>rotate(x,y,ref.rotation));
  const xs=corners.map(p=>p[0]),ys=corners.map(p=>p[1]),w=Math.max(...xs)-Math.min(...xs),h=Math.max(...ys)-Math.min(...ys);
  if(at)[lx,ly]=place.unit==='mm'?[at[0]*scale-w/2,at[1]*scale-h/2]:[(at[0]-.5)*w,(at[1]-.5)*h];
  else {const a=anchors[ra];[lx,ly]=[(a[0]-.5)*w,(a[1]-.5)*h];}
 }
 let [rx,ry]=place.axes==='page'?[lx,ly]:rotate(lx,ly,ref.rotation);
 let x=ref.cx+rx,y=ref.cy+ry;
 if(place.offset){
  const {value,unit,space='reference'}=place.offset;
  if(!Array.isArray(value)||value.length!==2||!value.every(Number.isFinite)||!['mm','ratio'].includes(unit)||!['reference','page','parent'].includes(space))throw Error('place.offset 无效');
  const [ox,oy]=unit==='mm'?value.map(v=>v*scale):[value[0]*ref.w,value[1]*ref.h];
  [rx,ry]=space==='reference'?rotate(ox,oy,ref.rotation):space==='parent'&&parentID?rotate(ox,oy,matrixAngle(spatialPath(page.layers,parentID).world)):[ox,oy];x+=rx;y+=ry;
 }
 const anchor=anchors[place.anchor||'center'];if(!anchor)throw Error('目标锚点无效');
 if(!['parent','page','reference',undefined].includes(place.rotationSpace))throw Error('旋转空间无效');
 const parentRotation=parentID?matrixAngle(spatialPath(page.layers,parentID).world):0;
 const rotation=(place.rotationDeg??rotationDeg)+(place.rotationSpace==='page'?0:place.rotationSpace==='reference'?ref.rotation:parentRotation);
 if(!Number.isFinite(rotation))throw Error('旋转角度无效');
 const [ax,ay]=rotate((anchor[0]-.5)*widthMm*scale,(anchor[1]-.5)*heightMm*scale,rotation);
 return {x:x-ax,y:y-ay,rotation};
}
