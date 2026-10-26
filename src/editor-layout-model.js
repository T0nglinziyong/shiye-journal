import {applySceneNodeChange,detachSceneNodeLayout} from './scene-edit-kernel.js';
import {USER_SCENE_POLICY} from './scene-edit-policy.js';
import {creationReferenceBox} from './creation-placement.js';
import {spatialPath,worldBox} from './scene-spatial.js';

export function inspectorReference(page,reference){
 if(reference?.startsWith('node:')){const node=spatialPath(page.layers,reference.slice(5))?.node;if(node)return 'node:'+node.id;}
 return reference;
}
const labels={material:'素材',shape:'图形',text:'文字',ink:'笔迹',group:'组合'};
export function inspectorLayoutModel(page,id,describe=()=>null){
 const path=spatialPath(page.layers,id);if(!path)throw Error('请选择对象');
 const refs=[['page','整页']];
 if(page.pageMode==='spread')refs.push(['page.left','左页'],['page.right','右页']);
 const parent=path.ancestors.at(-1);
 if(parent?.layoutBox)refs.push(['parent','所在组合']);
 let ordinal=0;
 const walk=(nodes)=>{for(const node of nodes){
  ordinal++;
  if(node.id===id)continue; // Descendants cannot be an ancestor's reference.
  if(node.type!=='group'||node.layoutBox)refs.push(['node:'+node.id,
   `${ordinal}. ${(describe(node)||node.name||node.content||labels[node.type]||'对象').slice(0,32)}`]);
  if(node.children)walk(node.children);
 }};walk(page.layers);
 return {references:refs,constraint:path.node.layoutConstraint||{},type:path.node.type,canResize:['text','shape','ink'].includes(path.node.type),parentID:parent?.id};
}
function boxes(page,id,reference){
 const model=inspectorLayoutModel(page,id);
 if(!model.references.some(([key])=>key===inspectorReference(page,reference)))throw Error('请选择有效的跟随对象');
 return {model,box:worldBox(page,id),ref:creationReferenceBox(page,reference,model.parentID)};
}
export function inspectorSizeRatios(page,id,reference){
 const {box,ref}=boxes(page,id,reference);return {width:box.w/ref.w,height:box.h/ref.h};
}
export function inspectorSizeControls(page,id){
 const size=inspectorLayoutModel(page,id).constraint.size,reference=inspectorReference(page,size?.reference||'page');
 const ratios=inspectorSizeRatios(page,id,reference);
 for(const key of ['width','height'])if(size?.[key]!==undefined)ratios[key]=size[key];
 // A persisted text minimum may be smaller than its content's actual height.
 // Reopening the panel must retain the authored ratio, not replace it with reflow output.
 return {reference,ratios,axes:size?.width===undefined&&size?.height!==undefined?'height':size?.height===undefined&&size?.width!==undefined?'width':'both'};
}
export function applyInspectorLayout(page,id,request){
 if(!request||typeof request!=='object')throw Error('跟随设置无效');
 if(request.action==='detach')return detachSceneNodeLayout(page,id,request.scope,{policy:USER_SCENE_POLICY});
 const {model,box,ref}=boxes(page,id,request.reference);
 if(request.action==='size'){
  if(!model.canResize)throw Error('实体素材和组合不能随参照改变尺寸');
  const axes=request.axes??'both';if(!['both','width','height'].includes(axes))throw Error('请选择有效的尺寸变化方式');
  const values=Object.fromEntries((axes==='both'?['width','height']:[axes]).map(key=>[key,Number(request[key])]));
  if(Object.values(values).some(value=>!Number.isFinite(value)||value<=0||value>100000))throw Error('宽高比例必须为正数');
  return applySceneNodeChange(page,id,{size:{reference:request.reference,...values,unit:'ratio',aspect:axes==='both'?'free':'preserve',behavior:'linked'}},{policy:USER_SCENE_POLICY});
 }
 if(request.action!=='place')throw Error('未知跟随操作');
 const mode=request.position||'keep',gap=Number(request.gap??0),follow=request.followRotation===true;
 if(!Number.isFinite(gap)||gap<0||gap>500)throw Error('间距需在 0–500 mm 之间');
 const place={reference:request.reference,behavior:'linked',rotationSpace:follow?'reference':'page',rotationDeg:box.rotation-(follow?ref.rotation:0)};
 if(mode==='keep'){
  const a=-ref.rotation*Math.PI/180,dx=box.cx-ref.cx,dy=box.cy-ref.cy;
  place.at=[.5+(dx*Math.cos(a)-dy*Math.sin(a))/ref.w,.5+(dx*Math.sin(a)+dy*Math.cos(a))/ref.h];place.unit='ratio';
 }else{
  const options={above:['top-center','bottom-center',[0,-gap]],below:['bottom-center','top-center',[0,gap]],left:['middle-left','middle-right',[-gap,0]],right:['middle-right','middle-left',[gap,0]],center:['center','center',[0,0]]};
  const anchors=options[mode];if(!anchors)throw Error('请选择有效的位置');
  [place.referenceAnchor,place.anchor]=anchors;place.offset={value:anchors[2],unit:'mm',space:'reference'};
 }
 return applySceneNodeChange(page,id,{place},{policy:USER_SCENE_POLICY});
}

export function inspectorPlacementControls(place){
 const pairs={above:['top-center','bottom-center',1,-1],below:['bottom-center','top-center',1,1],left:['middle-left','middle-right',0,-1],right:['middle-right','middle-left',0,1],center:['center','center',0,1]};
 for(const [position,[referenceAnchor,anchor,axis,sign]] of Object.entries(pairs)){
  if(place?.referenceAnchor!==referenceAnchor||place.anchor!==anchor||place.axes==='page')continue;
  const offset=place.offset||{value:[0,0],unit:'mm',space:'reference'};
  if(offset.unit==='mm'&&(!offset.space||offset.space==='reference')&&offset.value[1-axis]===0&&offset.value[axis]*sign>=0)
   return {position,gap:String(offset.value[axis]*sign)};
 }
 return {position:'keep',gap:'2'};
}
