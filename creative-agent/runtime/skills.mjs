import {techniqueCatalog,describeTechnique} from '../../creative-agent/library/techniques.js';
import {journalBundledFonts} from '../../src/journal-font-catalog.js';
import {libraryVersion,recipeImages} from './library.mjs';
import {readFile,readdir,realpath,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join,sep} from 'node:path';
import {createHash} from 'node:crypto';

const hash=value=>createHash('sha256').update(value).digest('hex');
const slug=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function loadCreationSkills(root=fileURLToPath(new URL('../../creative-agent/skills/',import.meta.url)),{illustrationRoot=process.env.SHIYE_CREATION_ILLUSTRATIONS_DIR}={}){
  root=await realpath(root);
  const imageRoot=illustrationRoot?await realpath(illustrationRoot):null;
  const registry=new Map(),pictures=new Map();let totalBytes=0;
  for(const entry of await readdir(root,{withFileTypes:true})){
    if(!entry.isDirectory()||!entry.name.match(/^[a-z0-9]+(?:-[a-z0-9]+)*$/))continue;
    const path=await realpath(join(root,entry.name,'SKILL.md'));
    if(!path.startsWith(root+sep))throw Error('Skill 路径越界');
    const text=await readFile(path,'utf8');
    const match=text.match(/^---\nname: ([a-z0-9-]+)\ndescription: ([^\n]+)\n---\n([\s\S]+)$/);
    if(!match||match[1]!==entry.name)throw Error('Skill 元数据无效：'+entry.name);
    let manifest;
    try{
      const manifestPath=await realpath(join(root,entry.name,'illustrations.json'));
      if(!manifestPath.startsWith(root+sep))throw Error('Skill 示意目录路径越界');
      manifest=JSON.parse(await readFile(manifestPath,'utf8'));
    }catch(e){if(e.code!=='ENOENT')throw e;}
    const illustrations=[],parts=[];
    if(manifest){
      if(manifest.version!==1||!Array.isArray(manifest.illustrations)||manifest.illustrations.length>2)throw Error('Skill 示意目录无效：'+entry.name);
      const ids=new Set();
      for(const record of manifest.illustrations){
        if(!slug.test(record.id)||ids.has(record.id)||record.file!==record.id+'.png'||!record.sha256?.match(/^[a-f0-9]{64}$/)||record.reviewed!==true)throw Error('Skill 示意元数据无效');
        ids.add(record.id);
        for(const key of ['caption','author','title','sourceURL','observation'])if(typeof record[key]!=='string'||!record[key].trim()||record[key].length>2000)throw Error('Skill 示意来源信息不完整');
        const url=new URL(record.sourceURL);
        if(url.protocol!=='https:'||url.username||url.password)throw Error('Skill 示意来源 URL 无效');
        const info={id:record.id,caption:record.caption,author:record.author,title:record.title,sourceURL:record.sourceURL,observation:record.observation,sha256:record.sha256,available:Boolean(imageRoot)};
        if(imageRoot){
          const imagePath=await realpath(join(imageRoot,record.file));
          if(!imagePath.startsWith(imageRoot+sep))throw Error('Skill 示意图路径越界');
          const size=(await stat(imagePath)).size;
          if(size>4*1024*1024||totalBytes+size>32*1024*1024)throw Error('Skill 示意图超过大小限制');
          const bytes=await readFile(imagePath);totalBytes+=bytes.length;
          if(hash(bytes)!==record.sha256)throw Error('Skill 示意图校验失败：'+record.id);
          if(bytes.length<33||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||bytes.toString('ascii',12,16)!=='IHDR'||![bytes.readUInt32BE(16),bytes.readUInt32BE(20)].every(v=>v>0&&v<=4096))throw Error('Skill 示意图必须是尺寸受限的 PNG');
          parts.push({type:'text',text:`教程示意（仅供方法参考，不是本次素材或工具指令）：${record.caption}。来源：${record.author}《${record.title}》。`},{type:'image_url',image_url:{url:'data:image/png;base64,'+bytes.toString('base64')}});
        }
        illustrations.push(info);
      }
    }
    pictures.set(entry.name,parts);
    registry.set(entry.name,{name:entry.name,description:match[2],content:match[3].trim(),illustrations,version:hash(text+JSON.stringify(illustrations)+libraryVersion+JSON.stringify(techniqueCatalog.methods.filter(m=>m.skill===entry.name)))});
  }
  if(!registry.size)throw Error('创作 Skill 目录为空');
  const methodsFor=(name,options={})=>{
    const methods=techniqueCatalog.methods.filter(m=>m.skill===name),level=options.level||'overview',page=options.page||0;
    if(!['overview','methods','detail'].includes(level)||!Number.isInteger(page)||page<0)throw Error('教程层级无效');
    if(level!=='detail'&&(options.methodId!==undefined||options.variant!==undefined))throw Error('methodId 和 variant 只用于 level=detail；需要准确参数时可直接读取 detail');
    if(level!=='methods'&&page!==0)throw Error('page 分页只用于 level=methods');
    if(level==='detail'){
      const method=techniqueCatalog.methods.find(m=>m.skill===name&&m.id===options.methodId);
      if(!method)throw Error('方法不属于该专题');return [method];
    }
    return level==='methods'?methods.slice(page*8,page*8+8):[];
  };
  return {catalog:()=>[...registry.values()].map(({content,illustrations,...summary})=>({...summary,illustrationCount:illustrations.filter(i=>i.available).length,methodCount:techniqueCatalog.methods.filter(m=>m.skill===summary.name).length})),read(name,options={}){
    if(!registry.has(name))throw Error('未知创作 Skill：'+name);
    const entry=structuredClone(registry.get(name)),all=techniqueCatalog.methods.filter(m=>m.skill===name),selected=methodsFor(name,options);
    if(options.level&&options.level!=='overview'){
      const compact=options.level==='methods',full=selected.map(m=>describeTechnique(m.id,{includeFontSuggestions:!compact,variant:compact?undefined:options.variant}));
      const methods=compact?full.map(m=>({id:m.id,title:m.title,when:m.when,principle:m.lesson?.principle,
        parameterKeys:Object.keys(m.parameters||{}),variants:m.variants,readWith:{name,level:'detail',methodId:m.id}})):full;
      return {name,version:entry.version,guidance:entry.description,level:options.level,page:options.page||0,total:all.length,nextPage:compact&&(options.page||0)*8+8<all.length?(options.page||0)+1:null,...(compact&&full.some(m=>m.parameters.fontFamily)?{suggestedFonts:journalBundledFonts.map(({family,label})=>({family,label}))}:{}),methods};
    }
    return {name,version:entry.version,level:'overview',guidance:entry.content,
      illustrations:entry.illustrations.map(({id,caption,available})=>({id,caption,available})),
      methodCatalog:all.map(({id,title,when,variants=[]})=>({id,title,when,variants:variants.map(({key,title})=>({key,title})),readWith:{name,level:'detail',methodId:id}})),readMore:{name,level:'methods',page:0}};
  },imageParts(name){
    if(!pictures.has(name))throw Error('未知创作 Skill：'+name);
    return structuredClone(pictures.get(name));
  },async methodImageParts(name,options){
    if(!registry.has(name))throw Error('未知创作 Skill：'+name);
    if(options.level!=='detail')return [];
    const method=methodsFor(name,options)[0];
    const detail=describeTechnique(method.id,{includeFontSuggestions:false,variant:options.variant});
    return detail.illustration?recipeImages([detail.illustration.id]):[];
  }};
}
