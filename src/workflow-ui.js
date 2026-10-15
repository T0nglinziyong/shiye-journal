import {finishSelection} from './library-selection-model.js';
import {zipSync,strToU8} from 'fflate';
import {parity} from './parity-ui.js';
import {classifyRecord} from './classification.js';
import {containBox} from './preview-geometry.js';

const previewObservers=new WeakMap();
export function refreshWorkPreviews(c){return mountWorkPreviews(c);}
function mountWorkPreviews(c){
  previewObservers.get(c.view)?.disconnect();previewObservers.delete(c.view);
  const frames=[...c.view.querySelectorAll('.works-grid .thumb-sheet,.project-preview-cover .preview-paper')];
  if(!frames.length)return;
  const projectByID=new Map(c.state.projects.map(project=>[project.id,project])),
    targets=new Map();
  for(const frame of frames){
    const id=frame.closest('[data-act="open-project"]')?.dataset.id||c.state.previewProjectID,
      project=projectByID.get(id);
    const draft=project?.drafts?.find(d=>d.id===project.activeDraftID)||project?.drafts?.[0];
    if(!draft?.canvas||!frame.parentElement)continue;
    targets.set(frame.parentElement,{frame,width:draft.canvas.width,height:draft.canvas.height});
  }
  if(!targets.size)return;
  let scheduled=0;const waiting=new Set(targets.keys());
  const fit=()=>{
    scheduled=0;
    for(const host of waiting){
      const target=targets.get(host);if(!target||!host.isConnected)continue;
      const {frame,width,height}=target,
        box=containBox(width,height,host.clientWidth,host.clientHeight,16);
      if(frame.style.width!==box.width+'px')frame.style.setProperty('width',box.width+'px','important');
      if(frame.style.height!==box.height+'px')frame.style.height=box.height+'px';
      const ratio=width+'/'+height;
      if(frame.style.aspectRatio!==ratio)frame.style.aspectRatio=ratio;
    }
    waiting.clear();
  };
  const schedule=()=>{
    if(scheduled)return;
    scheduled=requestAnimationFrame(fit);
  };
  const observer=new ResizeObserver(entries=>{
    for(const entry of entries)if(targets.has(entry.target))waiting.add(entry.target);
    schedule();
  });
  for(const host of targets.keys())observer.observe(host);
  schedule();
  previewObservers.set(c.view,{disconnect(){observer.disconnect();if(scheduled)cancelAnimationFrame(scheduled);}});
}

async function setSelectedWorkUsage(c,used){
  const selected=c.state.projects.filter(p=>parity.selected.has(p.id)&&!p.isSnapshot);
  if(!selected.length)throw Error('仅可编辑作品支持使用状态');
  await c.flushSave();
  const at=new Date().toISOString(),updated=[];
  for(const project of selected){
    const full=project.projectDocumentPath?await c.db.completeProject(project):project;
    updated.push({...full,isUsed:used,updatedAt:at});
  }
  // A single durable batch avoids half-updated selection after a slow upload.
  await c.db.transaction(['projects'],tx=>{
    for(const record of updated)tx.objectStore('projects').put(record);
  });
  for(const record of updated){
    const local=c.state.projects.find(p=>p.id===record.id);
    if(local)Object.assign(local,record);
  }
  c.render();
  c.toast('已将 '+updated.length+' 件作品设置为'+(used?'已使用':'未使用'));
}
async function exportSeriesArchive(c,seriesIDs){
  const chosen=c.state.series.filter(x=>seriesIDs.includes(x.id));
  if(!chosen.length)throw Error('请选择系列');
  const assets=c.state.assets.filter(a=>chosen.some(series=>series.id===a.seriesID&&!a.isProjectInternal));
  const payload={'series.json':strToU8(JSON.stringify({series:chosen,assets:assets.map(({blobId,originalBlobId,originalCutoutBlobId,candidateFrameBlobId,...meta})=>({...meta,blobId,originalBlobId,originalCutoutBlobId,candidateFrameBlobId}))},null,2))};
  for(const a of assets){
    const blob=(await c.db.get('blobs',a.blobId))?.data;
    if(!(blob instanceof Blob))throw Error('素材图片读取失败：'+a.title);
    payload['materials/'+a.id+'.png']=new Uint8Array(await blob.arrayBuffer());
  }
  c.download(new Blob([zipSync(payload,{level:3})],{type:'application/zip'}),'拾页-系列导出.zip');
}
async function exportSelectedWorks(c,records,format='native'){
  if(!records.length)throw Error('请先选择要导出的作品');
  for(const record of records){
    if(record.isSnapshot){
      const id=record.snapshotDocumentBlobId||record.snapshotBlobId,raw=(await c.db.get('blobs',id))?.data;
      if(!(raw instanceof Blob))throw Error('快照尚未同步：'+record.title);
      if(format==='original'){
        const ext=record.snapshotFormat==='application/pdf'?'pdf':record.snapshotFormat==='image/jpeg'?'jpg':record.snapshotFormat==='image/webp'?'webp':'png';
        c.download(raw,record.title+'.'+ext);
      }else if(format==='png'||format==='jpeg'){
        const bitmap=await createImageBitmap(raw);try{
          const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
          const ctx=canvas.getContext('2d');
          if(format==='jpeg'){ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);}
          ctx.drawImage(bitmap,0,0);
          const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/'+format,.93));
          if(!blob)throw Error('快照编码失败：'+record.title);
          c.download(blob,record.title+(format==='jpeg'?'.jpg':'.png'));
        }finally{bitmap.close();}
      }else throw Error('快照不支持当前导出类型');
    }else if(format==='native')await c.handle('download-project-json',record.id);
    else{
      const complete=record.projectDocumentPath?await c.db.completeProject(record):record;
      const draft=complete.drafts?.find(d=>d.id===complete.activeDraftID)||complete.drafts?.[0];
      if(!draft)throw Error('作品缺少可编辑画布：'+record.title);
      const scale=Math.min(1.6,1800/Math.max(draft.canvas.width,draft.canvas.height));
      const canvas=await c.rasterize(draft,scale);
      if(format==='pdf'){
        const height=draft.physicalPageHeightMM||297,width=height*draft.canvas.width/draft.canvas.height;
        const {pagePDF,canvasPDFPage}=await import('./pdf-export.js');
        c.download(await pagePDF([await canvasPDFPage(canvas,width,height)]),record.title+'.pdf');
      }else{
        const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
        if(!blob)throw Error('作品 PNG 导出失败：'+record.title);
        c.download(blob,record.title+'.png');
      }
    }
  }
}
function seriesExportActions(c){
  return [
    ['素材与系列 ZIP',()=>exportSeriesArchive(c,[...parity.selected])],
    ['系列清单 JSON',()=>{
      const series=c.state.series.filter(s=>parity.selected.has(s.id));
      c.download(new Blob([JSON.stringify(series,null,2)],{type:'application/json'}),'拾页-系列清单.json');
    }]
  ];
}
function workExportActions(c){
  const records=c.state.projects.filter(p=>parity.selected.has(p.id));
  const snapshots=records.length>0&&records.every(p=>p.isSnapshot);
  const editable=records.length>0&&records.every(p=>!p.isSnapshot);
  const entries=snapshots
    ?(records.some(p=>p.snapshotFormat==='application/pdf')
      ?[['原始快照文件','original']]
      :[['原始快照文件','original'],['PNG 图像','png'],['白底 JPEG','jpeg']])
    :editable
      ?[['可编辑拾页 JSON','native'],['PNG 图像','png'],['PDF 文件','pdf']]
      :[['按原格式分别导出','mixed']];
  return entries.map(([label,format])=>[label,async()=>{
    if(format==='mixed'){
      await exportSelectedWorks(c,records.filter(p=>p.isSnapshot),'original');
      await exportSelectedWorks(c,records.filter(p=>!p.isSnapshot),'native');
    }else await exportSelectedWorks(c,records,format);
  }]);
}
async function classifySelectedWorks(c,records){
  const account=c.state.accountId,settings=structuredClone(c.state.aiSettings);
  for(const record of records){
    if(c.state.accountId!==account)break;
    const source=record.isSnapshot?record:await c.db.completeProject(record);
    let image=null;
    if(record.isSnapshot&&settings.includeThumbnails){
      image=await c.modelImage({blobId:record.snapshotBlobId},null,360,false);
    }
    const identified=await classifyRecord({kind:'project',record:source,settings,image,assets:c.state.assets});
    const current=await c.db.get('projects',source.id);
    if(!current||current.updatedAt!==source.updatedAt)continue;
    const next={...current,...identified,styleTags:identified.styleTags||identified.tags||current.styleTags,updatedAt:new Date().toISOString()};
    await c.db.put('projects',next);Object.assign(record,next);
  }
  c.render();
}

export function mountWorkflowControls(c) {
  mountWorkPreviews(c);
  mountCatalogSticky(c.view,c.state.route);

}
function mountCatalogSticky(view,route){
  if(!['library','series','works'].includes(route))return;
  const root=view.querySelector('.series-contents,.works-page')||view;
  const toolbar=[...root.children].find(child=>child.classList?.contains('catalog-toolbar'));
  const top=document.querySelector('.topbar');
  if(toolbar&&top)toolbar.style.setProperty('--catalog-top',top.getBoundingClientRect().height+'px');
}
export async function runSeriesBatchAction(c,selection,action,value){
  switch(action){
    case 'export':{
      const option=seriesExportActions(c).find(([label])=>label===value);
      if(!option)throw Error('未知系列导出类型');
      return option[1]();
    }
    case 'edit-series':{
      if(selection.selected.size!==1)throw Error('请先只选择一个系列');
      c.openSeriesEditor([...selection.selected][0]);return;
    }
    case 'delete':{
      if(!selection.selected.size||!confirm('删除所选系列？素材仍保留在全部素材中。'))return;
      const revised=c.state.assets.filter(asset=>selection.selected.has(asset.seriesID))
        .map(asset=>({...asset,seriesID:null}));
      await c.db.transaction(['series','assets'],tx=>{
        for(const id of selection.selected)tx.objectStore('series').delete(id);
        for(const asset of revised)tx.objectStore('assets').put(asset);
      });
      c.state.series=c.state.series.filter(series=>!selection.selected.has(series.id));
      for(const asset of revised)Object.assign(c.state.assets.find(item=>item.id===asset.id),asset);
      finishSelection(selection);c.render();return;
    }
    default:throw Error('未知系列批量操作：'+action);
  }
}
export async function runWorkBatchAction(c,selection,action,value){
  switch(action){
    case 'export':{
      const option=workExportActions(c).find(([label])=>label===value);
      if(!option)throw Error('未知作品导出类型');
      return option[1]();
    }
    case 'classify':return classifySelectedWorks(c,c.state.projects.filter(project=>selection.selected.has(project.id)));
    case 'set-used':return setSelectedWorkUsage(c,!!value);
    case 'delete':{
      if(!selection.selected.size||!confirm('将所选作品移到最近删除？'))return;
      const ids=[...selection.selected];finishSelection(selection);
      await c.moveProjectsToTrash(ids);return;
    }
    default:throw Error('未知作品批量操作：'+action);
  }
}
export async function exportMaterials(c,ids) {
  const {pagePDF,canvasPDFPage,materialPrintPlacements}=await import('./pdf-export.js');
  const placements=materialPrintPlacements(ids.map(c.asset).filter(Boolean)),scale=300/25.4,pages=[];
  for(let page=0;page<=placements.at(-1).page;page++) {
    const canvas=document.createElement('canvas');canvas.width=Math.round(210*scale);canvas.height=Math.round(297*scale);
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#333';ctx.font=(3*scale)+'px sans-serif';
    ctx.fillText('拾页 · 素材打印 '+(page+1),8*scale,8*scale);ctx.font=(2.4*scale)+'px sans-serif';ctx.fillText('实际尺寸 100%，不要缩放以适合纸张',8*scale,13*scale);
    ctx.beginPath();ctx.moveTo(187*scale,12*scale);ctx.lineTo(197*scale,12*scale);ctx.stroke();ctx.fillText('10 mm',187*scale,8*scale);
    for(const p of placements.filter(p=>p.page===page)) {
      const blob=(await c.db.get('blobs',p.asset.blobId))?.data;if(!(blob instanceof Blob))throw Error('「'+p.asset.title+'」的原图无法读取');const im=new Image(),src=URL.createObjectURL(blob);im.src=src;try{await im.decode();
      ctx.fillText(p.asset.title+' · '+p.width+' × '+p.height+' mm',p.x*scale,(p.y-2)*scale,p.width*scale);
      ctx.drawImage(im,p.x*scale,p.y*scale,p.width*scale,p.height*scale);}finally{URL.revokeObjectURL(src);}
    }
    pages.push(await canvasPDFPage(canvas,210,297));
  }
  c.download(await pagePDF(pages),'拾页-素材实际尺寸.pdf');
}
