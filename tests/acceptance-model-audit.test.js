import test from 'node:test';
import assert from 'node:assert/strict';
import {auditAcceptanceModel} from '../scripts/lib/acceptance-model-audit.mjs';

test('acceptance observer forwards identical request objects and preserves automatic auxiliary calls',async()=>{
 const seen=[],saved=[],provider=async input=>{seen.push(input);return 'main';};
 provider.compact=async input=>{seen.push(input);return 'compact';};
 provider.critique=async input=>{seen.push(input);return 'critique';};
 const model=auditAcceptanceModel(provider,async value=>saved.push(value));
 const request={messages:[{role:'user',content:[{type:'image_url',image_url:{url:'data:image/png;base64,aGVsbG8='}}]}],tools:[{function:{name:'creation_finish'}}],signal:new AbortController().signal};
 const before=JSON.stringify(request);
 assert.equal(await model(request),'main');assert.equal(await model.compact(request),'compact');assert.equal(await model.critique(request),'critique');
 assert.ok(seen.every(item=>item===request));assert.equal(JSON.stringify(request),before);
 assert.deepEqual(saved.map(item=>item.kind),['main','compact','critique']);
 assert.equal(saved[0].input.messages[0].content[0].image_url.url.imageSHA256,'sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
 assert.equal(saved[0].input.tools[0].function.name,'creation_finish');assert.equal(saved[0].input.signal,undefined);
});
