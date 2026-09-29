import {execFileSync} from 'node:child_process';
export async function browserHarness(name,url){
  const cli=args=>execFileSync('npx',['--yes','agent-browser','--session',name,...args],{encoding:'utf8',timeout:60000});
  cli(['--args','--no-sandbox','open','about:blank']);const ws=new WebSocket(cli(['get','cdp-url']).trim());await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  let number=0,session,context;const pending=new Map(),errors=[];
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);};
  const command=(method,params={},target=session)=>new Promise((resolve,reject)=>{const id=++number,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},60000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params,...(target?{sessionId:target}:{})}));});
  const evaluate=async expression=>{const r=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const wait=async selector=>{for(let i=0;i<1500;i++){if(await evaluate('!!document.querySelector('+JSON.stringify(selector)+')'))return;await sleep(20);}throw Error('Missing '+selector);};
  const click=async(selector,next)=>{await wait(selector);await evaluate('document.querySelector('+JSON.stringify(selector)+').click()');if(next)await wait(next);};
  context=(await command('Target.createBrowserContext',{},null)).browserContextId;const target=(await command('Target.createTarget',{url:'about:blank',browserContextId:context},null)).targetId;session=(await command('Target.attachToTarget',{targetId:target,flatten:true},null)).sessionId;await command('Target.activateTarget',{targetId:target},null);await command('Page.enable');await command('Runtime.enable');await command('Page.navigate',{url});
  return {command,evaluate,wait,click,sleep,errors,close:async()=>{await command('Target.disposeBrowserContext',{browserContextId:context},null);ws.close();cli(['close']);}};
}
