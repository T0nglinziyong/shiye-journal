import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';

const dataDir=await mkdtemp(join(tmpdir(),'shiye-http-smoke-'));
const port=45000+Math.floor(Math.random()*15000),base=`http://127.0.0.1:${port}`,token='a'.repeat(64);
const child=spawn(process.execPath,[resolve('server/server.mjs')],{env:{...process.env,SHIYE_DATA_DIR:dataDir,SHIYE_PORT:String(port),SHIYE_PUBLIC_ORIGIN:'https://shiyejounery.top',SHIYE_TOKEN:token},stdio:'ignore'});
try{
  let live=false;for(let i=0;i<100;i++){try{live=(await fetch(base+'/api/health')).ok;if(live)break;}catch{}await new Promise(r=>setTimeout(r,30));}assert.ok(live,'server started');
  const page=await (await fetch(base+'/')).text();assert.match(page,/<meta name="shiye-server" content="1">/);
  assert.equal((await fetch(base+'/api/store/assets')).status,401);
  const auth=await fetch(base+'/api/store/assets',{headers:{Authorization:'Bearer '+token,Origin:'https://shiyejounery.top'}});assert.equal(auth.status,200);
  assert.equal(auth.headers.get('access-control-allow-origin'),'https://shiyejounery.top');
  console.log('Self-host HTTP smoke: static app, auth and same-origin proxy mode ready');
}finally{child.kill();await rm(dataDir,{recursive:true,force:true});}
