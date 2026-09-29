import test from 'node:test';import assert from 'node:assert/strict';
import {requestChat} from '../src/chat-transport.js';
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
 await assert.rejects(requestChat({...base,timeout:.015,request}),/等待模型响应超时/);
 const controller=new AbortController();controller.abort(Error('用户停止'));await assert.rejects(requestChat({...base,signal:controller.signal,request:(_,o)=>Promise.reject(o.signal.reason)}),/用户停止/);
});
test('HTTP authentication failures are distinguished',async()=>{await assert.rejects(requestChat({...base,request:async()=>new Response('',{status:401})}),/密钥无效/);});
