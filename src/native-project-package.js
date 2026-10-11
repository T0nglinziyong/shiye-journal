import {validateDisplaySlices} from './craft-display.js';
import {validateSceneExtensions,attachSceneV2} from './scene-model.js';
import {zipSync,strToU8,strFromU8} from 'fflate';
import {uid} from './domain.js';
import {materialMaskPoints} from './material-mask.js';
import {readProjectPackageEntries} from './project-package-archive.js';

export const NATIVE_ENTRY='native.shiyeproject.json';
const paint=value=>value==null||typeof value==='string'&&value.length<=64&&(
  /^#[0-9a-f]{3,8}$/i.test(value)||/^[a-z]{1,32}$/i.test(value)||/^(?:rgba?|hsla?)\([\d\s.,%+\-]+\)$/i.test(value)
);
const optionalNumber=(value,min,max)=>value===undefined||Number.isFinite(value)&&value>=min&&value<=max;
function validateVectorGeometry(shape){
  const coordinate=n=>Number.isFinite(n)&&Math.abs(n)<=100_000;
  const point=p=>Array.isArray(p)&&p.length===2&&p.every(coordinate);
  const path=p=>Array.isArray(p)&&p.length>=2&&p.length<=512&&p.every(point);
  const rectangle=r=>Array.isArray(r)&&r.length===4&&r.every(coordinate)&&r[2]>0&&r[3]>0;
  if(shape.vectorPaths!==undefined&&(!Array.isArray(shape.vectorPaths)||shape.vectorPaths.length>48||!shape.vectorPaths.every(path)))throw Error('工程包自由图形坐标无效');
  if(shape.vectorLayers!==undefined&&(!Array.isArray(shape.vectorLayers)||shape.vectorLayers.length>64||shape.vectorLayers.some(layer=>
    !layer||typeof layer!=='object'||!paint(layer.fill)||!optionalNumber(layer.opacity,0,1)||
    layer.paths!==undefined&&(!Array.isArray(layer.paths)||layer.paths.length>48||!layer.paths.every(path))||
    layer.rects!==undefined&&(!Array.isArray(layer.rects)||layer.rects.length>512||!layer.rects.every(rectangle))
  )))throw Error('工程包多色图形数据无效');
}
export function createNativeProjectPackage(project){
  if(!project?.drafts?.length||project.isSnapshot)throw Error('只有可编辑作品可以打包');
  const {__cloudBaseRevision,__cloudSessionId,editHistory:_temporaryHistory,...portableProject}=project;
  const document={format:'shiye-native-project',version:1,project:portableProject};
  return new Blob([zipSync({[NATIVE_ENTRY]:strToU8(JSON.stringify(document))},{level:6})],{type:'application/zip'});
}
export function importNativeProjectPackage(bytes,assets){
  const {kind,files}=readProjectPackageEntries(bytes);
  if(kind!=='native')return null;
  let envelope;try{envelope=JSON.parse(strFromU8(files[NATIVE_ENTRY]));}catch{throw Error('工程包页面数据无效');}
  if(envelope?.format!=='shiye-native-project'||envelope.version!==1)throw Error('工程包格式不受支持');
  const source=envelope.project,known=new Set(assets.map(a=>a.id));
  if(!source||typeof source.title!=='string'||!Array.isArray(source.drafts)||!source.drafts.length||source.drafts.length>40)throw Error('工程包缺少可编辑页面');
  validatePackageValue(source);
  const draftIDs=new Set();
  for(const draft of source.drafts){
    if(typeof draft.id!=='string'||!draft.id||draftIDs.has(draft.id))throw Error('工程包方案 ID 无效');
    draftIDs.add(draft.id);
    validateNativeDraft(draft,known);
  }
  if(!draftIDs.has(source.activeDraftID))throw Error('工程包当前方案引用无效');
  for(const draft of source.initialEditorSnapshot?.drafts||[])validateNativeDraft(draft,known);
  for(const draft of Object.values(source.draftHistorySnapshots||{}))validateNativeDraft(draft,known);
  for(const archive of source.manualArchives||[])for(const draft of archive.drafts||[])validateNativeDraft(draft,known);
  // Undo stacks are session-local. Retain the actual current scene and all
  // immutable archives, but do not resurrect a foreign session's undo state.
  const project=structuredClone(source),draftMap=new Map(),objectMap=new Map(),groupMap=new Map();
  const mapped=(map,id)=>{if(typeof id!=='string'||!id)throw Error('工程包对象 ID 无效');if(!map.has(id))map.set(id,uid());return map.get(id);};
  const remapDraft=d=>{
    d.id=mapped(draftMap,d.id);delete d.craftReceipts;
    for(const field of ['items','primitives','textBlocks','strokes'])for(const item of d[field]||[])delete item.aiManaged;
    for(const list of ['items','primitives','textBlocks'])for(const item of d[list]||[]){item.id=mapped(objectMap,item.id);if(item.creativeGroupID)item.creativeGroupID=mapped(groupMap,item.creativeGroupID);}
    for(const stroke of d.strokes||[])stroke.id=stroke.id?mapped(objectMap,stroke.id):uid();
  };
  project.drafts.forEach(remapDraft);
  if(project.initialEditorSnapshot){project.initialEditorSnapshot.drafts?.forEach(remapDraft);project.initialEditorSnapshot.activeDraftID=mapped(draftMap,project.initialEditorSnapshot.activeDraftID);}
  if(project.draftHistorySnapshots){const histories={};for(const [oldID,draft] of Object.entries(project.draftHistorySnapshots)){remapDraft(draft);histories[mapped(draftMap,oldID)]=draft;}project.draftHistorySnapshots=histories;}
  for(const archive of project.manualArchives||[]){archive.id=uid();archive.drafts?.forEach(remapDraft);archive.activeDraftID=mapped(draftMap,archive.activeDraftID);}
  const reviseReferences=d=>{for(const item of d.items||[])for(const slice of item.craftDisplaySlices||[])if(objectMap.has(slice.targetId))slice.targetId=objectMap.get(slice.targetId);for(const item of d.items||[])for(const key of ['target','target2'])if(item.materialRelation?.[key]&&objectMap.has(item.materialRelation[key]))item.materialRelation[key]=objectMap.get(item.materialRelation[key]);};
  for(const draft of project.drafts)reviseReferences(draft);
  for(const draft of project.initialEditorSnapshot?.drafts||[])reviseReferences(draft);
  for(const draft of Object.values(project.draftHistorySnapshots||{}))reviseReferences(draft);
  for(const archive of project.manualArchives||[])for(const draft of archive.drafts||[])reviseReferences(draft);
  project.id=uid();delete project.__cloudBaseRevision;delete project.__cloudSessionId;project.title=project.title.slice(0,80);project.isSnapshot=false;project.isDraft=true;project.projectDocumentPath=null;project.deliveryBlobId=null;project.activeDraftID=mapped(draftMap,source.activeDraftID);project.editHistory={undo:[],redo:[]};project.createdAt=project.updatedAt=new Date().toISOString();return project;
}

export function validatePackageValue(root){
  const stack=[[root,0]];let count=0;
  while(stack.length){
    const [value,depth]=stack.pop();if(++count>100_000||depth>40)throw Error('工程包对象层级或数量超限');
    if(typeof value==='number'&&!Number.isFinite(value))throw Error('工程包包含非有限数字');
    if(typeof value==='string'&&value.length>500_000)throw Error('工程包文字过长');
    if(!value||typeof value!=='object')continue;
    if(Array.isArray(value)&&value.length>20_000)throw Error('工程包数组过长');
    for(const [key,child] of Object.entries(value)){
      if(['__proto__','constructor','prototype'].includes(key))throw Error('工程包包含不安全字段');
      stack.push([child,depth+1]);
    }
  }
}

export function validateNativeDraft(draft,known){
  attachSceneV2(draft);validateSceneExtensions(draft);
  const canvas=draft?.canvas;
  if(!canvas||![canvas.width,canvas.height].every(n=>Number.isFinite(n)&&n>0&&n<=10000)||!['items','primitives','textBlocks','strokes'].every(key=>Array.isArray(draft[key])&&draft[key].length<=5000))throw Error('工程包图层数据无效');
  if(!paint(draft.paperColor)||draft.paperPattern!==undefined&&!['plain','lines','grid','dots','columns'].includes(draft.paperPattern))throw Error('工程包纸张样式无效');
  const ids=new Set();
  for(const list of ['items','primitives','textBlocks'])for(const item of draft[list]){
    if(!item||typeof item.id!=='string'||!item.id||ids.has(item.id)||![item.x,item.y,item.width,item.height].every(n=>Number.isFinite(n)&&Math.abs(n)<=100000)||item.width<=0||item.height<=0)throw Error('工程包图层几何或 ID 无效');
    ids.add(item.id);
    if(!optionalNumber(item.rotation,-3600,3600)||!optionalNumber(item.zIndex,-100_000,100_000)||!optionalNumber(item.opacity,0,1))throw Error('工程包图层样式数值无效');
    if(list==='items'){
      if(!known.has(item.assetID))throw Error('工程包引用了当前素材库中不存在的素材');
      if(item.materialMask)materialMaskPoints(item.materialMask);validateDisplaySlices(item);
    }
    if(list==='primitives'){if(!paint(item.fill)||!paint(item.stroke)||!optionalNumber(item.lineWidth,0,1000))throw Error('工程包图形样式无效');validateVectorGeometry(item);}
    if(list==='textBlocks'&&(typeof item.content!=='string'||!paint(item.color)||item.alignment!==undefined&&!['left','center','right'].includes(item.alignment)||!optionalNumber(item.fontSize,1,1000)))throw Error('工程包文字样式或内容无效');
  }
  const semanticKeys=new Set(draft.items.concat(draft.primitives,draft.textBlocks).flatMap(item=>[item.id,item.creativePieceID,item.agentKey,item.key].filter(Boolean)));
  for(const item of draft.items)for(const key of ['target','target2'])if(item.materialRelation?.[key]&&!semanticKeys.has(item.materialRelation[key]))throw Error('工程包图层关系引用无效');
  for(const stroke of draft.strokes)if(!Array.isArray(stroke.points)||stroke.points.length>20000||stroke.points.some(point=>![point.x,point.y].every(n=>Number.isFinite(n)&&Math.abs(n)<=100000)||!optionalNumber(point.p,0,1))||!paint(stroke.color)||!optionalNumber(stroke.opacity,0,1)||!optionalNumber(stroke.width,0,1000))throw Error('工程包笔迹数据无效');
}
