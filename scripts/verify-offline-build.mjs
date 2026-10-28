// Generated bundles are build products, not a second maintained implementation.
// Verify two fresh builds are identical; fail on missing/empty artifacts.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const names=['creation-fixed-source.js','offline-browser-source.js','offline-glyph-source.js','offline-validate-source.js'];
const build=()=>{const r=spawnSync(process.execPath,['scripts/build-offline-runtime.mjs'],{cwd:root,encoding:'utf8',timeout:60000});assert.equal(r.status,0,r.stderr||r.stdout);};
const hashes=async()=>Object.fromEntries(await Promise.all(names.map(async name=>{const data=await readFile(resolve(root,'src/generated',name));assert.ok(data.length>100,name+' empty');return [name,createHash('sha256').update(data).digest('hex')];})));
await rm(resolve(root,'src/generated'),{recursive:true,force:true});build();const first=await hashes();
await rm(resolve(root,'src/generated'),{recursive:true,force:true});build();assert.deepEqual(await hashes(),first,'fresh generated bundles must be deterministic');
await mkdir(resolve(root,'test-results'),{recursive:true});await writeFile(resolve(root,'test-results/creation-build.json'),JSON.stringify({passed:true,builds:2,hashes:first},null,2)+'\n');
console.log('Creation runtime clean-build reproducibility passed',first);
