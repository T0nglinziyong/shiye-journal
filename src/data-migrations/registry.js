// Explicitly loaded ONLY after tapping "转换旧数据格式". The current app never
// interprets legacy payloads on its normal read/write/render/AI paths.
import {migrateLegacyProject} from './scene-v1-to-v2.js';
import {validateSceneExtensions} from '../scene-v2.js';

export const STORAGE_MIGRATION_STORES=Object.freeze(['assets','series','projects','blobs','meta','trash']);
const isObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const clone=value=>structuredClone(value);
const legacyFields=['items','textBlocks','primitives','strokes'];
const hasLegacyDraft=d=>isObject(d)&&legacyFields.some(key=>Object.hasOwn(d,key));
const fullLegacy=d=>isObject(d)&&legacyFields.every(key=>Array.isArray(d[key]));
const currentDraft=d=>isObject(d)&&d.sceneVersion===2&&Array.isArray(d.layers);

export function classifyStoredRecord(store,record){
 if(!isObject(record)||typeof record.id!=='string'||!record.id)return 'review';
 if(store==='projects'){
  if(record.isSnapshot)return 'current';
  if(!Array.isArray(record.drafts)||!record.drafts.length)return 'review';
  if(record.drafts.every(currentDraft))return 'current';
  if(record.projectDocumentPath||record.drafts.every(fullLegacy))return 'migrate';
  return 'review';
 }
 if(store==='trash'){
  if(record.kind!=='project'||record.item?.isSnapshot)return 'current';
  const item=record.item;
  if(!isObject(item)||!Array.isArray(item.drafts)||!item.drafts.length)return 'review';
  if(item.drafts.every(currentDraft))return 'current';
  if(item.drafts.every(fullLegacy))return 'migrate';
  return 'review';
 }
 if(store==='blobs')return typeof record.storageProvider==='string'&&typeof record.storagePath==='string'?'current':'review';
 // Asset metadata and series, user preferences, tombstones, AI settings and
 // "matching-session-v1" are in use in the current application: an ID ending
 // in v1 is NOT evidence that their schema is obsolete. Do not rewrite them.
 if(['assets','series','meta'].includes(store))return 'current';
 return 'review';
}

export async function prepareStorageMigration(collections,{resolveProject=async record=>record,assets=[]}={}){
 const scans=[],changes=[],review=[];
 for(const store of STORAGE_MIGRATION_STORES){
  const items=collections?.[store]||[];
  if(!Array.isArray(items))throw Error('旧数据扫描结果不是数组：'+store);
  const count={store,total:0,current:0,migratable:0,needsReview:0};
  for(const record of items){
   count.total++;
   const status=classifyStoredRecord(store,record);
   if(status==='current'){count.current++;continue;}
   if(status==='review'){
    count.needsReview++;
    review.push({store,id:record?.id||null,reason:'数据格式不完整或属于尚未登记转换器的版本'});
    continue;
   }
   try{
    const full=store==='projects'&&record.projectDocumentPath?await resolveProject(record):record;
    if(full?.id!==record?.id)throw Error('云端完整作品与摘要 ID 不一致');
    if(store==='projects'&&record.projectDocumentPath&&!(full?.drafts||[]).every(fullLegacy))
      throw Error('外部作品不是完整旧 Draft，拒绝以摘要填充画布');
    const source=store==='trash'?record.item:full;
    if(!Array.isArray(source?.drafts)||!source.drafts.some(hasLegacyDraft))throw Error('未识别可安全迁移的旧图层');
    const project=migrateLegacyProject(source,{assets});
    project.drafts.forEach(d=>validateSceneExtensions(d));
    const converted=store==='trash'?{...clone(record),item:project}:project;
    changes.push({store,id:record.id,original:clone(record),originalDocument:store==='projects'&&record.projectDocumentPath?clone(full):null,converted});
    count.migratable++;
   }catch(error){
    count.needsReview++;
    review.push({store,id:record?.id||null,reason:String(error.message||error).slice(0,260)});
   }
  }
  scans.push(count);
 }
 return {format:'shiye-account-storage-migration-plan',version:1,scans,changes,review,
  totals:{scanned:scans.reduce((n,r)=>n+r.total,0),migratable:changes.length,needsReview:review.length}};
}

export function publicMigrationReport(plan){
 return {format:plan.format,version:plan.version,scans:plan.scans,review:plan.review,totals:plan.totals};
}

// Only *affected* original records are backed up. Exporting every meta row
// here would needlessly expose stored provider credentials in preferences.
export async function migrationBackup(plan,{account,revision}={}){
 const payload={format:'shiye-storage-migration-backup',version:1,createdAt:new Date().toISOString(),
  sourceRevision:revision,account,records:plan.changes.map(({store,id,original,originalDocument})=>({store,id,record:original,...(originalDocument?{fullDocument:originalDocument}:{})})),report:publicMigrationReport(plan)};
 const text=JSON.stringify(payload),bytes=new TextEncoder().encode(text);
 if(bytes.byteLength>50*1024*1024)throw Error('迁移备份超过 50 MB，请在电脑上分批处理，未修改云端');
 const hash=await crypto.subtle.digest('SHA-256',bytes);
 const sha256=Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('');
 return {blob:new Blob([bytes],{type:'application/json'}),sha256,recordCount:plan.changes.length};
}
