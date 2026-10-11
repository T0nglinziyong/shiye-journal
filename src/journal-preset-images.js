import {cloudEnabled,cloudClient} from './cloud-session.js';
import {validateJournalPanel} from './journal-source-panels.js';

const cache=new Map(),pending=new Map(),panelCache=new Map(),panelPending=new Map();let owner=null,epoch=0,active=0;const waiters=[];
async function readLane(task){if(active>=4)await new Promise(resolve=>waiters.push(resolve));active++;try{return await task();}finally{active--;waiters.shift()?.();}}
export function clearJournalPresetImages(){epoch++;for(const url of [...cache.values(),...panelCache.values()])URL.revokeObjectURL(url);cache.clear();pending.clear();panelCache.clear();panelPending.clear();owner=null;}
export async function loadJournalPresetImage(number,{accountId,request=fetch}={}){
  if(!Number.isInteger(number)||number<1||number>70)throw Error('预设图编号无效');
  if(!cloudEnabled)return null;
  if(accountId&&owner!==accountId){clearJournalPresetImages();owner=accountId;}
  if(cache.has(number))return cache.get(number);
  if(pending.has(number))return pending.get(number);
  const started=epoch;
  const work=readLane(async()=>{
  const {data,error}=await cloudClient().auth.getSession();if(error||!data.session?.access_token)throw Error('请先登录后查看预设图片');
  const path=`journal-presets/source/${number}.jpg`;
  const ticket=await request('/api/cos',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},body:JSON.stringify({objects:[{path,method:'GET'}]}),signal:AbortSignal.timeout(15000)});
  if(!ticket.ok)throw Error('预设图片授权失败（'+ticket.status+'）');
  const signed=(await ticket.json()).tickets?.[0]?.url;if(!signed?.startsWith('https://'))throw Error('预设图片签名无效');
  const response=await request(signed,{signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error('预设图片读取失败（'+response.status+'）');
  const blob=await response.blob();if(blob.type&&!/^image\/jpeg/.test(blob.type))throw Error('预设图片类型无效');
  const url=URL.createObjectURL(blob);if(started!==epoch){URL.revokeObjectURL(url);throw Error('账号已切换，停止读取旧账号图片');}cache.set(number,url);return url;
  });pending.set(number,work);try{return await work;}finally{if(pending.get(number)===work)pending.delete(number);}
}

export function journalPanelPixels(panel,width,height){
  const {rect}=validateJournalPanel(panel);
  return {x:Math.round(rect[0]*width),y:Math.round(rect[1]*height),width:Math.round(rect[2]*width),height:Math.round(rect[3]*height)};
}

// Keep the original private JPEG unchanged. Derive a centered, straight panel
// locally so gallery, detail, and AI handoff always see the same exact content.
export async function loadJournalPresetPanel(panel,options={}){
  validateJournalPanel(panel);
  if(options.accountId&&owner!==options.accountId){clearJournalPresetImages();owner=options.accountId;}
  const key=JSON.stringify(panel);
  if(panelCache.has(key))return panelCache.get(key);
  if(panelPending.has(key))return panelPending.get(key);
  const started=epoch;
  const work=(async()=>{
    const source=await loadJournalPresetImage(panel.number,options);if(!source)return null;
    const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('预设图片无法解码'));img.src=source;});
    const rect=journalPanelPixels(panel,image.naturalWidth,image.naturalHeight);
    const angle=(panel.rotate||0)*Math.PI/180;
    const rotatedWidth=Math.abs(rect.width*Math.cos(angle))+Math.abs(rect.height*Math.sin(angle));
    const rotatedHeight=Math.abs(rect.height*Math.cos(angle))+Math.abs(rect.width*Math.sin(angle));
    const margin=Math.max(12,Math.round(Math.min(rect.width,rect.height)*.035));
    const canvas=document.createElement('canvas');canvas.width=Math.ceil(rotatedWidth+margin*2);canvas.height=Math.ceil(rotatedHeight+margin*2);
    const context=canvas.getContext('2d');if(!context)throw Error('无法处理预设图片');
    context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);
    context.translate(canvas.width/2,canvas.height/2);context.rotate(angle);
    context.drawImage(image,rect.x,rect.y,rect.width,rect.height,-rect.width/2,-rect.height/2,rect.width,rect.height);
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(result=>result?resolve(result):reject(Error('预设画面裁切失败')),'image/jpeg',.92));
    const url=URL.createObjectURL(blob);if(started!==epoch){URL.revokeObjectURL(url);throw Error('账号已切换，停止读取旧账号画面');}panelCache.set(key,url);return url;
  })();panelPending.set(key,work);try{return await work;}finally{if(panelPending.get(key)===work)panelPending.delete(key);}
}

export async function journalPresetReference(panel,options){
  const region=typeof panel==='number'?{number:panel,rect:[0,0,1,1],rotate:0}:panel;
  const url=await loadJournalPresetPanel(region,options);if(!url)return null;
  const blob=await(await fetch(url)).blob(),bytes=new Uint8Array(await blob.arrayBuffer());
  return {id:'source-'+region.number,title:'来源教程 '+region.number,bytes,url:options?.includeDataURL===false?undefined:await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);}),mimeType:'image/jpeg',extension:'jpg'};
}
