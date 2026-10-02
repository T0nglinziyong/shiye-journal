import {project,uid} from './domain.js';

export const WORK_TABS=[['snapshot','画面快照'],['all','可编辑作品'],['draft','草稿'],['templates','模板'],['trash','最近删除']];

export function workInTab(work,tab){
  if(tab==='trash'||tab==='templates')return false;
  if(tab==='snapshot')return work.isSnapshot===true;
  if(tab==='draft')return work.isSnapshot!==true&&work.isDraft===true;
  return work.isSnapshot!==true&&work.isDraft!==true;
}

export function snapshotRecord({title,previewBlobId,documentBlobId=null,format='image/webp',width,height,sourceProjectID=null}){
  if(!previewBlobId||!(width>0&&height>0))throw Error('快照缺少可读取的封面或尺寸');
  const record=project(title||'未命名快照');
  record.id=uid();
  record.isSnapshot=true;
  record.isDraft=false;
  record.source='snapshot';
  record.snapshotBlobId=previewBlobId;
  record.snapshotDocumentBlobId=documentBlobId;
  record.snapshotFormat=format;
  record.snapshotWidth=width;
  record.snapshotHeight=height;
  record.sourceProjectID=sourceProjectID;
  record.drafts[0].canvas={width,height};
  return record;
}
