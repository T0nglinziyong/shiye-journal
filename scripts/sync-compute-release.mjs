import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,readFile,writeFile,symlink,rename,rm,access,readlink} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';

const exec=promisify(execFile),repo=fileURLToPath(new URL('../',import.meta.url));
const base=process.env.SHIYE_RELEASE_ROOT;
if(!base)throw Error('缺少 SHIYE_RELEASE_ROOT');
await mkdir(base,{recursive:true});
const lock=join(base,'.sync-lock');
try{await mkdir(lock);}catch(e){if(e.code==='EEXIST')process.exit(0);throw e;}
let drained=false,previous=null,switched=false;
const run=(command,args,cwd=repo)=>exec(command,args,{cwd,maxBuffer:2*1024*1024});
try{
 const response=await fetch('https://shiyejournal.vip/version.json',{cache:'no-store',signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('无法核对 App 发布版本');
 const {commit}=await response.json();if(!/^[a-f0-9]{40}$/.test(commit))throw Error('App 版本无效');
 const statusPath=process.env.SHIYE_RUNTIME_STATUS;
 const status=async()=>{const s=JSON.parse(await readFile(statusPath,'utf8'));if(Date.now()-s.updatedAt>10000)throw Error('计算服务状态过期');return s;};
 const current=await status();
 if((await run('git',['rev-parse','HEAD'],current.root)).stdout.trim()===commit){console.log('计算服务器与 App 已是同一版本');process.exitCode=0;}
 else{
  await run('git',['fetch','github','test']);
  await run('git',['merge-base','--is-ancestor',commit,'github/test']);
  const release=join(base,commit);
  try{await access(release);}catch{await run('git',['worktree','add','--detach',release,commit]);}
  await run('npm',['ci'],release);
  await run(process.execPath,['scripts/build-offline-runtime.mjs'],release);
  const local=JSON.parse(await readFile(join(release,'public/creation-resources.json'),'utf8'));
  const remote=await fetch('https://shiyejournal.vip/creation-resources.json',{cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!remote.ok||(await remote.json()).version!==local.version)throw Error('App 与计算资源指纹不一致，未切换');
  await run(process.execPath,['--input-type=module','-e',"await (await import('./compute-server/harness/skills.mjs')).loadCreationSkills(); await (await import('./src/offline-node-preview.mjs')).loadOfflineCanvas();"],release);
  await run('systemctl',['--user','kill','--kill-whom=main','--signal=SIGUSR1','shiye-compute.service']);drained=true;
  const until=Date.now()+660000;
  for(;;){const s=await status();if(s.draining&&!s.busy)break;if(Date.now()>until)throw Error('计算任务尚未结束，保留当前版本');await delay(2000);}
  const link=join(base,'current'),temp=link+'.next';previous=await readlink(link);await rm(temp,{force:true});await symlink(release,temp);await rename(temp,link);switched=true;
  await run('systemctl',['--user','restart','shiye-compute.service']);
  const healthDeadline=Date.now()+30000;
  for(;;){await delay(1000);const s=await status();if(s.root===release&&!s.draining&&s.pid!==current.pid)break;if(Date.now()>healthDeadline)throw Error('新版本计算服务未就绪');}
  drained=false;switched=false;
  await writeFile(join(base,'release.json'),JSON.stringify({commit,resourceVersion:local.version,updatedAt:new Date().toISOString()}));
  console.log('已同步 App 发布版本：'+commit);
 }
}finally{
 if(switched&&previous){const link=join(base,'current'),temp=link+'.rollback';await rm(temp,{force:true});await symlink(previous,temp);await rename(temp,link);}
 if(drained)await run('systemctl',['--user','restart','shiye-compute.service']);
 await rm(lock,{recursive:true,force:true});
}
