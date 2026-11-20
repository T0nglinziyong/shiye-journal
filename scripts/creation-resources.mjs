import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';

export const resourceRoot=fileURLToPath(new URL('../',import.meta.url));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function creationResources(root=resourceRoot){
 const files=[];
 async function walk(dir){
  for(const entry of await readdir(resolve(root,dir),{withFileTypes:true})){
   const path=dir+'/'+entry.name;
   if(entry.isDirectory()){if(entry.name!=='generated')await walk(path);}
   else if(/\.(?:js|jsx|mjs|md|json|ttf|otf|woff2|txt|png)$/.test(path))files.push(path);
  }
 }
 for(const dir of ['creation-skills','compute-server','src'])await walk(dir);
 files.push('package-lock.json','scripts/creation-resources.mjs','scripts/build-offline-runtime.mjs');
 const fontManifest=JSON.parse(await readFile(resolve(root,'src/assets/fonts/manifest.json'),'utf8'));
 for(const font of fontManifest.fonts)for(const item of font.files){
  if(sha(await readFile(resolve(root,'src/assets/fonts',item.file)))!==item.sha256)throw Error('字体指纹不一致：'+font.family);
 }
 const entries=await Promise.all(files.sort().map(async path=>({path,sha256:sha(await readFile(resolve(root,path)))})));
 return {format:'shiye-creation-resources-v1',version:sha(JSON.stringify(entries)),fonts:fontManifest.fonts.map(({family,version,file,webFile})=>({family,version,file,webFile})),files:entries};
}
export async function buildCreationResources(root=resourceRoot){
 const manifest=await creationResources(root);
 await mkdir(resolve(root,'src/generated'),{recursive:true});
 await writeFile(resolve(root,'src/generated/creation-resources.js'),'export const creationResourceVersion='+JSON.stringify(manifest.version)+';\n');
 await writeFile(resolve(root,'public/creation-resources.json'),JSON.stringify(manifest));
 return manifest;
}
if(process.argv[1]&&relative(resourceRoot,resolve(process.argv[1]))==='scripts/creation-resources.mjs'){
 const manifest=await buildCreationResources();console.log(JSON.stringify({version:manifest.version,files:manifest.files.length,fonts:manifest.fonts.length}));
}
