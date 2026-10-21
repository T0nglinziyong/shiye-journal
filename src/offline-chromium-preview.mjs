import {spawn,spawnSync} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {offlineBrowserSource} from './generated/offline-browser-source.js';
import {offlineBrowserPage} from './offline-browser-page.js';

export function findOfflineChromium(){
 const candidates=[process.env.SHIYE_CHROMIUM_PATH,process.env.CHROME_BIN,'/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser','/opt/google/chrome/chrome','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
 for(const path of candidates){
  if(!existsSync(path))continue;
  const result=spawnSync(path,['--version'],{encoding:'utf8',timeout:3000});
  if(result.status===0&&/chrom(e|ium)/i.test(result.stdout))return {path,rendererBackend:'browser-canvas/'+result.stdout.trim()};
 }
 return null;
}
// Private CDP pipe transport: no debug TCP port, remote page or asset upload.
export async function renderChromiumPNG(draft,source,images,backend){
 const profile=await mkdtemp(join(tmpdir(),'shiye-render-'));
 const flags=['--headless=new','--disable-background-networking','--no-first-run','--no-default-browser-check','--remote-debugging-pipe','--user-data-dir='+profile,'about:blank'];
 if(process.env.SHIYE_CHROMIUM_NO_SANDBOX==='1')flags.unshift('--no-sandbox');
 const child=spawn(backend.path,flags,{stdio:['ignore','ignore','pipe','pipe','pipe']});
 let sequence=0,buffer='',diagnostics='',closed=false;
 const pending=new Map();
 const failAll=error=>{closed=true;for(const p of pending.values()){clearTimeout(p.timer);p.reject(error);}pending.clear();};
 child.stderr.on('data',chunk=>{diagnostics=(diagnostics+chunk.toString()).slice(-8000);});
 child.on('error',failAll);child.on('exit',code=>failAll(Error('Chromium 已退出 ('+code+')：'+diagnostics)));
 child.stdio[3].on('error',failAll);child.stdio[4].on('error',failAll);child.stdio[4].setEncoding('utf8');
 child.stdio[4].on('data',chunk=>{
  buffer+=chunk;
  if(buffer.length>150_000_000){failAll(Error('Chromium 响应超出预算'));child.kill();return;}
  let end;
  while((end=buffer.indexOf('\0'))>=0){
   const message=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!message)continue;
   let data;try{data=JSON.parse(message);}catch{failAll(Error('Chromium 返回无效 JSON'));return;}
   const item=pending.get(data.id);if(!item)continue;
   pending.delete(data.id);clearTimeout(item.timer);data.error?item.reject(Error(data.error.message)):item.resolve(data.result);
  }
 });
 const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{
  if(closed){reject(Error('Chromium 未启动或已退出：'+diagnostics));return;}
  const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('Chromium 超时：'+method+' '+diagnostics));},30000);
  pending.set(id,{resolve,reject,timer});child.stdio[3].write(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})})+'\0');
 });
 try{
  const version=await call('Browser.getVersion');
  const {targetId}=await call('Target.createTarget',{url:'about:blank'});
  const {sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});
  await call('Page.enable',{},sessionId);await call('Network.enable',{},sessionId);
  await call('Network.setBlockedURLs',{urls:['http://*','https://*','ftp://*']},sessionId);
  const {frameTree}=await call('Page.getFrameTree',{},sessionId);
  await call('Page.setDocumentContent',{frameId:frameTree.frame.id,html:offlineBrowserPage(draft,source,images,offlineBrowserSource)},sessionId);
  const response=await call('Runtime.evaluate',{awaitPromise:true,returnByValue:true,expression:`(async()=>{
   const until=Date.now()+25000;
   while(!window.SHIYE_RENDER_READY){
    if(window.SHIYE_RENDER_ERROR)throw Error(window.SHIYE_RENDER_ERROR);
    if(Date.now()>until)throw Error('等待实际 Canvas 渲染超时');
    await new Promise(resolve=>setTimeout(resolve,20));
   }
   return {preview:window.SHIYE_EXPORT_PREVIEW(),report:window.SHIYE_RENDER_REPORT};
  })()`},sessionId);
  if(response.exceptionDetails)throw Error(response.exceptionDetails.exception?.description||response.exceptionDetails.text);
  const {preview,report}=response.result.value||{};
  if(!preview?.png?.startsWith('data:image/png;base64,'))throw Error('浏览器没有生成真实 PNG');
  return {png:Buffer.from(preview.png.slice('data:image/png;base64,'.length),'base64'),report:{...report,rendererBackend:'browser-canvas/'+version.product,fontReview:'environment-dependent'}};
 }finally{
  failAll(Error('浏览器渲染会话已结束'));
  if(child.exitCode===null){
   const exited=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');
   let timer;await Promise.race([exited,new Promise(resolve=>{timer=setTimeout(()=>{child.kill('SIGKILL');resolve();},1500);})]);clearTimeout(timer);
  }
  await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});
 }
}
