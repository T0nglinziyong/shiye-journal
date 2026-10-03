import {openDB} from 'idb';
import {canonicalTaskSource} from './task-source.js';

// Exported web-AI tasks are authority for a later result. Keep them separate
// from disposable image/read caches and scope them to the authenticated user.
export function createOfflineTaskStore({name='shiye-offline-tasks-current'}={}){
  let connection;
  const db=()=>connection??=openDB(name,1,{upgrade(database){database.createObjectStore('tasks',{keyPath:'key'});}});
  const key=(account,bundleId)=>JSON.stringify([account,bundleId]);
  const valid=(account,bundleId)=>typeof account==='string'&&account.length>0&&typeof bundleId==='string'&&bundleId.length>0&&bundleId.length<=120;
  return {
    async save(account,source){
      if(!valid(account,source?.bundleId)||source.taskBinding!=='local')throw Error('网页 AI 任务身份无效');
      const taskKey=key(account,source.bundleId),database=await db(),transaction=database.transaction('tasks','readwrite'),store=transaction.objectStore('tasks');
      const previous=await store.get(taskKey);
      if(previous&&canonicalTaskSource(previous.source)!==canonicalTaskSource(source)){await transaction.done;throw Error('同一任务编号已有不同的原始任务');}
      if(!previous)store.put({key:taskKey,account,source:structuredClone(source),createdAt:new Date().toISOString()});
      await transaction.done;
    },
    async load(account,bundleId){if(!valid(account,bundleId))return null;return structuredClone((await (await db()).get('tasks',key(account,bundleId)))?.source||null);},
  };
}

export const offlineTaskStore=createOfflineTaskStore();
