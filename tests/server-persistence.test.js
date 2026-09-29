import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';

const entry=resolve('server/server.mjs'),port=45000+Math.floor(Math.random()*15000);
const url=`http://127.0.0.1:${port}`;
async function start(dir){const child=spawn(process.execPath,[entry],{env:{...process.env,SHIYE_DATA_DIR:dir,SHIYE_PORT:String(port),SHIYE_HOST:'127.0.0.1',SHIYE_TOKEN:'test-token'},stdio:'ignore'});for(let i=0;i<100;i++){try{if((await fetch(url+'/api/health')).ok)return child;}catch{}await new Promise(r=>setTimeout(r,30));}child.kill();throw Error('数据服务未能启动');}
async function request(path,method='GET',body){return fetch(url+path,{method,headers:{Authorization:'Bearer test-token','Content-Type':'application/json'},body:body&&JSON.stringify(body)});}
test('server persists records and binary images across restart, rejects unauthorized writes',async()=>{const dir=await mkdtemp(join(tmpdir(),'shiye-storage-'));let child;try{child=await start(dir);assert.equal((await request('/api/store/assets')).status,200);assert.equal((await fetch(url+'/api/store/assets')).status,401);
 const image=Buffer.from('sample-image-bytes').toString('base64');let r=await request('/api/transaction','POST',{operations:[{action:'put',store:'assets',item:{id:'a1',title:'测试'}},{action:'put',store:'blobs',item:{id:'b1',data:'data:image/png;base64,'+image}}]});assert.equal(r.status,200,await r.text());child.kill();await new Promise(resolve=>child.once('exit',resolve));child=await start(dir);assert.equal((await (await request('/api/store/assets/a1')).json()).title,'测试');assert.equal((await (await request('/api/store/blobs/b1')).json()).data,'data:image/png;base64,'+image);
 const empty={format:'shiye-pwa',version:1,stores:Object.fromEntries(['assets','blobs','series','projects','meta','trash'].map(x=>[x,[]]))};assert.equal((await request('/api/migrate','POST',empty)).status,409);
}finally{child?.kill();await rm(dir,{recursive:true,force:true});}});
test('public-origin mode requires a strong token and accepts only the configured website origin',async()=>{const dir=await mkdtemp(join(tmpdir(),'shiye-public-'));const longToken='a'.repeat(64);let child;try{child=spawn(process.execPath,[entry],{env:{...process.env,SHIYE_DATA_DIR:dir,SHIYE_PORT:String(port),SHIYE_PUBLIC_ORIGIN:'https://shiyejounery.top',SHIYE_TOKEN:'short'},stdio:'ignore'});await new Promise(resolve=>child.once('exit',resolve));assert.notEqual(child.exitCode,0);
 child=spawn(process.execPath,[entry],{env:{...process.env,SHIYE_DATA_DIR:dir,SHIYE_PORT:String(port),SHIYE_PUBLIC_ORIGIN:'https://shiyejounery.top',SHIYE_TOKEN:longToken},stdio:'ignore'});for(let i=0;i<100;i++){try{if((await fetch(url+'/api/health')).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,30));}
 const allowed=await fetch(url+'/api/store/assets',{headers:{Origin:'https://shiyejounery.top',Authorization:'Bearer '+longToken}});assert.equal(allowed.status,200);
 const denied=await fetch(url+'/api/store/assets',{headers:{Origin:'https://other.example',Authorization:'Bearer '+longToken}});assert.equal(denied.status,403);
}finally{child?.kill();await rm(dir,{recursive:true,force:true});}});
