// Fails closed before declaring the *whole* application CloudBase-only.
// Reports filenames/line numbers/category, not source lines or credentials.
import {readdir,readFile,lstat} from 'node:fs/promises';
import {dirname,resolve,join,relative} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const patterns=[
 ['supabase-client',/@supabase\/supabase-js/],
 ['supabase-configuration',/\b(?:VITE_SHIYE_|SHIYE_)?SUPABASE_[A-Z_]+/],
 ['supabase-host',/\.supabase\.(?:co|com)\b/],
 ['supabase-storage',/\b(?:provider|storageProvider)\s*(?:===?|!==?|:)\s*['"]supabase['"]/],
 ['vercel-runtime',/\bVERCEL_[A-Z_]+|\.vercel\.app\b/],
];
export async function auditCloudBase(root){
 const findings=[];
 async function walk(directory){
  let entries;try{entries=await readdir(directory,{withFileTypes:true});}
  catch(error){if(error.code==='ENOENT')return;throw error;}
  for(const entry of entries){
   const path=join(directory,entry.name);
   if(entry.isSymbolicLink()){findings.push({path:relative(root,path),category:'unexpected-symlink'});continue;}
   if(entry.isDirectory()){await walk(path);continue;}
   if(!/\.(?:[cm]?js|jsx|ts|tsx|json)$/.test(entry.name))continue;
   const lines=(await readFile(path,'utf8')).split('\n');
   lines.forEach((line,index)=>{for(const [category,pattern] of patterns)
    if(pattern.test(line))findings.push({path:relative(root,path),line:index+1,category});});
  }
 }
 for(const directory of ['src','server','api','cloudfunctions'])await walk(join(root,directory));
 // Retired deployment trees must not silently reappear. This does not check
 // historical markdown references: only executable/deployable source.
 for(const path of ['api','supabase','deploy/self-host','deploy/supabase',
   'server/server.mjs','server/account-gc-worker.mjs','server/cos-orphan-gc-worker.mjs',
   'server/sync-commit-relay.mjs','server/trusted-origins.mjs']){
   try{await lstat(join(root,path));findings.push({path,category:'retired-platform-path'});}
   catch(error){if(error.code!=='ENOENT')throw error;}
 }

 for(const filename of ['package.json','package-lock.json','vercel.json','.vercelignore']){
  try{
   await lstat(join(root,filename));
   if(filename.startsWith('vercel')||filename==='.vercelignore')findings.push({path:filename,category:'old-deployment-config'});
   else if((await readFile(join(root,filename),'utf8')).includes('@supabase/supabase-js'))
    findings.push({path:filename,category:'supabase-dependency'});
  }catch(error){if(error.code!=='ENOENT')throw error;}
 }
 return {scope:'runtime-and-package-config',ok:findings.length===0,findings};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 const root=resolve(process.argv[2]||join(dirname(fileURLToPath(import.meta.url)),'..'));
 // A partial verification checkout must not be reported as a full application audit.
 try{await readFile(join(root,'package.json'));await readFile(join(root,'src/app.js'));}
 catch{console.error('Full-repository audit NOT RUN: app.js and package.json are required.');process.exit(2);}
 const report=await auditCloudBase(root);console.log(JSON.stringify(report,null,2));
 if(!report.ok)process.exitCode=1;
}
