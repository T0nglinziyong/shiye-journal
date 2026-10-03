import {createCOSStore} from './cos-store.js';

// A read-only window: never put another user's records into the normal local
// library, IndexedDB, mutation queue, or editor state.
export async function openAdminView(client,currentUserID){
  const {data:accounts,error}=await client.from('shiye_accounts').select('user_id,username,created_at').order('username');
  if(error)throw error;
  const other=(accounts||[]).filter(account=>account.user_id!==currentUserID);
  const backdrop=document.createElement('div');backdrop.className='cloud-admin-backdrop';
  const panel=document.createElement('section');panel.className='cloud-admin-panel';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','其他用户资料（只读）');
  const heading=document.createElement('div');heading.className='cloud-admin-heading';
  const title=document.createElement('h2');title.textContent='其他用户资料';
  const close=document.createElement('button');close.type='button';close.className='btn mini';close.textContent='关闭';heading.append(title,close);
  const note=document.createElement('p');note.textContent='管理员只读查看。每位用户的资料仍独立存储，不能在这里修改或加入自己的素材库。';
  const picker=document.createElement('select');picker.setAttribute('aria-label','选择用户');
  picker.append(new Option(other.length?'选择用户':'暂无其他用户',''));
  for(const account of other)picker.append(new Option(account.username,account.user_id));
  const status=document.createElement('p');status.setAttribute('role','status');
  const list=document.createElement('div');list.className='cloud-admin-grid';
  panel.append(heading,note,picker,status,list);backdrop.append(panel);document.body.append(backdrop);
  const cos=createCOSStore({client:()=>client,enabled:true});
  let urls=[],observer,epoch=0;
  const release=()=>{observer?.disconnect();observer=null;for(const url of urls)URL.revokeObjectURL(url);urls=[];};
  const dispose=()=>{epoch++;release();backdrop.remove();document.removeEventListener('keydown',escape);};
  const escape=event=>{if(event.key==='Escape')dispose();};
  close.onclick=dispose;backdrop.onclick=event=>{if(event.target===backdrop)dispose();};document.addEventListener('keydown',escape);
  picker.onchange=async()=>{
    const current=++epoch;release();list.replaceChildren();
    if(!picker.value){status.textContent='请选择要查看的用户';return;}
    status.textContent='正在读取私人资料…';
    try{
      const rows=[];
      for(let start=0;start<20000;start+=500){
        const {data,error}=await client.from('shiye_records').select('store,id,record').eq('user_id',picker.value).order('store').order('id').range(start,start+499);
        if(error)throw error;if(current!==epoch)return;
        rows.push(...data);if(data.length<500)break;
      }
      const byStore=store=>rows.filter(row=>row.store===store);
      const assets=byStore('assets'),projects=byStore('projects'),blobs=new Map(byStore('blobs').map(row=>[row.id,row.record]));
      status.textContent=`${picker.selectedOptions[0].textContent} · ${assets.length} 件素材 · ${projects.length} 件作品 · ${byStore('series').length} 个系列（只读）`;
      const renderCard=(name,path,provider,extra,record)=>{
        const card=document.createElement('article');card.className='cloud-admin-card';
        const frame=document.createElement('div');frame.className='cloud-admin-image';
        const label=document.createElement('strong');label.textContent=name||'未命名';
        const detail=document.createElement('small');detail.textContent=extra||'';
        card.append(frame,label,detail);list.append(card);
        const metadata=document.createElement('details');metadata.className='cloud-admin-metadata';
        const summary=document.createElement('summary');summary.textContent='查看只读数据';
        const raw=document.createElement('pre');raw.textContent=JSON.stringify(record,null,2);
        metadata.append(summary,raw);card.append(metadata);
        if(path&&['cos','supabase'].includes(provider)){
          const img=document.createElement('img');img.alt='';frame.append(img);
          const load=async()=>{try{
            let blob;
            if(provider==='cos')blob=path.endsWith('-preview.webp')||path.endsWith('-preview360.webp')?await cos.download(path):await cos.preview(path);
            else {const {data,error}=await client.storage.from('shiye-private').download(path);if(error)throw error;blob=data;}
            if(current!==epoch)return;const url=URL.createObjectURL(blob);urls.push(url);img.src=url;
          }catch{if(current===epoch)frame.textContent='图片暂不可读取';}};
          card._loadAdminImage=load;if(observer)observer.observe(card);else void load();
        }else frame.textContent='无可读封面';
      };
      if(typeof IntersectionObserver!=='undefined')observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){observer.unobserve(entry.target);void entry.target._loadAdminImage?.();}},{root:panel,rootMargin:'160px'});
      const addHeading=text=>{const h=document.createElement('h3');h.textContent=text;h.className='cloud-admin-section';list.append(h);};
      addHeading('素材');for(const {record:a} of assets){const blob=blobs.get(a.blobId),path=blob?.thumbnailPath||blob?.storagePath;renderCard(a.title,path,blob?.storageProvider,a.kind||'',a);}
      addHeading('作品');for(const {record:p} of projects){const draft=p.drafts?.find(d=>d.id===p.activeDraftID)||p.drafts?.[0],cover=draft?.coverImageID||'',parsed=(()=>{const match=/^project-cover:(cos|supabase):(.+)$/.exec(cover);return match?{provider:match[1],path:match[2]}:null;})();renderCard(p.title,parsed?.path,parsed?.provider,p.isDraft?'草稿':'作品',p);}
      for(const [store,title] of [['series','系列'],['trash','最近删除'],['meta','设置与搭配'],['blobs','图片文件索引']]){
        const entries=byStore(store);if(!entries.length)continue;
        addHeading(title);for(const {id,record} of entries)renderCard(record.title||record.name||id,null,null,store==='blobs'?'COS 私人文件':'只读记录',record);
      }
      if(!rows.length)list.textContent='此账号还没有资料。';
    }catch(error){if(current===epoch)status.textContent='读取失败：'+(error.message||'请检查网络');}
  };
  status.textContent='请选择要查看的用户';picker.focus();
}
