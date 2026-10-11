import {offlinePreviewBytes,OFFLINE_REFERENCE_EDGE,previewImageFormat} from './offline-preview.js';
import {selectJournalReferenceCases,loadJournalReferenceCases} from './journal-reference-catalog.js';
import {selectJournalAbstractTemplates} from './journal-abstract-templates.js';
import {journalPresetReference} from './journal-preset-images.js';
import {journalTemplatePanel} from './journal-source-panels.js';

const extension=type=>type==='image/jpeg'?'jpg':type==='image/webp'?'webp':'png';
const dataURL=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});

export function selectJournalTemplateBundle(context,userTemplates=[]){
  const selectedCases=selectJournalReferenceCases(context);
  const selectedTemplates=selectJournalAbstractTemplates(selectedCases,{...context,userTemplates});
  return {selectedCases,selectedTemplates};
}

export async function loadJournalTemplateReferences({context,userTemplates=[],db,includeImages=true,encodeReference=offlinePreviewBytes}){
  const {selectedCases,selectedTemplates}=selectJournalTemplateBundle(context,userTemplates);
  if(!includeImages)return {selectedCases,selectedTemplates,referenceImages:[]};
  const referenceImages=await loadJournalReferenceCases(selectedCases);
  for(const template of selectedTemplates){
    for(const [kind,blobId,sourceNumbers] of [
      ['template',template.templateBlobId,template.sourceNumbers],
      ['case',template.exampleBlobId,template.exampleSourceNumbers]
    ]){
      if(blobId){
        const blob=(await db.get('blobs',blobId))?.data;
        if(!(blob instanceof Blob)||!blob.size)throw Error(`模板「${template.title}」的${kind==='case'?'案例':'模板'}图无法读取；未发送不完整参考包`);
        referenceImages.push({id:`${template.id}-${kind}`,kind,title:template.title+(kind==='case'?' · 对应案例':' · 抽象模板'),bytes:new Uint8Array(await blob.arrayBuffer()),url:await dataURL(blob),mimeType:blob.type,extension:extension(blob.type)});
      }else if(sourceNumbers?.length){
        // A missing preset source is not a reason to block creation: the
        // audited layout description and reconstructed family case remain.
        try{const panel=journalTemplatePanel(template,kind);const image=await journalPresetReference(panel,{accountId:context.accountId});if(image)referenceImages.push({...image,id:`${template.id}-${kind}`,kind,title:template.title+(kind==='case'?' · 对应案例':' · 抽象模板')});}catch{/* private preset still pending upload */}
      }
    }
  }
  // Handoff-only encodings: originals remain untouched in the reference
  // collection and the template database. Never send PNG/JPEG originals.
  const encodedReferences=[];
  // A template bundle can contain several large source JPEGs. Encode two at
  // a time to avoid retaining eight full-size decoded bitmaps on mobile.
  for(let offset=0;offset<referenceImages.length;offset+=2){
    const pair=await Promise.all(referenceImages.slice(offset,offset+2).map(async entry=>{
      const mime=entry.mimeType||(entry.extension==='jpg'||entry.extension==='jpeg'?'image/jpeg':'image/png');
      const input=new Blob([entry.bytes],{type:mime});
      const bytes=await encodeReference(input,{maxEdge:OFFLINE_REFERENCE_EDGE,opaque:true});
      const format=previewImageFormat(bytes);
      if(!format)throw Error('无法识别已生成参考图的真实格式');
      const compressed=new Blob([bytes],{type:format.mimeType});
      return {...entry,bytes,mimeType:format.mimeType,extension:format.extension,url:await dataURL(compressed)};
    }));
    encodedReferences.push(...pair);
  }
  return {selectedCases,selectedTemplates,referenceImages:encodedReferences};
}
