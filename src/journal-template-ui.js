import {reconcileKeyedChildren} from './ui-keyed-dom.js';
import {presetJournalTemplates,normalizeUserTemplate,templateIndexText,USER_TEMPLATE_PREFIX} from './journal-template-catalog.js';
import {loadJournalPresetPanel} from './journal-preset-images.js';
import {journalTemplatePanel} from './journal-source-panels.js';

const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[char]));
const split=value=>[...new Set(String(value||'').split(/[,，、\n]/).map(part=>part.trim()).filter(Boolean))];
const urls=new Map();let urlOwner=null;
export function clearJournalTemplateImages(){for(const url of urls.values())URL.revokeObjectURL(url);urls.clear();urlOwner=null;}
async function imageURL(db,owner,id,edge=480){
  if(!id)return null;
  if(urlOwner!==owner){clearJournalTemplateImages();urlOwner=owner;}
  const key=id+':'+(edge||'original');
  if(urls.has(key))return urls.get(key);
  const blob=edge?await db.previewBlob(id,edge):(await db.get('blobs',id))?.data;
  if(!(blob instanceof Blob)||!blob.size)return null;
  const url=URL.createObjectURL(blob);urls.set(key,url);return url;
}
export function validateJournalImage(file){
  if(!file)return null;
  if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('模板和案例请选择 PNG、JPEG 或 WebP 图片');
  if(!file.size||file.size>20*1024*1024)throw Error('单张模板或案例图片须在 20 MB 以内');
  return file;
}
export async function saveJournalUserTemplate(db,input,{templateImage,caseImage}={}){
  validateJournalImage(templateImage);validateJournalImage(caseImage);
  if(!templateImage)throw Error('请先选择模板图片');
  const id=USER_TEMPLATE_PREFIX+crypto.randomUUID();
  const record=normalizeUserTemplate({...input,id,templateBlobId:crypto.randomUUID(),exampleBlobId:caseImage?crypto.randomUUID():null});
  await db.transaction(['meta','blobs'],tx=>{
    tx.objectStore('blobs').put({id:record.templateBlobId,data:templateImage});
    if(caseImage)tx.objectStore('blobs').put({id:record.exampleBlobId,data:caseImage});
    tx.objectStore('meta').put(record);
  });
  return record;
}
export function journalTemplateRecords(meta){return (meta||[]).filter(row=>String(row?.id||'').startsWith(USER_TEMPLATE_PREFIX)).flatMap(row=>{try{return [normalizeUserTemplate(row)];}catch{return [];}});}

export function mountJournalTemplateGallery(c,viewState){
  const {view,state,db,render,toast}=c,grid=view.querySelector('.works-grid'),filters=view.querySelector('.filters');
  if(!grid)return;
  grid.classList.add('journal-template-grid');
  const catalog=[...presetJournalTemplates(),...(state.userTemplates||[])];
  const search=filters?.querySelector('#work-search'),type=filters?.querySelector('#work-kind'),status=filters?.querySelector('#work-status'),sort=filters?.querySelector('#work-sort'),count=filters?.querySelector('span');
  if(filters){
    filters.dataset.templateFilters='true';
    search.placeholder='搜索模板名称或标签';search.setAttribute('aria-label','搜索模板');
    type.innerHTML='<option value="all">全部类型</option><option value="preset">预设模板</option><option value="user">我的模板</option>';
    status.innerHTML='<option value="all">全部状态</option><option value="with-case">有对应案例</option><option value="without-case">暂无案例</option>';
    sort.innerHTML='<option value="default-desc">默认顺序 · 降序</option><option value="default-asc">默认顺序 · 升序</option><option value="name-asc">名称 · 升序</option><option value="name-desc">名称 · 降序</option>';
  }
  const saved=viewState.templateFilters||{query:'',type:'all',status:'all',sort:'default-asc'};
  if(search)search.value=saved.query;if(type)type.value=saved.type;if(status)status.value=saved.status;if(sort)sort.value=saved.sort;
  let imageObserver;
  const matches=item=>{
    const q=(search?.value||'').trim().toLocaleLowerCase(),typeValue=type?.value||'all',statusValue=status?.value||'all';
    const typeOK=typeValue==='all'||typeValue==='preset'&&item.origin==='preset'||typeValue==='user'&&item.origin!=='preset';
    const hasCase=!!(item.exampleBlobId||item.exampleSourceNumbers?.length);
    const statusOK=statusValue==='all'||statusValue==='with-case'&&hasCase||statusValue==='without-case'&&!hasCase;
    return typeOK&&statusOK&&(!q||templateIndexText(item).includes(q));
  };
  const ordered=items=>items.slice().sort((a,b)=>{
    const mode=sort?.value||'default-asc';
    if(mode.startsWith('name')){const v=a.title.localeCompare(b.title,'zh-CN');return mode.endsWith('asc')?v:-v;}
    const ai=catalog.indexOf(a),bi=catalog.indexOf(b),v=ai-bi;return mode.endsWith('desc')?-v:v;
  });
  const loadVisual=(host,item,side='template')=>{
    const blobId=side==='case'?item.exampleBlobId:item.templateBlobId,sourcePanel=journalTemplatePanel(item,side);
    if(!blobId&&!sourcePanel)return;
    const card=!host.classList.contains('journal-template-detail-image');
    void (blobId?imageURL(db,state.accountId,blobId,card?480:null):
      loadJournalPresetPanel(sourcePanel,{accountId:state.accountId,edge:card?480:null})).then(url=>{
      if(!url)throw Error('图片暂不可用');
      if(!host.isConnected)return;host.replaceChildren();const image=document.createElement('img');image.src=url;image.alt=item.title+(side==='case'?' 真实案例':' 抽象模板');host.append(image);
    }).catch(error=>{
      if(!host.isConnected)return;
      const fallback=document.createElement('div');fallback.className='journal-template-fallback';
      const title=document.createElement('strong');title.textContent=item.title;
      const description=document.createElement('p');description.textContent=item.structure;
      const status=document.createElement('small');status.textContent=host.classList.contains('journal-template-detail-image')?`${error.message||'图片暂不可用'} · 可重试`:'图片暂不可用 · 点击查看结构';
      fallback.append(title,description,status);
      if(host.classList.contains('journal-template-detail-image')){
        const retry=document.createElement('button');retry.type='button';retry.className='btn mini';retry.textContent='重新载入图片';
        retry.onclick=()=>{host.textContent='正在重新载入图片…';loadVisual(host,item,side);};fallback.append(retry);
      }
      host.replaceChildren(fallback);
    });
  };
  const display=()=>{
    imageObserver?.disconnect();imageObserver=null;
    const selected=catalog.find(item=>item.id===viewState.templateID);
    if(selected){
      grid.classList.add('journal-template-detail');
      const caseAvailable=!!(selected.exampleBlobId||selected.exampleSourceNumbers?.length),showCase=viewState.templateSide==='case'&&caseAvailable;
      const visual=showCase?'<span class="journal-template-loading">载入对应案例…</span>':(selected.templateBlobId?'':'<div class="journal-template-outline">'+escapeHTML(selected.title)+'</div>');
      grid.innerHTML=`<article class="journal-template-detail-card"><div class="journal-template-detail-head"><button type="button" class="btn" data-template-back>← 返回模板</button><h2>${escapeHTML(selected.title)}</h2></div><div class="journal-template-switch"><button type="button" class="btn ${showCase?'':'primary'}" data-template-side="template">抽象模板</button><button type="button" class="btn ${showCase?'primary':''}" data-template-side="case" ${caseAvailable?'':'disabled'}>真实案例</button></div><div class="journal-template-detail-image">${visual}</div><p>${escapeHTML(selected.structure)}</p><div class="journal-template-tags">${(selected.tags||[]).map(tag=>`<span class="chip">${escapeHTML(tag)}</span>`).join('')}</div></article>`;
      if(count)count.textContent=catalog.length+' 个模板';
      grid.querySelector('[data-template-back]').onclick=()=>{viewState.templateID=null;display();};
      grid.querySelectorAll('[data-template-side]').forEach(button=>button.onclick=()=>{viewState.templateSide=button.dataset.templateSide;display();});
      const host=grid.querySelector('.journal-template-detail-image');loadVisual(host,selected,showCase?'case':'template');
      return;
    }
    grid.classList.remove('journal-template-detail');
    const found=ordered(catalog.filter(matches));if(count)count.textContent=`${found.length} / ${catalog.length} 个模板`;
    const importCard='<button type="button" class="card work-entry journal-template-import-card" data-template-import><div class="card-image">＋</div><div class="card-body"><h3>导入模板与案例</h3><p>添加自己的模板图片</p></div></button>';
    const cards=found.map(item=>`<button type="button" class="card journal-template-card" data-template-id="${escapeHTML(item.id)}" data-template-signature="${escapeHTML(JSON.stringify([item.title,item.origin,item.structure,item.tags,item.templateBlobId,item.exampleBlobId,item.exampleSourceNumbers]))}"><div class="card-image">${item.templateBlobId?'<span class="journal-template-loading">载入模板…</span>':'<div class="journal-template-outline">'+escapeHTML(item.title)+'</div>'}</div><div class="card-body"><h3>${escapeHTML(item.title)}</h3><p>${item.origin==='preset'?'预设模板':'我的模板'} · ${item.exampleBlobId||item.exampleSourceNumbers?.length?'有对应案例':'暂无案例'}</p><div class="journal-template-tags">${item.tags.slice(0,3).map(tag=>`<span class="chip">${escapeHTML(tag)}</span>`).join('')}</div></div></button>`).join('');
    // Filter without discarding loaded preview images or re-registering their
    // decoders. Stable card IDs and semantic signatures determine replacements.
    const desired=document.createElement('div');
    desired.innerHTML=importCard+(cards||'<p class="empty">没有匹配的模板，试试其他标签。</p>');
    reconcileKeyedChildren(grid,desired,el=>el.dataset.templateId||
      (el.hasAttribute('data-template-import')?'__import__':'__empty__'),{
      update(current,fresh,id){
        if(id==='__import__')return true;
        return id!=='__empty__'&&
          current.dataset.templateSignature===fresh.dataset.templateSignature;
      }
    });
    grid.querySelector('[data-template-import]').onclick=()=>openImport(c,async record=>{state.userTemplates=[...(state.userTemplates||[]),record];viewState.templateID=record.id;viewState.templateSide='template';render();toast('模板已在本机暂存，正在后台同步');});
    grid.querySelectorAll('[data-template-id]').forEach(card=>card.onclick=()=>{viewState.templateID=card.dataset.templateId;viewState.templateSide='template';display();});
    const byID=new Map(found.map(item=>[item.id,item]));
    const loadCard=card=>{const item=byID.get(card.dataset.templateId);if(!item)return;const host=card.querySelector('.card-image');if(host?.querySelector('img,.journal-template-fallback'))return;if(item.templateBlobId||journalTemplatePanel(item,'template'))loadVisual(host,item,'template');};
    if(typeof IntersectionObserver==='function'){
      const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){observer.unobserve(entry.target);loadCard(entry.target);}},{rootMargin:'300px'});
      imageObserver=observer;grid.querySelectorAll('[data-template-id]').forEach(card=>observer.observe(card));
    }else grid.querySelectorAll('[data-template-id]').forEach(loadCard);
  };
  const change=()=>{viewState.templateFilters={query:search?.value||'',type:type?.value||'all',status:status?.value||'all',sort:sort?.value||'default-asc'};viewState.templateID=null;display();};
  if(search)search.oninput=change;if(type)type.onchange=change;if(status)status.onchange=change;if(sort)sort.onchange=change;
  display();
}

function openImport(c,onSaved){
  const {body,modal,db,toast}=c;
  body.innerHTML='<div class="dialog-head"><button type="button" class="btn" data-template-import-back>‹ 返回模板</button><h2>导入模板与案例</h2></div><div class="stack journal-template-import"><label>模板名称<input name="title" maxlength="80" required placeholder="例如：双列时间轴"></label><label>结构说明<textarea name="structure" required placeholder="简述主图、文字、装饰与阅读顺序"></textarea></label><label>检索标签（逗号分隔）<input name="tags" required placeholder="例如：时间轴、双页、密集拼贴"></label><label>适用风格（逗号分隔）<input name="styles" placeholder="例如：密集拼贴、复古旧物"></label><label>适用用途（逗号分隔）<input name="purposes" placeholder="例如：日常记录、旅途记录"></label><label>抽象模板图片<input name="templateImage" type="file" accept="image/png,image/jpeg,image/webp" required></label><label>对应真实案例图片（可选）<input name="caseImage" type="file" accept="image/png,image/jpeg,image/webp"></label><p>两张图片仅存于当前账号的私有存储，不会作为可使用素材或作品。</p><button type="button" class="btn primary" data-template-save>保存模板</button></div>';
  modal.showModal();body.querySelector('[data-template-import-back]').onclick=()=>modal.close();const save=body.querySelector('[data-template-save]');
  save.onclick=async()=>{save.disabled=true;try{const get=name=>body.querySelector(`[name="${name}"]`);const record=await saveJournalUserTemplate(db,{title:get('title').value,structure:get('structure').value,tags:split(get('tags').value),styles:split(get('styles').value),purposes:split(get('purposes').value)},{templateImage:get('templateImage').files[0],caseImage:get('caseImage').files[0]});modal.close();await onSaved(record);}catch(error){toast(error.message);}finally{save.disabled=false;}};
}
