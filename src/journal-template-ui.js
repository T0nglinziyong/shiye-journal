import {presetJournalTemplates,normalizeUserTemplate,templateIndexText,USER_TEMPLATE_PREFIX} from './journal-template-catalog.js';
import {loadJournalPresetPanel,publishJournalPresetImages} from './journal-preset-images.js';
import {journalTemplatePanel} from './journal-source-panels.js';
import {cloudEnabled,cloudClient} from './cloud-session.js';

const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[char]));
const split=value=>[...new Set(String(value||'').split(/[,，、\n]/).map(part=>part.trim()).filter(Boolean))];
const urls=new Map();let urlOwner=null;
export function clearJournalTemplateImages(){for(const url of urls.values())URL.revokeObjectURL(url);urls.clear();urlOwner=null;}
async function imageURL(db,owner,id){
  if(!id)return null;
  if(urlOwner!==owner){clearJournalTemplateImages();urlOwner=owner;}
  if(urls.has(id))return urls.get(id);
  const blob=(await db.get('blobs',id))?.data;
  if(!(blob instanceof Blob)||!blob.size)return null;
  const url=URL.createObjectURL(blob);urls.set(id,url);return url;
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
  filters?.remove();grid.classList.add('journal-template-grid');
  const catalog=[...presetJournalTemplates(),...(state.userTemplates||[])];
  const toolbar=document.createElement('div');toolbar.className='journal-template-toolbar';
  toolbar.innerHTML='<label>搜索模板、风格、用途或素材标签<input type="search" aria-label="搜索模板" placeholder="例如：密集拼贴、食物、时间轴"></label><span></span><button type="button" class="btn">导入模板与案例</button>';
  grid.before(toolbar);
  const heading=view.querySelector('.view-head p');if(heading)heading.textContent='预设版式与真实案例独立于我的作品；按多个标签寻找创作方向。';
  let imageObserver;
  const display=()=>{
    imageObserver?.disconnect();imageObserver=null;
    const query=toolbar.querySelector('input').value.trim().toLocaleLowerCase();
    const selected=catalog.find(item=>item.id===viewState.templateID);
    if(selected){
      grid.classList.add('journal-template-detail');
      const caseAvailable=!!(selected.exampleBlobId||selected.exampleSourceNumbers?.length);
      const showCase=viewState.templateSide==='case'&&caseAvailable;
      const visual=showCase?'<span class="journal-template-loading">载入对应案例…</span>':(selected.templateBlobId?'':'<div class="journal-template-outline">'+escapeHTML(selected.title)+'</div>');
      grid.innerHTML=`<article class="journal-template-detail-card"><div class="journal-template-detail-head"><button type="button" class="btn" data-template-back>← 返回模板</button><h2>${escapeHTML(selected.title)}</h2></div><div class="journal-template-switch"><button type="button" class="btn ${showCase?'':'primary'}" data-template-side="template">抽象模板</button><button type="button" class="btn ${showCase?'primary':''}" data-template-side="case" ${caseAvailable?'':'disabled'}>真实案例</button></div><div class="journal-template-detail-image">${visual}</div><p class="journal-template-source">${selected.origin==='preset'?'预设原图存于账号可读的私有图库；若尚未载入，下方仍可查看来源结构说明。':showCase?'用户导入的对应案例。':'用户导入的抽象模板。'}</p><p>${escapeHTML(selected.structure)}</p><div class="journal-template-tags">${(selected.tags||[]).map(tag=>`<span class="chip">${escapeHTML(tag)}</span>`).join('')}</div>${selected.origin==='preset'?`<p class="journal-template-source">模板原图编号：${selected.sourceNumbers.join('、')}${selected.exampleSourceNumbers?.length?'；对应案例编号：'+selected.exampleSourceNumbers.join('、'):''}</p>`:''}</article>`;
      grid.querySelector('[data-template-back]').onclick=()=>{viewState.templateID=null;display();};
      grid.querySelectorAll('[data-template-side]').forEach(button=>button.onclick=()=>{viewState.templateSide=button.dataset.templateSide;display();});
      const blobId=showCase?selected.exampleBlobId:selected.templateBlobId;
      const sourcePanel=journalTemplatePanel(selected,showCase?'case':'template');
      if(blobId||sourcePanel)void (blobId?imageURL(db,state.accountId,blobId):loadJournalPresetPanel(sourcePanel,{accountId:state.accountId})).then(url=>{if(viewState.templateID!==selected.id||!grid.isConnected||!url)return;const host=grid.querySelector('.journal-template-detail-image');host.replaceChildren();const image=document.createElement('img');image.src=url;image.alt=selected.title+(showCase?' 真实案例':' 抽象模板');host.append(image);}).catch(()=>{if(viewState.templateID===selected.id){const host=grid.querySelector('.journal-template-detail-image');if(host)host.textContent='这张预设原图暂未载入，可先查看结构说明。';}});
    }else{
      grid.classList.remove('journal-template-detail');
      const found=catalog.filter(item=>!query||templateIndexText(item).includes(query));
      toolbar.querySelector('span').textContent=`${found.length} / ${catalog.length} 个模板`;
      grid.innerHTML=found.map(item=>`<button type="button" class="card journal-template-card" data-template-id="${escapeHTML(item.id)}"><div class="card-image">${item.templateBlobId?'<span class="journal-template-loading">载入模板…</span>':'<div class="journal-template-outline">'+escapeHTML(item.title)+'</div>'}</div><div class="card-body"><h3>${escapeHTML(item.title)}</h3><p>${item.origin==='preset'?'预设模板':'我的模板'} · ${item.exampleBlobId||item.exampleSourceNumbers?.length?'有对应案例':'暂无案例'}</p><div class="journal-template-tags">${item.tags.slice(0,3).map(tag=>`<span class="chip">${escapeHTML(tag)}</span>`).join('')}</div></div></button>`).join('')||'<p class="empty">没有匹配的模板，试试其他标签。</p>';
      grid.querySelectorAll('[data-template-id]').forEach(card=>card.onclick=()=>{viewState.templateID=card.dataset.templateId;viewState.templateSide='template';display();});
      const byID=new Map(found.map(item=>[item.id,item]));
      const loadCard=card=>{const item=byID.get(card.dataset.templateId);const sourcePanel=journalTemplatePanel(item,'template');if(!item?.templateBlobId&&!sourcePanel)return;void (item.templateBlobId?imageURL(db,state.accountId,item.templateBlobId):loadJournalPresetPanel(sourcePanel,{accountId:state.accountId})).then(url=>{if(card.isConnected&&grid.contains(card)&&url){const image=document.createElement('img');image.src=url;image.alt=item.title+' 抽象模板';card.querySelector('.card-image').replaceChildren(image);}}).catch(()=>{});};
      if(typeof IntersectionObserver==='function'){
        const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){observer.unobserve(entry.target);loadCard(entry.target);}},{rootMargin:'300px'});
        imageObserver=observer;grid.querySelectorAll('[data-template-id]').forEach(card=>observer.observe(card));
      }else grid.querySelectorAll('[data-template-id]').forEach(loadCard);
    }
  };
  toolbar.querySelector('input').oninput=display;
  toolbar.querySelector('button').onclick=()=>openImport(c,async record=>{state.userTemplates=[...(state.userTemplates||[]),record];viewState.templateID=record.id;viewState.templateSide='template';render();toast('模板已在本机暂存，正在后台同步');});
  if(cloudEnabled)void cloudClient().from('shiye_accounts').select('is_admin').eq('user_id',state.accountId).maybeSingle().then(({data,error})=>{
    if(error||!data?.is_admin||!toolbar.isConnected)return;
    const upload=document.createElement('button');upload.type='button';upload.className='btn';upload.textContent='发布预设原图';
    const picker=document.createElement('input');picker.type='file';picker.accept='image/jpeg,.jpg,.jpeg';picker.multiple=true;picker.hidden=true;
    upload.onclick=()=>picker.click();picker.onchange=async()=>{upload.disabled=true;try{await publishJournalPresetImages(picker.files,{onProgress:(done,total)=>{upload.textContent=`发布预设原图 ${done}/${total}`;}});toast('预设原图已发布');render();}catch(error){toast(error.message);}finally{upload.disabled=false;upload.textContent='发布预设原图';picker.value='';}};
    toolbar.append(upload,picker);
  }).catch(()=>{});
  display();
}

function openImport(c,onSaved){
  const {body,modal,db,toast}=c;
  body.innerHTML='<div class="dialog-head"><h2>导入模板与案例</h2></div><div class="stack journal-template-import"><label>模板名称<input name="title" maxlength="80" required placeholder="例如：双列时间轴"></label><label>结构说明<textarea name="structure" required placeholder="简述主图、文字、装饰与阅读顺序"></textarea></label><label>检索标签（逗号分隔）<input name="tags" required placeholder="例如：时间轴、双页、密集拼贴"></label><label>适用风格（逗号分隔）<input name="styles" placeholder="例如：密集拼贴、复古旧物"></label><label>适用用途（逗号分隔）<input name="purposes" placeholder="例如：日常记录、旅途记录"></label><label>抽象模板图片<input name="templateImage" type="file" accept="image/png,image/jpeg,image/webp" required></label><label>对应真实案例图片（可选）<input name="caseImage" type="file" accept="image/png,image/jpeg,image/webp"></label><p>两张图片仅存于当前账号的私有存储，不会作为可使用素材或作品。</p><button type="button" class="btn primary" data-template-save>保存模板</button></div>';
  modal.showModal();const save=body.querySelector('[data-template-save]');
  save.onclick=async()=>{save.disabled=true;try{const get=name=>body.querySelector(`[name="${name}"]`);const record=await saveJournalUserTemplate(db,{title:get('title').value,structure:get('structure').value,tags:split(get('tags').value),styles:split(get('styles').value),purposes:split(get('purposes').value)},{templateImage:get('templateImage').files[0],caseImage:get('caseImage').files[0]});modal.close();await onSaved(record);}catch(error){toast(error.message);}finally{save.disabled=false;}};
}
