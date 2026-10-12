import {createSceneTransition,hasSceneChanges} from './scene-history-delta.js';
import {snapshotDraft} from './draft-snapshot.js';
import {archivePayload} from './scene-archive.js';

export const AUTO_SNAPSHOT_OPERATIONS=30;
export const AUTO_SNAPSHOT_INTERVAL_MS=5*60*1000;
const HOUR=3600_000,DAY=24*HOUR;
const diffHasChanges=(a,b)=>hasSceneChanges(createSceneTransition(a,b));
const validDate=v=>Number.isFinite(Date.parse(v))?Date.parse(v):0;
const copy=structuredClone;
const signature=drafts=>JSON.stringify(drafts.map(d=>[d.id,d.layers,d.canvas,d.pageRatio,d.paperColor,d.paperPattern]));

function prune(project,now){
 const entries=(project.autoSceneSnapshots||[]).slice().sort((a,b)=>validDate(b.at)-validDate(a.at));
 const selected=[],hours=new Set(),days=new Set();
 for(const record of entries){
  const age=now-validDate(record.at),bucket=age<HOUR?'recent':age<DAY?'hour':age<7*DAY?'day':null;
  if(!bucket)continue;
  if(bucket==='recent'&&selected.filter(s=>now-validDate(s.at)<HOUR).length>=12)continue;
  if(bucket==='hour'){const key=Math.floor(validDate(record.at)/HOUR);if(hours.has(key))continue;hours.add(key);}
  if(bucket==='day'){const key=Math.floor(validDate(record.at)/DAY);if(days.has(key))continue;days.add(key);}
  selected.push(record);
  if(selected.length>=40)break;
 }
 project.autoSceneSnapshots=selected;
 const hashes=new Set(selected.map(s=>s.hash));
 for(const hash of Object.keys(project.autoSceneSnapshotStore||{}))
   if(!hashes.has(hash))delete project.autoSceneSnapshotStore[hash];
}
export function makeAutoSceneSnapshot(project,{reason='periodic',at=new Date().toISOString(),force=false}={}){
 if(!project||project.isSnapshot||!Array.isArray(project.drafts)||!project.drafts.length)return false;
 const unsnapped=project.sceneOperationsSinceSnapshot||0;
 if(!unsnapped&&!force)return false;
 const content=signature(project.drafts);
 const prior=project.autoSceneSnapshots?.[0];
 if(prior?.signature===content&&!force)return false;
 const {hash,payload}=archivePayload(project.drafts);
 (project.autoSceneSnapshotStore||={})[hash]||=payload;
 (project.autoSceneSnapshots||=[]).push({id:crypto.randomUUID(),hash,at,reason,operationCount:unsnapped,activeDraftID:project.activeDraftID,signature:content});
 project.sceneOperationsSinceSnapshot=0;
 project.lastAutoSceneSnapshotAt=at;
 prune(project,validDate(at)||Date.now());
 return true;
}
export function recordSceneOperation(project,before,after,{actor='browser',at=new Date().toISOString()}={}){
 if(!before||!after||before.id!==after.id)return {changed:false,snapshot:false};
 const delta=createSceneTransition(before,after);
 if(!hasSceneChanges(delta))return {changed:false,snapshot:false};
 const entries=project.sceneOperations||[];
 // Exactly one reversible scene delta per committed editor action. Keep the
 // tail bounded; the auto snapshots retain earlier states.
 entries.push({id:crypto.randomUUID(),draftID:after.id,actor,at,delta});
 project.sceneOperations=entries.slice(-30);
 project.sceneOperationsSinceSnapshot=(project.sceneOperationsSinceSnapshot||0)+1;
 const last=validDate(project.lastAutoSceneSnapshotAt)||validDate(at);
 const reason=project.sceneOperationsSinceSnapshot>=AUTO_SNAPSHOT_OPERATIONS?'30-operations':
   validDate(at)-last>=AUTO_SNAPSHOT_INTERVAL_MS?'5-minutes':null;
 let snapshot=false;
 if(reason)try{snapshot=makeAutoSceneSnapshot(project,{reason,at});}
 catch(error){console.warn('自动 Scene 快照暂未保存，编辑操作仍完整保留',error?.message);}
 return {changed:true,snapshot,delta};
}
export function restoreAutoSceneSnapshot(project,id){
 const item=project.autoSceneSnapshots?.find(s=>s.id===id);
 if(!item||!project.autoSceneSnapshotStore?.[item.hash])throw Error('自动快照不存在');
 // Caller may use readArchivePayload for explicit restore; this function
 // returns the saved archive record rather than silently mutating the scene.
 return {item,archive:project.autoSceneSnapshotStore[item.hash]};
}
export const currentSceneDraft=project=>project?.drafts?.find(d=>d.id===project.activeDraftID)||project?.drafts?.[0];
export const copySceneBaseline=draft=>draft?snapshotDraft(draft):null;
