import {readFile,writeFile,mkdir,copyFile,lstat,rm,rename} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {dirname,resolve,join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';

export const FUNCTION_FILES=Object.freeze([
 'server/cloudbase-user.mjs','server/cos-tickets.mjs',
 ...['app','credentials','errors','postgres','embeddings','search','service'].map(name=>'server/cloudbase/'+name+'.mjs')
]);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function buildCloudBaseFunctions({root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),output=join(root,'.cloudbase-build')}={}){
 const target=resolve(output),temporary=target+'.'+randomUUID()+'.tmp';
 if(target===resolve(root)||target===resolve(root,'..'))throw Error('构建目录不能覆盖源码');
 const files=[['cloudfunctions/shiye-api/index.js','index.js'],
  ['cloudfunctions/shiye-api/package.json','package.json'],...FUNCTION_FILES.map(path=>[path,path])];
 const manifest={format:'shiye-cloudbase-function-bundle',version:1,function:'shiye-api',files:{}};
 try{
  const functionDir=join(temporary,'functions','shiye-api');
  for(const [source,destination] of files){
   const sourcePath=join(root,source),info=await lstat(sourcePath);
   if(!info.isFile()||info.isSymbolicLink())throw Error('部署来源必须是明确的普通文件：'+source);
   const bytes=await readFile(sourcePath),destinationPath=join(functionDir,destination);
   await mkdir(dirname(destinationPath),{recursive:true});await writeFile(destinationPath,bytes);
   manifest.files[destination]={bytes:bytes.length,sha256:sha(bytes)};
  }
  const config=JSON.parse(await readFile(join(root,'cloudbaserc.json'),'utf8'));
  if(config.functionRoot!=='.cloudbase-build/functions'||config.functions?.[0]?.name!=='shiye-api')throw Error('部署配置与构建产物不一致');
  await writeFile(join(temporary,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  await writeFile(join(temporary,'cloudbaserc.json'),JSON.stringify({...config,functionRoot:'functions'},null,2)+'\n');
  // Build never installs dependencies, reads credentials or calls a cloud API.
  await rm(target,{recursive:true,force:true});await rename(temporary,target);
  return {directory:target,manifest};
 }catch(error){await rm(temporary,{recursive:true,force:true});throw error;}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 const result=await buildCloudBaseFunctions();
 console.log(JSON.stringify({function:'shiye-api',directory:result.directory,files:Object.keys(result.manifest.files).length}));
}
