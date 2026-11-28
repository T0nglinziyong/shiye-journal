import {cloudEnabled,cloudClient,cloudStorage} from './cloud-session.js';
import {validateJournalPanel} from './journal-source-panels.js';
import {privateCache} from './private-cache.js';

const cache=new Map(),pending=new Map(),panelCache=new Map(),panelPending=new Map(),caseCache=new Map(),casePending=new Map();let owner=null,epoch=0,active=0;const waiters=[];
async function readLane(task){if(active>=4)await new Promise(resolve=>waiters.push(resolve));active++;try{return await task();}finally{active--;waiters.shift()?.();}}
export function clearJournalPresetImages(){epoch++;for(const url of [...cache.values(),...panelCache.values(),...caseCache.values()])URL.revokeObjectURL(url);cache.clear();pending.clear();panelCache.clear();panelPending.clear();caseCache.clear();casePending.clear();owner=null;}
export async function loadJournalPresetImage(number,{accountId}={}){
  if(!Number.isInteger(number)||number<1||number>70)throw Error('预设图编号无效');
  if(!cloudEnabled)return null;
  if(accountId&&owner!==accountId){clearJournalPresetImages();owner=accountId;}
  if(cache.has(number))return cache.get(number);
  if(pending.has(number))return pending.get(number);
  const started=epoch;
  const work=readLane(async()=>{
  const {data,error}=await cloudClient().auth.getSession();if(error||!data.session?.access_token)throw Error('请先登录后查看预设图片');
  const path=`journal-presets/source/${number}.jpg`;
  const cacheKey='journal-preset:'+path;
  const saved=accountId?await privateCache.get(accountId,cacheKey).catch(()=>null):null;
  let blob=saved instanceof Blob&&saved.size&&(!saved.type||/^image\/jpeg/.test(saved.type))?saved:null;
  if(!blob){
    const result=await cloudStorage().from('shiye-presets').download(path,undefined,{signal:AbortSignal.timeout(30000)});
    if(result.error)throw Error('预设图片读取失败：'+result.error.message);
    blob=result.data;
  }
  if(!(blob instanceof Blob)||!blob.size||blob.type&&!/^image\/jpeg/.test(blob.type))throw Error('预设图片类型或内容无效');
  if(blob!==saved&&accountId)void privateCache.put(accountId,cacheKey,blob).catch(()=>{});
  const url=URL.createObjectURL(blob);if(started!==epoch){URL.revokeObjectURL(url);throw Error('账号已切换，停止读取旧账号图片');}cache.set(number,url);return url;
  });pending.set(number,work);try{return await work;}finally{if(pending.get(number)===work)pending.delete(number);}
}

export async function loadJournalTemplateCase(path,{accountId}={}){
  if(!/^journal-presets\/template-cases\/v1\/case-\d{2}\.jpg$/.test(path))throw Error('模板案例路径无效');
  if(!cloudEnabled)return null;
  if(accountId&&owner!==accountId){clearJournalPresetImages();owner=accountId;}
  if(caseCache.has(path))return caseCache.get(path);
  if(casePending.has(path))return casePending.get(path);
  const started=epoch;
  const work=readLane(async()=>{
    const {data,error}=await cloudClient().auth.getSession();
    if(error||!data.session?.access_token)throw Error('请先登录后查看模板案例');
    const cacheKey='journal-template-case:'+path;
    const saved=accountId?await privateCache.get(accountId,cacheKey).catch(()=>null):null;
    let blob=saved instanceof Blob&&saved.size&&(!saved.type||/^image\/jpeg/.test(saved.type))?saved:null;
    if(!blob){
      const result=await cloudStorage().from('shiye-presets').download(path,undefined,{signal:AbortSignal.timeout(30000)});
      if(result.error)throw Error('模板案例读取失败：'+result.error.message);
      blob=result.data;
    }
    if(!(blob instanceof Blob)||!blob.size||blob.type&&!/^image\/jpeg/.test(blob.type))throw Error('模板案例图片类型或内容无效');
    if(blob!==saved&&accountId)void privateCache.put(accountId,cacheKey,blob).catch(()=>{});
    const url=URL.createObjectURL(blob);
    if(started!==epoch){URL.revokeObjectURL(url);throw Error('账号已切换，停止读取旧账号图片');}
    caseCache.set(path,url);return url;
  });
  casePending.set(path,work);
  try{return await work;}finally{if(casePending.get(path)===work)casePending.delete(path);}
}

export function journalPanelPixels(panel,width,height){
  const {rect}=validateJournalPanel(panel);
  return {x:Math.round(rect[0]*width),y:Math.round(rect[1]*height),width:Math.round(rect[2]*width),height:Math.round(rect[3]*height)};
}

export function pageContentBounds(canvas){
  const probe=document.createElement('canvas');probe.width=64;probe.height=64;
  const context=probe.getContext('2d',{willReadFrequently:true});
  context.drawImage(canvas,0,0,64,64);
  const data=context.getImageData(0,0,64,64).data,light=new Float32Array(4096),edge=[];
  for(let y=0;y<64;y++)for(let x=0;x<64;x++){
    const i=y*64+x,p=i*4;light[i]=.2126*data[p]+.7152*data[p+1]+.0722*data[p+2];
    if(x<2||y<2||x>61||y>61)edge.push(light[i]);
  }
  edge.sort((a,b)=>a-b);
  const background=edge[Math.floor(edge.length/2)];
  if(edge[Math.floor(edge.length*.85)]-edge[Math.floor(edge.length*.15)]>38)return null;
  let best=null;
  for(const sign of [1,-1]){
    const seen=new Uint8Array(4096);
    for(let i=0;i<4096;i++){
      if(seen[i]||sign*(light[i]-background)<35)continue;
      const queue=[i];seen[i]=1;let count=0,minX=63,minY=63,maxX=0,maxY=0;
      for(let head=0;head<queue.length;head++){
        const cell=queue[head],x=cell%64,y=Math.floor(cell/64);count++;
        minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
        for(const next of [x>0?cell-1:-1,x<63?cell+1:-1,y>0?cell-64:-1,y<63?cell+64:-1])
          if(next>=0&&!seen[next]&&sign*(light[next]-background)>=35){seen[next]=1;queue.push(next);}
      }
      const width=maxX-minX+1,height=maxY-minY+1,fill=count/(width*height);
      if(count>700&&fill>.48&&width<62&&height<62&&(!best||count>best.count))best={minX,minY,maxX,maxY,count};
    }
  }
  if(!best)return null;
  const x=Math.max(0,(best.minX-1)/64),y=Math.max(0,(best.minY-1)/64);
  return {x,y,width:Math.min(1-x,(best.maxX-best.minX+3)/64),height:Math.min(1-y,(best.maxY-best.minY+3)/64)};
}

// Keep the original private JPEG unchanged. Derive a centered, straight panel
// locally so gallery, detail, and AI handoff always see the same exact content.
export async function loadJournalPresetPanel(panel,options={}){
  validateJournalPanel(panel);
  if(options.accountId&&owner!==options.accountId){clearJournalPresetImages();owner=options.accountId;}
  const edge=Number(options.edge)>0?Number(options.edge):null;
  const key=JSON.stringify([panel,edge]);
  if(panelCache.has(key))return panelCache.get(key);
  if(panelPending.has(key))return panelPending.get(key);
  const started=epoch;
  const work=(async()=>{
    const source=await loadJournalPresetImage(panel.number,options);if(!source)return null;
    const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('预设图片无法解码'));img.src=source;});
    const rect=journalPanelPixels(panel,image.naturalWidth,image.naturalHeight);
    if(panel.rect.every((value,index)=>value===[0,0,1,1][index])){
      const probe=document.createElement('canvas');probe.width=256;probe.height=256;
      probe.getContext('2d').drawImage(image,0,0,probe.width,probe.height);
      const bounds=pageContentBounds(probe);
      if(bounds){rect.x+=Math.round(rect.width*bounds.x);rect.y+=Math.round(rect.height*bounds.y);
        rect.width=Math.round(rect.width*bounds.width);rect.height=Math.round(rect.height*bounds.height);}
    }
    const angle=(panel.rotate||0)*Math.PI/180;
    const rotatedWidth=Math.abs(rect.width*Math.cos(angle))+Math.abs(rect.height*Math.sin(angle));
    const rotatedHeight=Math.abs(rect.height*Math.cos(angle))+Math.abs(rect.width*Math.sin(angle));
    const margin=Math.max(12,Math.round(Math.min(rect.width,rect.height)*.035));
    const naturalWidth=Math.ceil(rotatedWidth+margin*2),naturalHeight=Math.ceil(rotatedHeight+margin*2),
      scale=edge?Math.min(1,edge/Math.max(naturalWidth,naturalHeight)):1;
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.ceil(naturalWidth*scale));canvas.height=Math.max(1,Math.ceil(naturalHeight*scale));
    const context=canvas.getContext('2d');if(!context)throw Error('无法处理预设图片');
    context.scale(scale,scale);context.fillStyle='#fff';context.fillRect(0,0,naturalWidth,naturalHeight);
    context.translate(naturalWidth/2,naturalHeight/2);context.rotate(angle);
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
