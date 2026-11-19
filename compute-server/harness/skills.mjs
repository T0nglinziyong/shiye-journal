import {readFile,readdir,realpath} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join,sep} from 'node:path';
import {createHash} from 'node:crypto';

export async function loadCreationSkills(root=fileURLToPath(new URL('../../creation-skills/',import.meta.url))){
  root=await realpath(root);
  const registry=new Map();
  for(const entry of await readdir(root,{withFileTypes:true})){
    if(!entry.isDirectory()||!entry.name.match(/^[a-z0-9]+(?:-[a-z0-9]+)*$/))continue;
    const path=await realpath(join(root,entry.name,'SKILL.md'));
    if(!path.startsWith(root+sep))throw Error('Skill 路径越界');
    const text=await readFile(path,'utf8');
    const match=text.match(/^---\nname: ([a-z0-9-]+)\ndescription: ([^\n]+)\n---\n([\s\S]+)$/);
    if(!match||match[1]!==entry.name)throw Error('Skill 元数据无效：'+entry.name);
    registry.set(entry.name,{name:entry.name,description:match[2],content:match[3].trim(),version:createHash('sha256').update(text).digest('hex')});
  }
  if(!registry.size)throw Error('创作 Skill 目录为空');
  return {catalog:()=>[...registry.values()].map(({content,...summary})=>summary),read(name){
    if(!registry.has(name))throw Error('未知创作 Skill：'+name);
    return structuredClone(registry.get(name));
  }};
}
