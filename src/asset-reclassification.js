import {applyFreshClassification,classifyCloudAsset} from './cloud-asset-classification.js';
import {recordRuntimeIssue} from './runtime-diagnostics.js';
import {explainUserError} from './user-facing-error.js';

export const pendingReclassifications=assets=>assets.filter(asset=>
  asset.reclassificationPendingAt&&!asset.isCreativePreset&&!asset.isProjectInternal);

export async function beginAssetReclassification(records,{db,state,render}){
 const at=new Date().toISOString();
 const pending=records.map(record=>({...record,reviewStatus:'pendingReview',
  reviewStatusSource:'reclassification',reclassificationPendingAt:at,updatedAt:at}));
 await db.transaction(['assets'],tx=>{
  for(const asset of pending)tx.objectStore('assets').put(asset);
 });
 for(const asset of pending){
  const current=state.assets.find(item=>item.id===asset.id);
  if(current)Object.assign(current,asset);
 }
 render?.();
 return pending;
}

export async function runAssetReclassification(records,{db,state,assetOrganization,toast,render,
  background=false,classify=classifyCloudAsset}){
 const accountID=state.accountId;
 let completed=0,failed=0,firstError=null;
 await assetOrganization.run(records,{priority:background?'background':'foreground',
  waitForSave:()=>db.flushProjects(),
  organize:async(record,isCurrent)=>{
   if(state.accountId!==accountID||!isCurrent())return;
   const result=await classify(record.id,{db,reclassify:true,skipFlush:true,skipRefresh:true});
   if(state.accountId!==accountID||!isCurrent())return;
   const current=state.assets.find(asset=>asset.id===record.id);
   applyFreshClassification(current,record,result);
   completed++;
   if(typeof window!=='undefined'){
    window.dispatchEvent(new Event('shiye-library-refresh'));
    window.dispatchEvent(new Event('shiye-matching-refresh'));
   }
  },
  onError:error=>{failed++;firstError||=error;
   recordRuntimeIssue('handled',error,state.route,{phase:'ai'});}
 });
 if(state.accountId===accountID){
  try{await db.refreshCloud();}
  catch(error){recordRuntimeIssue('handled',error,state.route,{phase:'sync'});}
  render?.();
  if(!background)toast?.(failed?
   `已整理 ${completed} 件，${failed} 件未完成。${explainUserError(firstError,'素材整理')}`:
   `已整理 ${completed} 件`);
 }
 return {completed,failed};
}
