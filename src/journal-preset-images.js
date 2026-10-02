import {cloudEnabled,cloudClient} from './cloud-session.js';

const cache=new Map(),pending=new Map();let owner=null,active=0;const waiters=[];
async function readLane(task){if(active>=4)await new Promise(resolve=>waiters.push(resolve));active++;try{return await task();}finally{active--;waiters.shift()?.();}}
export function clearJournalPresetImages(){for(const url of cache.values())URL.revokeObjectURL(url);cache.clear();pending.clear();owner=null;}
export async function loadJournalPresetImage(number,{accountId,request=fetch}={}){
  if(!Number.isInteger(number)||number<1||number>70)throw Error('预设图编号无效');
  if(!cloudEnabled)return null;
  if(owner!==accountId){clearJournalPresetImages();owner=accountId;}
  if(cache.has(number))return cache.get(number);
  if(pending.has(number))return pending.get(number);
  const work=readLane(async()=>{
  const {data,error}=await cloudClient().auth.getSession();if(error||!data.session?.access_token)throw Error('请先登录后查看预设图片');
  const path=`journal-presets/source/${number}.jpg`;
  const ticket=await request('/api/cos',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},body:JSON.stringify({objects:[{path,method:'GET'}]}),signal:AbortSignal.timeout(15000)});
  if(!ticket.ok)throw Error('预设图片授权失败（'+ticket.status+'）');
  const signed=(await ticket.json()).tickets?.[0]?.url;if(!signed?.startsWith('https://'))throw Error('预设图片签名无效');
  const response=await request(signed,{signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error('预设图片读取失败（'+response.status+'）');
  const blob=await response.blob();if(blob.type&&!/^image\/jpeg/.test(blob.type))throw Error('预设图片类型无效');
  const url=URL.createObjectURL(blob);cache.set(number,url);return url;
  });pending.set(number,work);try{return await work;}finally{pending.delete(number);}
}

export async function publishJournalPresetImages(files,{onProgress=()=>{},request=fetch}={}){
  if(!cloudEnabled)throw Error('预设图库需要云端连接');
  const entries=[...files].map(file=>({file,number:Number(/^(\d+)-IMG_\d+\.jpe?g$/i.exec(file.name)?.[1])}));
  if(!entries.length||entries.some(entry=>!Number.isInteger(entry.number)||entry.number<1||entry.number>70||entry.file.size>20*1024*1024)||new Set(entries.map(entry=>entry.number)).size!==entries.length)throw Error('请选择来源图片 1-IMG_*.JPG 至 70-IMG_*.JPG，编号不能重复');
  const {data,error}=await cloudClient().auth.getSession();if(error||!data.session?.access_token)throw Error('请先登录后发布预设图');
  let completed=0;const failures=[];
  for(let start=0;start<entries.length;start+=3){
    await Promise.all(entries.slice(start,start+3).map(async({file,number})=>{
      try{
        const path=`journal-presets/source/${number}.jpg`;
        const ticket=await request('/api/cos',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},body:JSON.stringify({objects:[{path,method:'PUT',type:'image/jpeg'}]}),signal:AbortSignal.timeout(15000)});
        if(!ticket.ok)throw Error(`授权 ${ticket.status}`);
        const {url,headers}=(await ticket.json()).tickets?.[0]||{};
        if(!url?.startsWith('https://'))throw Error('签名无效');
        const uploaded=await request(url,{method:'PUT',headers,body:file,signal:AbortSignal.timeout(120000)});
        if(!uploaded.ok&&uploaded.status!==409&&uploaded.status!==412)throw Error(`上传 ${uploaded.status}`);
        completed++;
      }catch(error){failures.push(`${number}: ${error.message}`);}finally{onProgress(completed+failures.length,entries.length);}
    }));
  }
  if(failures.length)throw Error(`${completed}/${entries.length} 张已发布；失败：${failures.slice(0,6).join('、')}`);
  clearJournalPresetImages();return completed;
}

export async function journalPresetReference(number,options){
  const url=await loadJournalPresetImage(number,options);if(!url)return null;
  const blob=await(await fetch(url)).blob(),bytes=new Uint8Array(await blob.arrayBuffer());
  return {id:'source-'+number,title:'来源教程 '+number,bytes,url:await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);}),mimeType:'image/jpeg',extension:'jpg'};
}
