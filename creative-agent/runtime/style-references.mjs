import {readFile,realpath} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {createHash} from 'node:crypto';

// Approved examples stay in a private server directory, never in the public
// build. Missing or changed configured files fail explicitly, not silently.
export async function loadStyleReferences({root=process.env.SHIYE_CREATIVE_REFERENCES_DIR,styles=[]}={}){
  if(!root)return {parts:[],records:[]};
  const directory=await realpath(root),manifest=JSON.parse(await readFile(resolve(directory,'manifest.json'),'utf8'));
  if(manifest.version!==1||!Array.isArray(manifest.styles)||!Array.isArray(manifest.references)||manifest.references.length>8)throw Error('创作参考清单无效');
  if(!styles.some(style=>manifest.styles.includes(style)))return {parts:[],records:[]};
  const records=[],parts=[{type:'text',text:'以下是跨案例风格参考，只学习纸层、图文落点、色彩和点缀关系；不能将参考图当作可用素材，也不复制其中的文字或逐物位置。用户本次方向优先，按当前素材灵活组织。'}];
  let total=0;
  for(const row of manifest.references){
    if(!/^[a-zA-Z0-9_-]+\.png$/.test(row.file)||!/^sha256:[a-f0-9]{64}$/.test(row.sha256))throw Error('创作参考路径或指纹无效');
    const path=await realpath(resolve(directory,row.file));if(!path.startsWith(directory+sep))throw Error('创作参考超出私有目录');
    const bytes=await readFile(path);total+=bytes.length;
    if(bytes.length>4*1024*1024||total>20*1024*1024||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('创作参考格式或大小无效');
    if('sha256:'+createHash('sha256').update(bytes).digest('hex')!==row.sha256)throw Error('创作参考内容指纹不一致');
    records.push({file:row.file,sha256:row.sha256});
    parts.push({type:'image_url',image_url:{url:'data:image/png;base64,'+bytes.toString('base64')}});
  }
  return {parts:records.length?parts:[],records};
}
export function attachStyleReferences(state,references){
  if(state&&references.parts.length){
    state.messages.push({role:'user',content:references.parts});
    state.styleReferences=references.records;
  }
  return state;
}
