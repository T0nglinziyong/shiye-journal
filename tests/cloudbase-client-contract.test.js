import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {cloudClient,cloudEnabled,prepareCloudClient,invokeCloudFunction} from '../src/cloud-session.js';
import {cloudApiUrl,cloudApiRequest} from '../src/cloud-api-origin.js';

test('current browser identity and database module never selects a legacy provider or hosting proxy',async()=>{
 const source=await readFile(new URL('../src/cloud-session.js',import.meta.url),'utf8');
 assert.doesNotMatch(source,/@supabase\/|SUPABASE_|registerEndPointWithKey|fetchCloudRequest/);
 assert.match(source,/registerFunctions/);
 assert.match(source,/app\.callFunction\(options\)/);
});
test('missing CloudBase configuration cannot silently invoke a remote API',async()=>{
 assert.equal(cloudEnabled,false);
 await prepareCloudClient();
 assert.throws(()=>cloudClient(),/尚未初始化/);
 await assert.rejects(invokeCloudFunction({name:'shiye-api',data:{}}),/未配置/);
});
test('business API routes use registered event functions rather than a commit relay',async()=>{
 assert.equal(cloudApiUrl('/api/cos'),'/api/cos');
 assert.equal(cloudApiUrl('/api/search'),'/api/search');
 assert.throws(()=>cloudApiUrl('/api/sync-commit'),/未登记/);
 await assert.rejects(cloudApiRequest('/api/sync-commit',{method:'POST',body:'{}'}),{code:'SHIYE_API_ROUTE'});
});
