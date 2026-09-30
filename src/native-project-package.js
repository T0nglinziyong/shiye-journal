import {zipSync,unzipSync,strToU8,strFromU8} from 'fflate';
import {uid} from './domain.js';

export const NATIVE_ENTRY='native.shiyeproject.json';
export function createNativeProjectPackage(project){
  if(!project?.drafts?.length||project.isSnapshot)throw Error('只有可编辑作品可以打包');
  const document={format:'shiye-native-project',version:1,project};
  return new Blob([zipSync({[NATIVE_ENTRY]:strToU8(JSON.stringify(document))},{level:6})],{type:'application/zip'});
}
export function importNativeProjectPackage(bytes,assets){
  if(!(bytes instanceof Uint8Array)||bytes.length>20_000_000)throw Error('工程包不能超过 20 MB');
  const files=unzipSync(bytes,{filter:file=>file.name===NATIVE_ENTRY&&file.originalSize<=8_000_000});
  if(!files[NATIVE_ENTRY])return null;
  let envelope;try{envelope=JSON.parse(strFromU8(files[NATIVE_ENTRY]));}catch{throw Error('工程包页面数据无效');}
  if(envelope?.format!=='shiye-native-project'||envelope.version!==1)throw Error('工程包格式不受支持');
  const source=envelope.project,known=new Set(assets.map(a=>a.id));
  if(!source||typeof source.title!=='string'||!Array.isArray(source.drafts)||!source.drafts.length||source.drafts.length>40)throw Error('工程包缺少可编辑页面');
  for(const draft of source.drafts){if(!(draft.canvas?.width>0&&draft.canvas?.height>0)||draft.canvas.width>10000||draft.canvas.height>10000||!Array.isArray(draft.items)||!Array.isArray(draft.primitives)||!Array.isArray(draft.textBlocks)||!Array.isArray(draft.strokes))throw Error('工程包图层数据无效');if(draft.items.some(item=>!known.has(item.assetID)))throw Error('工程包引用了当前素材库中不存在的素材');}
  const project=structuredClone(source);project.id=uid();project.title=project.title.slice(0,80);project.isSnapshot=false;project.isDraft=true;project.projectDocumentPath=null;project.deliveryBlobId=null;project.drafts=project.drafts.map(d=>({...d,id:uid()}));project.activeDraftID=project.drafts[0].id;project.createdAt=project.updatedAt=new Date().toISOString();return project;
}
