import {zipSync,strToU8,strFromU8} from 'fflate';
import {uid} from './domain.js';
import {materialMaskPoints} from './material-mask.js';
import {readProjectPackageEntries} from './project-package-archive.js';

export const NATIVE_ENTRY='native.shiyeproject.json';
export function createNativeProjectPackage(project){
  if(!project?.drafts?.length||project.isSnapshot)throw Error('只有可编辑作品可以打包');
  const {__cloudBaseRevision,__cloudSessionId,...portableProject}=project;
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
    validateDraft(draft,known);
  }
  if(!draftIDs.has(source.activeDraftID))throw Error('工程包当前方案引用无效');
  for(const draft of source.initialEditorSnapshot?.drafts||[])validateDraft(draft,known);
  for(const draft of Object.values(source.draftHistorySnapshots||{}))validateDraft(draft,known);
  for(const archive of source.manualArchives||[])for(const draft of archive.drafts||[])validateDraft(draft,known);
  if(source.editHistory?.undo?.length||source.editHistory?.redo?.length)throw Error('工程包含无法安全映射的旧撤销记录');
  const project=structuredClone(source),draftMap=new Map(),objectMap=new Map(),groupMap=new Map();
  const mapped=(map,id)=>{if(typeof id!=='string'||!id)throw Error('工程包对象 ID 无效');if(!map.has(id))map.set(id,uid());return map.get(id);};
  const remapDraft=d=>{
    d.id=mapped(draftMap,d.id);
    for(const list of ['items','primitives','textBlocks'])for(const item of d[list]||[]){item.id=mapped(objectMap,item.id);if(item.creativeGroupID)item.creativeGroupID=mapped(groupMap,item.creativeGroupID);}
  };
  project.drafts.forEach(remapDraft);
  if(project.initialEditorSnapshot){project.initialEditorSnapshot.drafts?.forEach(remapDraft);project.initialEditorSnapshot.activeDraftID=mapped(draftMap,project.initialEditorSnapshot.activeDraftID);}
  if(project.draftHistorySnapshots){const histories={};for(const [oldID,draft] of Object.entries(project.draftHistorySnapshots)){remapDraft(draft);histories[mapped(draftMap,oldID)]=draft;}project.draftHistorySnapshots=histories;}
  for(const archive of project.manualArchives||[]){archive.id=uid();archive.drafts?.forEach(remapDraft);archive.activeDraftID=mapped(draftMap,archive.activeDraftID);}
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

function validateDraft(draft,known){
  const canvas=draft?.canvas;
  if(!canvas||![canvas.width,canvas.height].every(n=>Number.isFinite(n)&&n>0&&n<=10000)||!['items','primitives','textBlocks','strokes'].every(key=>Array.isArray(draft[key])&&draft[key].length<=5000))throw Error('工程包图层数据无效');
  const ids=new Set();
  for(const list of ['items','primitives','textBlocks'])for(const item of draft[list]){
    if(!item||typeof item.id!=='string'||!item.id||ids.has(item.id)||![item.x,item.y,item.width,item.height].every(n=>Number.isFinite(n)&&Math.abs(n)<=100000)||item.width<=0||item.height<=0)throw Error('工程包图层几何或 ID 无效');
    ids.add(item.id);
    if(list==='items'){
      if(!known.has(item.assetID))throw Error('工程包引用了当前素材库中不存在的素材');
      if(item.materialMask)materialMaskPoints(item.materialMask);
    }
    if(list==='textBlocks'&&typeof item.content!=='string')throw Error('工程包文字内容无效');
  }
  for(const stroke of draft.strokes)if(!Array.isArray(stroke.points)||stroke.points.length>20000||stroke.points.some(point=>![point.x,point.y].every(n=>Number.isFinite(n)&&Math.abs(n)<=100000)))throw Error('工程包笔迹数据无效');
}
