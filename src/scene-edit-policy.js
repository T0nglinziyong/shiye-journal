import {assertManagedWritable} from './craft-fingerprint.js';
// Policies are supplied by the trusted caller, never read from a Command or a
// saved Scene. A JSON object cannot grant itself human-only capabilities.
const policies=new WeakSet(),grants=new WeakMap();
const register=value=>{const policy=Object.freeze(value);policies.add(policy);return policy;};
export const AI_SCENE_POLICY=register({actor:'ai',takeover:false,unlock:false,paperGeometry:false});
export const USER_SCENE_POLICY=register({actor:'user',takeover:true,unlock:true,paperGeometry:true});
export function requireScenePolicy(policy){
 if(!policies.has(policy))throw Object.assign(Error('编辑策略必须由可信调用方提供，不能来自命令或作品数据'),{code:'EDIT_POLICY_INVALID'});
 return policy;
}
const sourceState=node=>JSON.stringify([node.id,node.assetID,node.sourceBlobId,node.sourceStaticPath,node.width,node.height,node.cropRect,node.materialMask,node.materialUnitIndex]);
// The UI calls this ONLY after confirmation. Grants are ephemeral, target-
// scoped and tied to the current material state. They are never persisted.
export function confirmSceneCapability(nodes,capability){
 if(!['material.visualResize','material.visualCopy','material.geometry'].includes(capability))throw Error('未知人工确认能力');
 const token=Object.freeze({});
 grants.set(token,{capability,targets:new Map(nodes.filter(n=>n.type==='material').map(n=>[n.id,sourceState(n)]))});
 return token;
}
export function assertSceneCapability(policy,capability,nodes,confirmation){
 requireScenePolicy(policy);
 const materials=nodes.filter(node=>node.type==='material');if(!materials.length)return;
 const grant=grants.get(confirmation);
 if(policy.actor!=='user'||grant?.capability!==capability||materials.some(node=>grant.targets.get(node.id)!==sourceState(node)))
  throw Object.assign(Error(capability==='material.visualResize'?'改变实体素材的显示尺寸需要本次人工确认；真实来源尺寸不变':capability==='material.visualCopy'?'复制实体素材的视觉参考需要人工确认，不能增加实体库存':'修改素材几何需要本次人工确认'),{code:'EDIT_CONFIRMATION_REQUIRED',capability,targets:materials.map(n=>n.id)});
}
export function assertPolicyOwnership(node,policy=AI_SCENE_POLICY){
 requireScenePolicy(policy);if(!policy.takeover)assertManagedWritable(node);return node;
}
export function assertPolicyPatch(before,after,{policy=AI_SCENE_POLICY,confirmation}={}){
 assertPolicyOwnership(before,policy);
 if(before.id!==after.id||before.type!==after.type)throw Error('编辑不能改变图层身份或类型');
 if(policy.actor==='ai')for(const key of ['manualVisualResize','manualVisualCopy','manualGeometryOverride','userOverrideFlags'])
  if(JSON.stringify(before[key])!==JSON.stringify(after[key]))throw Object.assign(Error('AI 不能声明人工编辑权限：'+key),{code:'EDIT_POLICY_DENIED'});
 if(before.type==='material'&&(Math.abs(before.width-after.width)>1e-6||Math.abs(before.height-after.height)>1e-6)){
  // Dedicated craft algorithms validate their geometry separately. This
  // property route is ONLY a visual resize, not physical source modification.
  assertSceneCapability(policy,'material.visualResize',[before],confirmation);
  after.manualVisualResize=true;
  after.userOverrideFlags=[...new Set([...(before.userOverrideFlags||[]),'resized'])];
 }
 return after;
}
