import {stabilizeImportedCraftScene} from './craft-import-identity.js';
// The web creator edits the same native Scene tree used by Fabric and exports.
// Commands are inputs; only the validated snapshot is an importable result.
import {attachSceneV2,sceneLayerEntries,assertSceneEditable,groupSceneLayers,ungroupSceneLayers,removeSceneNode,moveSceneNode,transformSceneGroup} from './scene-v2.js';
import {validateNativeDraft,validatePackageValue} from './native-project-package.js';
import {applyToolCalls,validateScenePhysical} from './creative.js';
import {craftSceneHash,layerFingerprint,isManagedUnchanged,recordManagedChanges} from './craft-fingerprint.js';
import {validateCraftTask,inheritCreationBrief} from './craft-task.js';
import {assetFromSourceSnapshot} from './material-anatomy.js';
import {assertTaskFingerprintSync} from './task-fingerprint.js';
import {canonicalTaskSource} from './task-source.js';
import {schemaFingerprint,validateValue,offlineContract,directPageContract} from './creative-contract.js';
import {materialMaskGeometry} from './material-mask.js';
import {normalizeGeometry,geometryIntersection,geometryArea} from './craft-topology.js';
import {project} from './domain.js';
import {commonShapes,advancedShapes} from './editor-tools-model.js';
import {reviewCreativeDraft} from './creative-quality.js';
import {replaceSceneMaterial,repeatSceneStamp,reuseSceneLayout,knockoutSceneGlyphs} from './scene-advanced-ops.js';

export {webSceneContract} from './web-scene-contract.js';
import {webSceneContract} from './web-scene-contract.js';

export const webSceneCapabilities={version:2,sourcePixelCoordinates:false,cropPx:false,coordinateSystem:'native Scene units; x/y are centers; ink points are absolute; vector masks are normalized; group children retain page coordinates',
  nodes:['material','text','shape','ink','group'],
  operations:['inspect','compile','apply','validate','preview','save-preview','pack','self-test'],
  editing:['all native static Scene fields','atomic tool batches','direct scene editing','nested groups','group transforms','alignment','layer reorder','crop and compound masks','source splits and scraps','physical weave slices','pressure ink','multi-color vectors','curved editable text','repeatable digital stamps','physical material replacement preserving center and stacking','editable layout reuse','local-font glyph knockout','paper styles'],
  excluded:['interactive pockets/flaps/page actions','arbitrary JavaScript','external image URLs','AI resizing/duplicating physical sources'],
  budgets:{documentBytes:8000000,groupDepth:12,sceneNodes:10000,pointsPerStroke:20000,toolCallsPerBatch:12,canvasPixels:32000000,isolatedGroups:8},
  fields:{common:'id,type,x,y,width,height,rotation,zIndex,opacity,blendMode,vectorMask,hidden,isLocked',material:'assetID,sourceBlobId,sourceStaticPath,cropRect,materialMask,materialSteps,materialUnitIndex,creativePieceID,generationBaseline,isFlippedHorizontally,craftDisplaySlices,materialRelation',text:'content,fontSize,fontName,style,color,alignment,bold,italic,underline,strikethrough,lineSpacing,fixedLineHeight,paragraphSpacing,letterSpacing,curveHeight',shape:'kind,fill,stroke,lineWidth,fillOpacity,strokeOpacity,strokeDash,cornerRadius,vectorPaths,vectorLayers',ink:'points:[{x,y,p}],width,color,penStyle,opacity; use pressure for pressure outline',group:'children,name,opacity,blendMode,vectorMask; group mask uses whole page normalized coordinates'},
  provenance:'Create physical pieces with tools first; source geometry and manual provenance are checked even when editing JSON directly.'};
const same=(a,b)=>canonicalTaskSource(a)===canonicalTaskSource(b);
const pageFields=new Set(['sceneVersion','canvas','pageMode','pageRatio','physicalPageHeightMM','style','paperColor','paperPattern','paperColumns','paperRuling','drawCenterGutter','layers','craftScraps']);
const entries=scene=>{const map=new Map();const walk=(nodes,parents=[])=>{for(const n of nodes){map.set(n.id,{node:n,parents});if(n.type==='group')walk(n.children,[...parents,n]);}};walk(scene.layers);return map;};
function retainedMaterialArea(item,parents,draft){
  const rectangle={outer:[[0,0],[1,0],[1,1],[0,1]],holes:[]};
  const polygon=m=>normalizeGeometry([[m.outer,...(m.holes||[])]]);
  let geometry=polygon(materialMaskGeometry(item.materialMask)||rectangle);
  if(item.vectorMask)geometry=geometryIntersection(geometry,polygon(item.vectorMask));
  const a=(item.rotation||0)*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
  geometry=geometry.map(poly=>poly.map(ring=>ring.map(([u,v])=>{
    const x=(u-.5)*item.width*(item.isFlippedHorizontally?-1:1),y=(v-.5)*item.height;
    return [item.x+x*c-y*s,item.y+x*s+y*c];
  })));
  for(const parent of parents)if(parent.vectorMask){
    const mask=polygon(parent.vectorMask).map(poly=>poly.map(ring=>ring.map(([x,y])=>[x*draft.canvas.width,y*draft.canvas.height])));
    geometry=geometryIntersection(geometry,mask);
  }
  const crop=item.cropRect||{width:1,height:1};
  return geometryArea(geometry)/(item.width*item.height)*crop.width*crop.height;
}
const materialGeometry=n=>[n.assetID,n.width,n.height,n.cropRect,n.materialMask,n.materialUnitIndex,n.sourceBlobId,n.sourceStaticPath];
export function validateWebScene(page,source,assets,{final=true}={}){
  validatePackageValue(page);assertTaskFingerprintSync(source);
  if(source.schemaHash!==schemaFingerprint(webSceneContract))throw Error('网页版 Scene 合同已变化，请重新导出任务');
  if(!page||Object.keys(page).some(key=>!pageFields.has(key)))throw Error('page 只接受静态 Scene 字段，不接受工具日志、脚本或交互组件');
  validateValue(page,webSceneContract,'$.page');
  const base=validateCraftTask(source,assets),d=attachSceneV2(structuredClone(page));
  for(const k of ['canvas','pageMode','pageRatio','physicalPageHeightMM'])if(!same(d[k],base[k]))throw Error('不可修改任务纸张与物理单位：'+k);
  const frozen=source.sourceSnapshots.map(s=>assetFromSourceSnapshot(s,{frozenRevision:true}));
  validateNativeDraft(d,new Set(frozen.map(a=>a.id)));
  const original=entries(base),current=entries(d);
  for(const {node} of current.values()){
    if(['actions','interaction','script','html','url','src'].some(k=>Object.hasOwn(node,k)))throw Error('静态 Scene 不接受脚本、外链或交互：'+node.id);
    if(node.type==='shape'&&![...commonShapes,...advancedShapes].some(([kind])=>kind===node.kind))throw Error('未实现的图形类型：'+node.kind);
    if(node.type==='text'&&node.style!==undefined&&!['serif','sans','rounded','hand'].includes(node.style))throw Error('未实现的字体风格');
    if(node.type==='ink'&&node.penStyle!==undefined&&!['pressure','fountain','ballpoint','brush','marker'].includes(node.penStyle))throw Error('未实现的笔迹类型');
    for(const k of ['lineSpacing','fixedLineHeight','paragraphSpacing','letterSpacing','fillOpacity','strokeOpacity','cornerRadius'])if(node[k]!=null&&!Number.isFinite(node[k]))throw Error('样式字段必须是有限数字：'+k);
  }
  for(const [id,{node,parents}] of original){
    const protectedNode=node.locked||node.isLocked||parents.some(p=>p.locked||p.isLocked)||node.aiManaged&&!isManagedUnchanged(node);
    if(!protectedNode)continue;
    const next=current.get(id);
    if(!next||layerFingerprint(node)!==layerFingerprint(next.node)||!same(parents.map(p=>[p.id,p.opacity,p.blendMode,p.vectorMask,p.hidden,p.isHidden,p.zIndex]),next.parents.map(p=>[p.id,p.opacity,p.blendMode,p.vectorMask,p.hidden,p.isHidden,p.zIndex])))throw Error('不能覆盖锁定或用户接管的图层：'+id);
  }
  for(const item of d.items){
    const old=original.get(item.id)?.node,asset=frozen.find(a=>a.id===item.assetID);
    for(const k of ['manualVisualResize','manualVisualCopy'])if(item[k]&&(!old?.[k]||!same(materialGeometry(old),materialGeometry(item))))throw Error('AI 不可借手工标记改变真实素材尺寸或复制来源：'+item.id);
    const expected=asset?.blobId||null,staticPath=asset?.staticPath||null;
    if((item.sourceBlobId||null)!==expected||(item.sourceStaticPath||null)!==staticPath)throw Error('素材图片必须使用任务固定版本：'+item.id);
    const parents=current.get(item.id).parents;
    const masks=parents.map(p=>p.vectorMask);
    const geometryUnchanged=old&&same([old.cropRect,old.materialMask,old.vectorMask],[item.cropRect,item.materialMask,item.vectorMask])&&same(original.get(item.id).parents.map(p=>p.vectorMask),masks)&&(!masks.some(Boolean)||same([old.x,old.y,old.rotation,old.isFlippedHorizontally],[item.x,item.y,item.rotation,item.isFlippedHorizontally]));
    if(!geometryUnchanged){
      const retained=retainedMaterialArea(item,parents,d);
      if(source.processing==='保留完整'&&retained<1-1e-6)throw Error('任务要求保留完整素材：'+item.id);
      if(source.processing==='少量裁剪'&&retained<.6-1e-6)throw Error('少量裁剪须保留至少 60% 来源面积：'+item.id);
    }
  }
  validateScenePhysical(d,frozen);
  if(final){
    const visible=new Set(sceneLayerEntries(d).filter(e=>e.kind==='material'&&(e.value.opacity??1)>0&&e.parents.every(p=>(p.opacity??1)>0)).map(e=>e.value.assetID));
    for(const id of source.requiredAssetIDs||[])if(!visible.has(id))throw Error('必用素材不可隐藏或移除：'+id);
    if(source.textMode==='none'&&d.textBlocks.some(t=>t.content?.trim()))throw Error('纯视觉任务不生成文字');
    const result=applyToolCalls({tools:[{name:'finish_design',arguments:{summary:'网页版 Scene 校验'}}]},d,frozen,{}, {requiredAssetIDs:source.requiredAssetIDs||[],processing:source.processing||'不预设',textMode:source.textMode,allowNoText:source.textMode==='none',deterministicTextLayout:true});
    const error=result.results.find(r=>!r.ok);if(error)throw Error(error.detail);
  }
  return d;
}
export function webSceneDocument(source,page,title='新的手帐'){
  return {format:'shiye-editable-project',version:1,source:structuredClone(source),title:String(title).slice(0,80),page:Object.fromEntries(Object.entries(structuredClone(page)).filter(([key])=>pageFields.has(key)))};
}
export function importWebScene(input,assets,{trustedSource=null}={}){
  if(input.tools!==undefined||input.plan!==undefined||!input.page)throw Error('网页版最终仅交付 page Scene 快照，工具与计划请先 compile');
  if(input.source?.taskBinding!=='local'||input.source?.packageLayout!=='compact')throw Error('创作包来源格式无效');
  assertTaskFingerprintSync(input.source);
  if(trustedSource&&!same(input.source,trustedSource))throw Error('作品来源与所选原始任务不一致');
  const d=validateWebScene(input.page,input.source,assets),s=input.source;
  recordManagedChanges(attachSceneV2(structuredClone(input.source.baseDraft)),d);
  d.agentRun={status:'finished',visualReview:'须在 App 复核最终画面'};
  const p=project(String(input.title||'新的手帐').slice(0,80),{mode:s.mode,ratio:s.ratio,style:s.styles?.[0]||'free'});
  d.id=p.drafts[0].id;p.drafts=[d];p.activeDraftID=d.id;p.offlineBundleId=s.bundleId;
  p.candidateAssetIDs=s.materials.map(m=>m.assetID);p.requiredAssetIDs=s.requiredAssetIDs||[];p.materialPriority=structuredClone(s.materialPriority);p.styles=s.styles;p.purposes=s.purposes;
  inheritCreationBrief(p,s);p.creationVerification={structure:'passed',physical:'current-rules-passed',preview:'unverified',reading:'pending',sourceTaskId:s.bundleId};
  return p;
}
export function applyWebSceneCommands(document,commands,assets){
  const source=document.source,base=validateWebScene(document.page,source,assets,{final:false});
  if(!commands||commands.baseSceneHash!==craftSceneHash(base))throw Error('工作 Scene 已变化，请 inspect 后重新生成命令');
  recordManagedChanges(attachSceneV2(structuredClone(source.baseDraft)),base);
  let draft=attachSceneV2(structuredClone(base));
  const aliases=Object.fromEntries(source.materials.map(m=>[m.alias,m.assetID]));
  const frozen=source.sourceSnapshots.map(s=>assetFromSourceSnapshot(s,{frozenRevision:true}));
  if(commands.tools){
    validateWebTools(commands.tools);
    const result=applyToolCalls({tools:commands.tools},draft,frozen,aliases,{processing:source.processing||'不预设',requiredAssetIDs:source.requiredAssetIDs,visualAssetIDs:source.previewHashes?source.materials.map(m=>m.assetID):[],textMode:source.textMode,allowNoText:source.textMode==='none',deterministicTextLayout:true});
    const failed=result.results.find(r=>!r.ok);if(failed)throw Object.assign(Error(failed.detail),{code:failed.code||'TOOL_FAILED'});
    draft=result.draft;
  }
  if(commands.page){
    if(commands.tools||commands.edits)throw Error('整页替换不能与其他批次混用');
    draft=attachSceneV2(structuredClone(commands.page));
  }
  if(commands.edits){
    if(!Array.isArray(commands.edits)||commands.edits.length>200)throw Error('每批精确编辑最多 200 项');
    for(const edit of commands.edits){
      if(edit.op==='patch'){
        const node=assertSceneEditable(draft,edit.id);
        if(!edit.values||typeof edit.values!=='object'||['id','type','children'].some(k=>Object.hasOwn(edit.values,k)))throw Error('patch 不可替换节点身份或子树');
        validatePackageValue(edit.values);Object.assign(node,structuredClone(edit.values));
      }else if(edit.op==='insert'){
        validatePackageValue(edit.node);
        const parent=edit.parent?assertSceneEditable(draft,edit.parent):null;
        if(parent&&parent.type!=='group')throw Error('插入目标必须是组合');
        (parent?.children||draft.layers).push(structuredClone(edit.node));
      }else if(edit.op==='delete')removeSceneNode(draft,edit.id);
      else if(edit.op==='group')groupSceneLayers(draft,edit.ids,{id:edit.id,name:edit.name||'手帐组合'});
      else if(edit.op==='ungroup'){if(!ungroupSceneLayers(draft,edit.id))throw Error('没有找到组合');}
      else if(edit.op==='move')moveSceneNode(draft,edit.id,{parentID:edit.parent??null,beforeID:edit.before??null});
      else if(edit.op==='transform-group')transformSceneGroup(draft,edit.id,edit.transform);
      else if(edit.op==='replace-material')replaceSceneMaterial(draft,edit.id,edit.assetID,frozen);
      else if(edit.op==='repeat-stamp')repeatSceneStamp(draft,edit.id,edit.placements);
      else if(edit.op==='reuse-layout')reuseSceneLayout(draft,edit.layout,edit.materialMap||{},frozen,edit.prefix);
      else if(edit.op==='glyph-knockout')knockoutSceneGlyphs(draft,edit.id,edit.geometryMM,edit.originMM,frozen,source.processing||'不预设');
      else throw Error('未知精确编辑操作：'+edit.op);
    }
  }
  const next=webSceneDocument(source,draft,commands.title??document.title);
  validateWebScene(next.page,source,assets,{final:false});
  return next;
}
export function inspectWebScene(doc,assets){
  const d=validateWebScene(doc.page,doc.source,assets,{final:false});
  return {sceneHash:craftSceneHash(d),page:structuredClone(d),sources:doc.source.materials,capabilities:webSceneCapabilities,quality:reviewCreativeDraft(d),note:'完整 Scene 与语义别名均可查询；质量警告是建议，不能代替实际看图'};
}

export function compileWebSceneInput(document,input,assets){
  const source=document.source,base=validateWebScene(document.page,source,assets,{final:false});
  if([input.tools,input.plan,input.page].filter(x=>x!==undefined).length!==1)throw Error('编译输入只能包含 tools / plan / 便捷 page 中一种');
  recordManagedChanges(attachSceneV2(structuredClone(source.baseDraft)),base);
  const frozen=source.sourceSnapshots.map(s=>assetFromSourceSnapshot(s,{frozenRevision:true}));
  if(input.tools)validateWebTools(input.tools);
  if(input.page)validateValue(input.page,directPageContract,'$.page');
  const tools=input.plan?[{name:'apply_craft_plan',arguments:input.plan}]:input.page?[{name:'compose_direct_page',arguments:input.page}]:input.tools;
  const result=applyToolCalls({tools},base,frozen,Object.fromEntries(source.materials.map(m=>[m.alias,m.assetID])),{processing:source.processing||'不预设',requiredAssetIDs:source.requiredAssetIDs,visualAssetIDs:source.previewHashes?source.materials.map(m=>m.assetID):[],textMode:source.textMode,allowNoText:source.textMode==='none',deterministicTextLayout:true});
  const error=result.results.find(r=>!r.ok);if(error)throw Object.assign(Error(error.detail),{code:error.code});
  stabilizeImportedCraftScene(result.draft,base,source.bundleId);
  const doc=webSceneDocument(source,result.draft,input.title??document.title);
  validateWebScene(doc.page,source,assets,{final:false});return doc;
}

function validateWebTools(tools){
 if(!Array.isArray(tools)||!tools.length||tools.length>12)throw Error('每批工具需要 1–12 项，可以分批继续编辑');
 const contracts=offlineContract('agent',{cropPx:false});
 for(const t of tools){if(!Object.hasOwn(contracts,t.name))throw Error('未知网页版工具：'+t.name);validateValue(t.arguments,contracts[t.name],'$.'+t.name);}
}
