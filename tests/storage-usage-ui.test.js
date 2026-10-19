import test from 'node:test';
import assert from 'node:assert/strict';
import {createStorageUsageController,formatStorageBytes} from '../src/storage-usage-ui.js';
test('storage values are only logical sizes and unknown inventory is not zero',()=>{
 assert.equal(formatStorageBytes(1024),'1.0 KB');
 assert.equal(formatStorageBytes(1024**3),'1.00 GB');
 assert.equal(formatStorageBytes(null),'未知');
});
test('CloudBase returns current-account JSON stats through one function route',async()=>{
 const calls=[];const controller=createStorageUsageController({fetcher:async(path,opts)=>{
   calls.push({path,method:opts.method});
   return {ok:true,json:async()=>({scope:'current-account',
     database:{recordCount:12,metadataJSONBytes:8192},cos:{inventoryComplete:false}})};
 }});
 const data=await controller.getUsage();
 assert.equal(data.database.recordCount,12);
 assert.deepEqual(calls,[{path:'/api/storage-usage',method:'GET'}]);
});
test('does not accept another account statistics or malformed server response',async()=>{
 const controller=createStorageUsageController({fetcher:async()=>({
   ok:true,json:async()=>({scope:'all-accounts',database:{recordCount:200}})})});
 await assert.rejects(controller.getUsage(),/协议不匹配/);
});
test('does not offer a browser-side delete or prune endpoint',()=>{
 const controller=createStorageUsageController({fetcher:async()=>{}});
 assert.equal(controller.prune,undefined);
 assert.equal(controller.getCOS,undefined);
});
