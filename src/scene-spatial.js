// Scene coordinates are page pixels. A spatial group owns a rigid local frame;
// its descendants keep their own coordinates in that frame. Legacy groups have
// no frame and therefore remain an identity transform.
export const IDENTITY=Object.freeze([1,0,0,1,0,0]);
export const multiplyMatrix=(a,b)=>[
 a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],
 a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],
 a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]
];
export function inverseMatrix(m){
 const det=m[0]*m[3]-m[1]*m[2];
 if(!Number.isFinite(det)||Math.abs(det)<1e-12)throw Error('父组变换不可逆');
 return [m[3]/det,-m[1]/det,-m[2]/det,m[0]/det,
  (m[2]*m[5]-m[3]*m[4])/det,(m[1]*m[4]-m[0]*m[5])/det];
}
export const transformPoint=(m,x,y)=>({x:m[0]*x+m[2]*y+m[4],y:m[1]*x+m[3]*y+m[5]});
export const rigidMatrix=(x=0,y=0,rotation=0)=>{const a=rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a);return [c,s,-s,c,x,y];};
export const matrixAngle=m=>Math.atan2(m[1],m[0])*180/Math.PI;
export function assertRigidMatrix(m){
 if(!Array.isArray(m)||m.length!==6||!m.every(Number.isFinite))throw Error('组的局部矩阵无效');
 const [a,b,c,d]=m,eps=1e-6;
 if(Math.abs(a*a+b*b-1)>eps||Math.abs(c*c+d*d-1)>eps||Math.abs(a*c+b*d)>eps||Math.abs(a*d-b*c-1)>eps)
  throw Error('组的局部矩阵只能平移和旋转，不能缩放、镜像或斜切实体素材');
 return m;
}
export const groupMatrix=node=>node.type==='group'&&node.localTransform?assertRigidMatrix(node.localTransform):IDENTITY;
export function spatialPath(nodes,id,parentWorld=IDENTITY,ancestors=[]){
 for(const node of nodes||[]){
  const world=node.type==='group'?multiplyMatrix(parentWorld,groupMatrix(node)):multiplyMatrix(parentWorld,rigidMatrix(node.x||0,node.y||0,node.rotation||0));
  const entry={node,parentWorld,world,ancestors};
  if([node.id,node.key,node.agentKey,node.creativePieceID].includes(id))return entry;
  if(node.type==='group'){
   const found=spatialPath(node.children,id,world,[...ancestors,node]);if(found)return found;
  }
 }
 return null;
}
export function worldBox(page,id){
 const path=spatialPath(page.layers,id);if(!path)throw Error('定位参照图层不存在：'+id);
 const {node,world}=path;
 if(node.type==='group'){
  if(!node.layoutBox)throw Error('组参照需要稳定的 layoutBox');
  return {cx:world[4],cy:world[5],w:node.layoutBox.width,h:node.layoutBox.height,rotation:matrixAngle(world)};
 }
 if(node.type==='ink'){
  const points=node.points.map(p=>transformPoint(path.parentWorld,p.x,p.y));
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
  return {cx:(Math.min(...xs)+Math.max(...xs))/2,cy:(Math.min(...ys)+Math.max(...ys))/2,
   w:Math.max(node.width||1,Math.max(...xs)-Math.min(...xs)),h:Math.max(node.width||1,Math.max(...ys)-Math.min(...ys)),
   rotation:(node.layoutRotation||0)+matrixAngle(path.parentWorld)};
 }
 return {cx:world[4],cy:world[5],w:node.width,h:node.height,rotation:matrixAngle(world)};
}
export function setWorldPosition(page,id,{x,y,rotation}){
 const path=spatialPath(page.layers,id);if(!path)throw Error('定位图层不存在：'+id);
 const {node,parentWorld}=path;
 if(node.type==='group'){
  const angle=rotation??matrixAngle(path.world);
  node.localTransform=multiplyMatrix(inverseMatrix(parentWorld),rigidMatrix(x,y,angle));
  assertRigidMatrix(node.localTransform);
 }else if(node.type==='ink'){
  const box=worldBox(page,id),angle=((rotation??box.rotation)-box.rotation)*Math.PI/180,
   cos=Math.cos(angle),sin=Math.sin(angle),inverse=inverseMatrix(parentWorld);
  node.points=node.points.map(point=>{
   const world=transformPoint(parentWorld,point.x,point.y),dx=world.x-box.cx,dy=world.y-box.cy;
   const local=transformPoint(inverse,x+dx*cos-dy*sin,y+dx*sin+dy*cos);
   return {...point,x:local.x,y:local.y};
  });
  node.layoutRotation=(rotation??box.rotation)-matrixAngle(parentWorld);
 }else{
  const point=transformPoint(inverseMatrix(parentWorld),x,y);
  node.x=point.x;node.y=point.y;
  if(rotation!==undefined)node.rotation=rotation-matrixAngle(parentWorld);
 }
 return node;
}
export function convertNodeFrame(node,oldParentWorld,newParentWorld){
 const change=multiplyMatrix(inverseMatrix(newParentWorld),oldParentWorld);
 if(node.type==='group')node.localTransform=multiplyMatrix(change,groupMatrix(node));
 else if(node.type==='ink'){
  node.points=node.points.map(p=>({...p,...transformPoint(change,p.x,p.y)}));
  node.layoutRotation=(node.layoutRotation||0)+matrixAngle(oldParentWorld)-matrixAngle(newParentWorld);
 }
 else{
  const matrix=multiplyMatrix(change,rigidMatrix(node.x,node.y,node.rotation||0));
  node.x=matrix[4];node.y=matrix[5];node.rotation=matrixAngle(matrix);
 }
 return node;
}
