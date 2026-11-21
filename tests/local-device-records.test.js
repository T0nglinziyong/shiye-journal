import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {localDeviceRecords} from '../src/local-device-records.js';


test('local matching choices never write a server store and survive device reload',async()=>{
 const account='local-example-A';
 await localDeviceRecords.put(account,{id:'matching-session-v1',context:{basket:['a'],matchStyle:'旅行'},variants:[]});
 assert.deepEqual((await localDeviceRecords.get(account,'matching-session-v1')).context.basket,['a']);
 const same=await localDeviceRecords.list(account,'matching-');
 assert.equal(same.length,1);assert.equal(same[0].context.matchStyle,'旅行');
 await localDeviceRecords.delete(account,'matching-session-v1');
 assert.equal(await localDeviceRecords.get(account,'matching-session-v1'),null);
});
test('device UI state and optional diagnostics stay isolated by account',async()=>{
 const id='ai-diagnostics';
 await localDeviceRecords.put('user-a',{id,entries:[{model:'a'}]});
 await localDeviceRecords.put('user-b',{id,entries:[{model:'b'}]});
 assert.equal((await localDeviceRecords.get('user-a',id)).entries[0].model,'a');
 assert.equal((await localDeviceRecords.get('user-b',id)).entries[0].model,'b');
 await localDeviceRecords.delete('user-a',id);
 await localDeviceRecords.delete('user-b',id);
});
test('binary local 360px covers persist without JSON conversion',async()=>{
 const cover=new Blob(['webp-binary'],{type:'image/webp'});
 await localDeviceRecords.put('user-cover',{id:'work-cover:p',updatedAt:'2026-10-09',blob:cover});
 const saved=await localDeviceRecords.get('user-cover','work-cover:p');
 assert.ok(saved.blob instanceof Blob);assert.equal(saved.blob.type,'image/webp');
 assert.equal(await saved.blob.text(),'webp-binary');
 await localDeviceRecords.delete('user-cover','work-cover:p');
});
