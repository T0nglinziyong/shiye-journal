import {normalizeUserTemplate,USER_TEMPLATE_PREFIX} from './journal-template-catalog.js';

const urls=new Map();
let urlOwner=null;

export function clearJournalTemplateImages(){
  for(const url of urls.values())URL.revokeObjectURL(url);
  urls.clear();urlOwner=null;
}

export async function journalTemplateImageURL(db,owner,id,edge=480){
  if(!id)return null;
  if(urlOwner!==owner){clearJournalTemplateImages();urlOwner=owner;}
  const key=id+':'+(edge||'original');
  if(urls.has(key))return urls.get(key);
  const blob=edge?await db.previewBlob(id,edge):(await db.get('blobs',id))?.data;
  if(!(blob instanceof Blob)||!blob.size)return null;
  const url=URL.createObjectURL(blob);
  urls.set(key,url);
  return url;
}

export function validateJournalImage(file){
  if(!file)return null;
  if(!['image/png','image/jpeg','image/webp'].includes(file.type))
    throw Error('模板和案例请选择 PNG、JPEG 或 WebP 图片');
  if(!file.size||file.size>20*1024*1024)
    throw Error('单张模板或案例图片须在 20 MB 以内');
  return file;
}

export async function saveJournalUserTemplate(db,input,{templateImage,caseImage}={}){
  validateJournalImage(templateImage);validateJournalImage(caseImage);
  if(!templateImage)throw Error('请先选择模板图片');
  const id=USER_TEMPLATE_PREFIX+crypto.randomUUID();
  const record=normalizeUserTemplate({...input,id,templateBlobId:crypto.randomUUID(),
    exampleBlobId:caseImage?crypto.randomUUID():null});
  await db.transaction(['meta','blobs'],tx=>{
    tx.objectStore('blobs').put({id:record.templateBlobId,data:templateImage});
    if(caseImage)tx.objectStore('blobs').put({id:record.exampleBlobId,data:caseImage});
    tx.objectStore('meta').put(record);
  });
  return record;
}

export function journalTemplateRecords(meta){
  return (meta||[]).filter(row=>String(row?.id||'').startsWith(USER_TEMPLATE_PREFIX))
    .flatMap(row=>{try{return [normalizeUserTemplate(row)];}catch{return [];}});
}
