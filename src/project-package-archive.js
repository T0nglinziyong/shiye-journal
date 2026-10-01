import {unzipSync} from 'fflate';

const NATIVE='native.shiyeproject.json';
const EDITABLE='project.shiyeproject.json';
const ENTRY_LIMIT=128;
const TOTAL_DECLARED_LIMIT=48_000_000;

// Inspect every ZIP entry, including entries that are not decompressed. A
// package must have exactly one authoritative scene; previews never choose it.
export function readProjectPackageEntries(bytes){
  if(!(bytes instanceof Uint8Array)||bytes.byteLength>20_000_000)throw Error('可编辑作品包不能超过 20 MB');
  const seen=new Set();let count=0,total=0,native=false,editable=false;
  let files;
  try{
    files=unzipSync(bytes,{filter:entry=>{
      const name=entry.name;
      if(++count>ENTRY_LIMIT)throw Error('作品包文件数量超限');
      if(typeof name!=='string'||!name||name.includes('\\')||name.includes('\0')||name.startsWith('/')||/^[A-Za-z]:/.test(name)||name.split('/').some(part=>part==='..'||part==='.'||part===''))throw Error('作品包包含危险路径');
      if(seen.has(name))throw Error('作品包存在重复文件名');
      seen.add(name);
      total+=entry.originalSize;
      if(total>TOTAL_DECLARED_LIMIT)throw Error('作品包解压大小超限');
      if(name===NATIVE)native=true;
      if(name===EDITABLE)editable=true;
      if((name===NATIVE||name===EDITABLE)&&entry.originalSize>(name===NATIVE?8_000_000:2_000_000))throw Error('作品图层数据过大');
      return name===NATIVE||name===EDITABLE;
    }});
  }catch(error){throw Error('无法读取可编辑作品包：'+error.message);}
  if(native&&editable)throw Error('作品包包含两个场景入口，无法确定权威作品');
  if(!native&&!editable)throw Error('作品包缺少可编辑场景');
  for(const [name,data] of Object.entries(files))if(data.byteLength>(name===NATIVE?8_000_000:2_000_000))throw Error('作品图层实际解压数据过大');
  return {kind:native?'native':'editable',files};
}
