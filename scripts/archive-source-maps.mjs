import {mkdir,readdir,rename} from 'node:fs/promises';
import {join,relative} from 'node:path';
import {buildSha} from './build-identity.mjs';

const dist=new URL('../dist/',import.meta.url);
const commit=buildSha||'local';
const safe=/^[a-f0-9]{40}$/.test(commit)?commit:'local';
const archive=new URL(`../.build-sourcemaps/${safe}/`,import.meta.url);
let count=0;
async function moveMaps(directory){
  for(const entry of await readdir(directory,{withFileTypes:true})){
    const source=new URL(entry.name+(entry.isDirectory()?'/':''),directory);
    if(entry.isDirectory()){await moveMaps(source);continue;}
    if(!entry.name.endsWith('.map'))continue;
    const target=new URL(relative(dist.pathname,source.pathname),archive);
    await mkdir(new URL('./',target),{recursive:true});
    await rename(source,target);count++;
  }
}
await mkdir(archive,{recursive:true});
await moveMaps(dist);
console.log(`Archived ${count} build source maps outside public dist`);
