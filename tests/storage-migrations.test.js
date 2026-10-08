import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateDetachedSnapshot,supportedSchema} from '../src/storage-migrations.js';
test('detached migration cannot modify source snapshot before commit',async()=>{
 const original={stores:{assets:[{id:'a',tags:['old']}]}};
 const migrated=await migrateDetachedSnapshot(original,{from:1,to:2,migrations:{1:copy=>{
   copy.stores.assets[0].tags.push('new');return copy;
 }}});
 assert.deepEqual(original.stores.assets[0].tags,['old']);
 assert.deepEqual(migrated.stores.assets[0].tags,['old','new']);
 assert.throws(()=>supportedSchema(2),/版本不兼容/);
});
test('schema version rejects future data before destructive restore',()=>{
 assert.equal(supportedSchema(1),1);
 assert.throws(()=>supportedSchema(2),/版本不兼容/);
 assert.throws(()=>supportedSchema(0),/版本不兼容/);
});
