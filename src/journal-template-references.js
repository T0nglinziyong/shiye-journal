import {offlinePreviewBytes,OFFLINE_REFERENCE_EDGE,previewImageFormat} from './offline-preview.js';
import {mapOfflineExportLimited} from './offline-export-assets.js';
import {selectJournalReferenceCases,loadJournalReferenceCases} from './journal-reference-catalog.js';
import {selectJournalAbstractTemplates} from './journal-abstract-templates.js';
import {journalPresetReference} from './journal-preset-images.js';
import {journalTemplatePanel} from './journal-source-panels.js';

const extension=type=>type==='image/jpeg'?'jpg':type==='image/webp'?'webp':'png';
const dataURL=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});
const preparedBundles=new Map();

export function selectJournalTemplateBundle(context,userTemplates=[]){
  const selectedCases=selectJournalReferenceCases(context);
  const selectedTemplates=selectJournalAbstractTemplates(selectedCases,{...context,userTemplates});
  return {selectedCases,selectedTemplates};
}
export async function loadJournalTemplateReferences({context,userTemplates=[],db,includeImages=true,encodeReference=offlinePreviewBytes}){
  const {selectedCases,selectedTemplates}=selectJournalTemplateBundle(context,userTemplates);
  if(!includeImages)return {selectedCases,selectedTemplates,referenceImages:[]};
  // Only an explicitly authenticated account may reuse reference bytes across
  // exports. User templates are keyed by source blob IDs and update revision.
  const key=context.accountId&&encodeReference===offlinePreviewBytes
    ?JSON.stringify([context.accountId,'reference-bundle-v2',
      selectedCases.map(item=>item.id),
      selectedTemplates.map(item=>[item.id,item.templateBlobId,item.exampleBlobId,item.updatedAt,
        item.sourceNumbers,item.exampleSourceNumbers])])
    :null;
  if(key&&preparedBundles.has(key))return preparedBundles.get(key);
  const work=(async()=>{
    const requests=selectedTemplates.flatMap(template=>
      [['template',template.templateBlobId,template.sourceNumbers],
       ['case',template.exampleBlobId,template.exampleSourceNumbers]]
        .filter(([,blobId,numbers])=>blobId||numbers?.length)
        .map(([kind,blobId])=>({template,kind,blobId})));
    // Reference cases and template sources are independent; read both lanes
    // concurrently with a total cap on full-resolution template decoding.
    const [cases,templates]=await Promise.all([
      loadJournalReferenceCases(selectedCases),
      mapOfflineExportLimited(requests,2,async({template,kind,blobId})=>{
        const title=template.title+(kind==='case'?' · 对应案例':' · 抽象模板');
        if(blobId){
          // The task receives only a display-sized derivative. Never fetch a
          // private source original merely because the cover is unavailable.
          const blob=await db.previewBlob(blobId,OFFLINE_REFERENCE_EDGE,{allowRemoteOriginal:false});
          if(!(blob instanceof Blob)||!blob.size)throw Error('模板「'+template.title+'」的'+(kind==='case'?'案例':'模板')+'图无法读取；未发送不完整参考包');
          return {id:template.id+'-'+kind,kind,title,bytes:new Uint8Array(await blob.arrayBuffer()),mimeType:blob.type,extension:extension(blob.type)};
        }
        try{
          const panel=journalTemplatePanel(template,kind);
          const img=await journalPresetReference(panel,{accountId:context.accountId,includeDataURL:false});
          return img?{...img,id:template.id+'-'+kind,kind,title}:null;
        }catch{
          // A private source that is not yet uploaded must not block an
          // otherwise complete handoff; abstract text remains in the guide.
          return null;
        }
      })
    ]);
    const references=[...cases,...templates.filter(Boolean)];
    const encodedReferences=await mapOfflineExportLimited(references,2,async entry=>{
      const mime=entry.mimeType||(entry.extension==='jpg'||entry.extension==='jpeg'?'image/jpeg':'image/png');
      const bytes=await encodeReference(new Blob([entry.bytes],{type:mime}),{maxEdge:OFFLINE_REFERENCE_EDGE,opaque:true});
      const format=previewImageFormat(bytes);
      if(!format)throw Error('无法识别已生成参考图的真实格式');
      return {id:entry.id,kind:entry.kind,title:entry.title,bytes,
        mimeType:format.mimeType,extension:format.extension,
        url:await dataURL(new Blob([bytes],{type:format.mimeType}))};
    });
    return {selectedCases,selectedTemplates,referenceImages:encodedReferences};
  })();
  if(key){
    preparedBundles.set(key,work);
    if(preparedBundles.size>8)preparedBundles.delete(preparedBundles.keys().next().value);
  }
  try{return await work;}catch(error){if(key&&preparedBundles.get(key)===work)preparedBundles.delete(key);throw error;}
}
