import test from 'node:test';import assert from 'node:assert/strict';
import {requestChat,ChatRequestError} from '../src/chat-transport.js';
const base={endpoint:'https://example.test/chat',key:'test-only',payload:{model:'test'},timeout:1};
const sse=chunks=>new Response(new ReadableStream({start(c){for(const chunk of chunks)c.enqueue(new TextEncoder().encode(chunk));c.close();}}),{headers:{'Content-Type':'text/event-stream'}});
test('streamed partial JSON tool arguments assemble before execution, comments are accepted',async()=>{
 const chunks=[{choices:[{delta:{tool_calls:[{index:0,id:'a',function:{name:'set_paper',arguments:'{"color":'}}]}}]},{choices:[{delta:{tool_calls:[{index:0,function:{arguments:'"#ffffff"}'}}]},finish_reason:'tool_calls'}]}];
 let sent;const result=await requestChat({...base,request:async(_,o)=>{sent=JSON.parse(o.body);return sse([': keep-alive\n\n',...chunks.map(x=>'data: '+JSON.stringify(x)+'\n\n'),'data: [DONE]\n\n']);}});
 assert.equal(sent.stream,true);assert.equal(result.choices[0].message.tool_calls[0].function.arguments,'{"color":"#ffffff"}');
});
test('truncated stream never returns executable tools',async()=>{await assert.rejects(requestChat({...base,request:async()=>sse(['data: {"choices":[{"delta":{"content":"{"}}]}\n\n'])}),/连接中断/);});
test('idle timeout and cancellation return meaningful errors without keys',async()=>{
 const request=(_,o)=>new Promise((_,reject)=>o.signal.addEventListener('abort',()=>reject(o.signal.reason)));
 await assert.rejects(requestChat({...base,timeout:.015,request}),/等待响应头超时/);
 const controller=new AbortController();controller.abort(Error('用户停止'));await assert.rejects(requestChat({...base,signal:controller.signal,request:(_,o)=>Promise.reject(o.signal.reason)}),/用户停止/);
});
test('HTTP authentication failures are distinguished',async()=>{await assert.rejects(requestChat({...base,request:async()=>new Response('',{status:401})}),/密钥无效/);});
test('A-12: provider errors have safe codes without leaking provider text or credentials',async()=>{
 const cases=[
  [401,'authentication',''],[429,'rate-limit',''],
  [400,'context-limit',JSON.stringify({error:{code:'context_length_exceeded',message:'private text and sk-should-not-leak'}})],
  [400,'unsupported-request',JSON.stringify({error:{code:'unsupported_response_format',message:'private text and sk-should-not-leak'}})]
 ];
 for(const [status,code,body] of cases){
  await assert.rejects(requestChat({...base,request:async()=>new Response(body,{status})}),error=>error instanceof ChatRequestError&&error.code===code&&!/private text|sk-should-not-leak/.test(error.message));
 }
 const pending=(_,options)=>new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason)));
 await assert.rejects(requestChat({...base,timeout:.01,request:pending}),error=>error.code==='idle-timeout');
});
test('keep-alive without text reports provider waiting, not fictitious output',async()=>{
 const progress=[];await requestChat({...base,onProgress:p=>progress.push(p),request:async()=>sse([': keep-alive\n\n','data: {"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\n','data: [DONE]\n\n'])});
 assert.ok(progress.some(p=>p.keepAlives===1&&p.received===0&&p.phase.includes('服务保活中')));assert.ok(progress.at(-1).networkBytes>0);assert.equal(progress.at(-1).received,2);
});
test('a broken progress renderer does not prevent the model request',async()=>{
 let requests=0;
 const response=await requestChat({...base,onProgress:()=>{throw Error('progress node was removed');},
  request:async()=>{requests++;return new Response(JSON.stringify({choices:[{message:{content:'ok'}}]}),
    {headers:{'Content-Type':'application/json'}});}});
 assert.equal(requests,1);
 assert.equal(response.choices[0].message.content,'ok');
});
