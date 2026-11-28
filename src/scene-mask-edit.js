// Shared mask semantics for Command and the visual inspector. Display only;
// never edits physical source geometry or the material occupancy ledger.
import {creationRegionGeometry} from './creation-region.js';
import {geometryToMask} from './craft-region-ops.js';
import {normalizeGeometry,rectangleGeometry,geometryDifference,geometryIntersection} from './craft-topology.js';
import {worldBox} from './scene-spatial.js';
import {findSceneNode,validateVectorMask} from './scene-v2.js';
import {applySceneNodePatch} from './scene-edit-kernel.js';
import {USER_SCENE_POLICY} from './scene-edit-policy.js';

export function sceneMaskPatch(page,id,{mode,region},assets=[]){
 const target=findSceneNode(page,id);if(!target)throw Error('显示遮罩的图层不存在');
 if(!['replace','intersect','subtract','clear'].includes(mode))throw Error('不支持的显示遮罩操作');
 if(mode==='clear')return {vectorMask:undefined,vectorMaskHistory:undefined};
 if(target.type==='ink')throw Error('请将笔迹编组后设置组合遮罩');
 if(!region)throw Error('请选择显示区域');
 if(target.type!=='material'&&region.space!=='local')throw Error('数字节点遮罩使用 local 坐标');
 const s=page.canvas.height/page.physicalPageHeightMM;
 const box=target.type==='group'&&!target.localTransform?{w:page.canvas.width,h:page.canvas.height}:worldBox(page,target.id);
 const asset=target.type==='material'?assets.find(a=>a.id===target.assetID):null;
 if(target.type==='material'&&!asset)throw Error('素材来源缺失，无法设置显示遮罩');
 const shape=creationRegionGeometry(region,{sourceSize:asset?[asset.physicalWidthMM,asset.physicalHeightMM]:[box.w/s,box.h/s],localSize:[box.w/s,box.h/s],crop:asset?(target.cropRect||{x:0,y:0,width:1,height:1}):{x:0,y:0,width:1,height:1},output:'localRatio'});
 const old=target.vectorMask?normalizeGeometry([[target.vectorMask.outer,...(target.vectorMask.holes||[])]]):rectangleGeometry(0,0,1,1);
 const next=mode==='subtract'?geometryDifference(old,shape):mode==='intersect'?geometryIntersection(old,shape):geometryIntersection(rectangleGeometry(0,0,1,1),shape);
 const {outer,holes}=geometryToMask(next,1,1),mask={outer,holes};validateVectorMask(mask);
 return {vectorMask:mask};
}
export function applyInspectorMask(page,id,request,assets=[]){
 return applySceneNodePatch(page,id,sceneMaskPatch(page,id,request,assets),{policy:USER_SCENE_POLICY});
}
export const fullDisplayMask=()=>({outer:[[0,0],[1,0],[1,1],[0,1]],holes:[]});
export function maskRequest(mask,mode='replace'){
 validateVectorMask(mask);
 return {mode,region:{shape:'geometry',space:'local',unit:'ratio',geometry:[[mask.outer,...(mask.holes||[])]]}};
}
export function maskRingPreset(kind,hole=false){
 const start=hole?0.3:0,size=hole?0.4:1;
 if(kind==='ellipse')return Array.from({length:48},(_,i)=>{const a=i*Math.PI/24;return [start+size/2+size/2*Math.cos(a),start+size/2+size/2*Math.sin(a)];});
 if(kind==='rect')return [[start,start],[start+size,start],[start+size,start+size],[start,start+size]];
 throw Error('未知遮罩形状');
}
