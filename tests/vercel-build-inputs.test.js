import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('Vercel uploads each local build script used by npm run build',()=>{
  const build=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).scripts.build;
  const ignore=readFileSync(new URL('../.vercelignore',import.meta.url),'utf8');
  const allow=new Set(ignore.split(/\r?\n/).map(line=>line.trim()).filter(line=>line.startsWith('!')));
  const scripts=[...build.matchAll(/\bnode\s+(scripts\/[\w.-]+\.mjs)\b/g)].map(match=>match[1]);
  assert.ok(scripts.length>0);
  for(const script of scripts)assert.ok(allow.has(`!${script}`),`${script} must be uploaded for Vercel build`);
});


test('Vercel uploads the Vite worker config used by production build',()=>{
  const ignore=readFileSync(new URL('../.vercelignore',import.meta.url),'utf8');
  const allow=new Set(ignore.split(/\r?\n/).map(line=>line.trim()).filter(line=>line.startsWith('!')));
  assert.ok(allow.has('!vite.config.js'),'vite.config.js must be uploaded so worker.format remains es on Vercel');
});


test('Vercel Git auto-deployment is limited to main and test',()=>{
  const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
  assert.deepEqual(config.git?.deploymentEnabled,{'**':false,main:true,test:true});
  // Minimatch '*' does not match '/' in branches such as fix/something.
  // Those commits otherwise create canceled Preview deployments and consume quota.
});

test('Vercel cleanup schedules fit the daily Hobby Cron limit',()=>{
  const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
  assert.deepEqual(config.crons,[
    {path:'/api/account-gc',schedule:'0 3 * * *'},
    {path:'/api/cos-orphan-gc',schedule:'30 3 * * *'}
  ]);
});

test('Vercel uploads every server module imported by the COS function',()=>{
  const source=readFileSync(new URL('../api/cos.js',import.meta.url),'utf8');
  const ignore=readFileSync(new URL('../.vercelignore',import.meta.url),'utf8');
  const allow=new Set(ignore.split(/\r?\n/).map(line=>line.trim()).filter(line=>line.startsWith('!')));
  const imports=[...source.matchAll(/from ['"]\.\.\/(server\/[^'"]+)['"]/g)].map(match=>match[1]);
  assert.ok(imports.length>0);
  assert.ok(allow.has('!server'),'server directory must be traversed');
  for(const path of imports){
    assert.ok(allow.has('!'+path),path+' must be uploaded for the COS function');
    assert.ok(readFileSync(new URL('../'+path,import.meta.url)).length>0,path+' must exist');
  }
});
