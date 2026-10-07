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
