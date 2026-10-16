import {validateNativeDraft,validatePackageValue} from './native-project-package.js';
import {readArchivePayload,archivePayload,compactManualArchiveStore} from './scene-archive.js';
// Validation happens before restoring a complete six-store backup. In
// particular, do not clear a real account because a JSON file parses.
const STORES=['assets','blobs','series','projects','meta','trash'];
export function validateRestoredRecords(stores,{repairs=[]}={}){
  if(!stores||STORES.some(name=>!Array.isArray(stores[name])))throw Error('ZIP 缺少完整六表，未修改现有资料');
  const keys=new Map();
  for(const store of STORES){
    const seen=new Set();
    for(const row of stores[store]){
      if(!row||typeof row.id!=='string'||!row.id.trim()||seen.has(row.id))throw Error('ZIP 含非法或重复记录：'+store);
      if(store==='blobs'&&(!(row.data instanceof Blob)||!row.data.size))throw Error('ZIP 图片字节丢失');
      seen.add(row.id);
    }
    keys.set(store,seen);
  }
  for(const asset of stores.assets){
    validateAsset(asset,keys);
  }
  const knownAssets=new Set(keys.get('assets'));
  for(const entry of stores.trash){
    if(!['asset','project'].includes(entry.kind)||!entry.item?.id)
      throw Error('ZIP 最近删除记录不完整：'+entry.id);
    if(entry.kind==='asset'){
      validateAsset(entry.item,keys);
      knownAssets.add(entry.item.id);
    }
  }
  for(const asset of stores.assets){
    if(asset.seriesID&&!keys.get('series').has(asset.seriesID))
      throw Error('ZIP 素材引用了不存在的系列：'+asset.id);
  }
  for(const project of stores.projects)validateProject(project,knownAssets,keys.get('blobs'),repairs);
  for(const entry of stores.trash)if(entry.kind==='project')
    validateProject(entry.item,knownAssets,keys.get('blobs'),repairs);
  return true;
}
const assetBlobFields=['blobId','originalBlobId','originalCutoutBlobId','candidateFrameBlobId',
  'initialMaskBlobId','finalMaskBlobId','photoBlobId'];
function validateAsset(asset,keys){
  if(typeof asset.id!=='string'||!asset.id)throw Error('ZIP 素材编号无效');
  // A bundled static image is portable; an account-private URL or object key
  // is not a backed-up image and must not survive a cross-account restore.
  const bundled=typeof asset.staticPath==='string'&&(
    asset.staticPath.startsWith('/')&&!asset.staticPath.startsWith('//')&&!asset.staticPath.includes('..')||
    asset.staticPath.length<=2*1024*1024&&/^data:image\/(?:png|jpeg|webp|svg\+xml)[;,]/i.test(asset.staticPath));
  if(asset.staticPath&&!bundled)throw Error('ZIP 素材含未打包的外部图片：'+asset.id);
  if(!asset.blobId&&!bundled)throw Error('ZIP 素材缺少可读取的主图：'+asset.id);
  for(const field of assetBlobFields)if(asset[field]&&!keys.get('blobs').has(asset[field])&&
    !(field==='blobId'&&bundled))
    throw Error('ZIP 素材缺少必要图片或蒙版：'+asset.id+' / '+field);
}
function validateProject(project,knownAssets,blobs,repairs){
  validatePackageValue(project);
  if(typeof project.title!=='string'||project.title.length>500||
    typeof project.id!=='string'||!project.id)throw Error('ZIP 作品基本信息无效');
  if(project.projectDocumentPath)throw Error('ZIP 作品只有云端摘要，缺少可编辑正文：'+project.id);
  if(project.isSnapshot){
    if(!project.snapshotBlobId||!blobs.has(project.snapshotBlobId)||
      project.snapshotDocumentBlobId&&!blobs.has(project.snapshotDocumentBlobId))
      throw Error('ZIP 画面快照缺少图片：'+project.id);
    return;
  }
  if(!Array.isArray(project.drafts)||!project.drafts.length||
    project.drafts.length>40||!project.drafts.some(d=>d.id===project.activeDraftID)||
    new Set(project.drafts.map(d=>d.id)).size!==project.drafts.length)
    throw Error('ZIP 作品缺少可编辑正文或当前方案：'+project.id);
  if(project.originalImportPhotoBlobID&&!blobs.has(project.originalImportPhotoBlobID))
    throw Error('ZIP 作品缺少导入原图：'+project.id);
  const check=draft=>{
    try{validateNativeDraft(draft,knownAssets);}
    catch(error){throw Error('ZIP 作品 '+project.id+' 的方案 '+(draft?.id||'未知')+' 无法恢复：'+error.message);}
    if(draft.coverBlobId&&!blobs.has(draft.coverBlobId))
      throw Error('ZIP 作品 '+project.id+' 缺少本机封面图片：'+draft.coverBlobId);
    // Remote cover paths are disposable derivatives. Keeping one from a
    // different account would make an otherwise complete work appear blank.
    if(draft.coverImageID&&!blobs.has(draft.coverImageID)||draft.coverStaticPath){
      delete draft.coverImageID;delete draft.coverSceneHash;
      delete draft.coverStaticPath;delete draft.coverBaselineUpdatedAt;
      repairs.push({projectID:project.id,draftID:draft.id,reason:'已移除不能跨账号使用的派生封面'});
    }
  };
  for(const draft of project.drafts)check(draft);
  for(const draft of project.initialEditorSnapshot?.drafts||[])check(draft);
  for(const draft of Object.values(project.draftHistorySnapshots||{}))check(draft);
  if((project.manualArchives||[]).length>250)throw Error('ZIP 作品存档数量超出限制：'+project.id);
  for(const archive of project.manualArchives||[]){
    const payload=project.manualArchiveStore?.[archive.ref];
    if(!payload)throw Error('ZIP 作品缺少存档正文：'+project.id);
    try{const drafts=readArchivePayload(payload,archive.ref),before=repairs.length;
      if(!drafts.some(draft=>draft.id===archive.activeDraftID))
        throw Error('存档当前方案引用无效');
      for(const draft of drafts)check(draft);
      if(repairs.length>before){
        const encoded=archivePayload(drafts);
        project.manualArchiveStore[encoded.hash]=encoded.payload;
        archive.ref=encoded.hash;
      }
    }
    catch(error){throw Error('ZIP 作品存档无法恢复：'+project.id+' / '+error.message);}
  }
  compactManualArchiveStore(project);
}
