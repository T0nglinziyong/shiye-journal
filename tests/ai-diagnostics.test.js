import test from 'node:test';
import assert from 'node:assert/strict';
import {createAIRecorder,publicAIDiagnosticReport} from '../src/ai-diagnostics.js';

test('A-13: exported default diagnostic omits text, images, provider errors and fake keys',()=>{
 const privateText='私人正文 A < B',image='data:image/png;base64,PRIVATE_IMAGE',key='sk-private-test-key';
 const report={date:'2026-10-01',model:'example-model',parameters:{generationMode:'agent',temperature:.7,maxTokens:6000,maxTurns:8,materialCount:2,prompt:privateText,key},rounds:[{turn:1,tools:[{name:'upsert_text',ok:false,detail:privateText},{name:key,ok:false,detail:image}],review:{materials:1,textBlocks:1,graphics:0,warnings:[privateText]}}],outcome:'failed',stopReason:'unsupported-request',error:privateText+' '+key,image,budget:{limit:8,totalRequests:1,creationRequests:1,formatRepairRequests:0,visualReviewRequests:0,stopReason:'unsupported-request'}};
 const exported=publicAIDiagnosticReport(report),serialized=JSON.stringify(exported);
 for(const secret of [privateText,image,key,'PRIVATE_IMAGE'])assert.ok(!serialized.includes(secret));
 assert.equal(exported.rounds[0].tools[0].name,'upsert_text');assert.equal(exported.rounds[0].tools[1].name,'unknown');
 assert.equal(exported.rounds[0].review.warningCount,1);assert.equal(exported.stopReason,'unsupported-request');
});

test('A-13: default request metrics contain only timing, status and actual provider usage',async()=>{
 const rows=new Map(),db={get:async(_store,id)=>rows.get(id),put:async(_store,value)=>rows.set(value.id,value)};
 const key='sk-private-test-key',privateText='私人正文 A < B',image='data:image/png;base64,PRIVATE_IMAGE';
 const recorder=await createAIRecorder({db,model:'example-model',key,storage:{getItem:()=>null},request:async()=>new Response(JSON.stringify({usage:{prompt_tokens:42,completion_tokens:7},choices:[{message:{content:privateText+image+key}}]}),{status:200,headers:{'Content-Type':'application/json'}})});
 await recorder.request('https://example.test/chat',{method:'POST',headers:{Authorization:'Bearer '+key},body:JSON.stringify({messages:[{role:'user',content:[privateText,image]}]})});
 await recorder.finish('failed');
 const stored=JSON.stringify([...rows.values()]);
 for(const secret of [privateText,image,key,'PRIVATE_IMAGE'])assert.ok(!stored.includes(secret));
 const entry=rows.get('ai-diagnostics').entries[0];assert.equal(entry.inputTokens,42);assert.equal(entry.outputTokens,7);
});

test('A-13: opted-in full context is scoped to its session and can be deleted',async()=>{
 const rows=new Map(),db={get:async(_store,id)=>rows.get(id),put:async(_store,value)=>rows.set(value.id,value),all:async()=>[...rows.values()],remove:async(_store,id)=>rows.delete(id)};
 const key='sk-private-test-key',privateText='私人正文 A < B',image='data:image/png;base64,PRIVATE_IMAGE';
 const recorder=await createAIRecorder({db,model:'example-model',key,storage:{getItem:()=> 'true'},request:async()=>new Response(JSON.stringify({usage:{prompt_tokens:1,completion_tokens:2},choices:[]}),{status:200,headers:{'Content-Type':'application/json'}})});
 await recorder.request('https://example.test/chat',{method:'POST',headers:{Authorization:'Bearer '+key},body:JSON.stringify({messages:[{role:'user',content:[privateText,image]}]})});
 await recorder.finish('completed');
 const session=[...rows.values()].find(row=>row.id.startsWith('ai-context-'));
 assert.ok(session);assert.match(JSON.stringify(session),/PRIVATE_IMAGE/);assert.match(JSON.stringify(session),/私人正文/);assert.ok(!JSON.stringify(session).includes(key));
 await db.remove('meta',session.id);assert.equal(rows.has(session.id),false);
});
