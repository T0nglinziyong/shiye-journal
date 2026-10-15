import {finishSelection} from './library-selection-model.js';
import {addMatchingFromLibrary} from './matching-selection.js';
import {classifyRecord} from './classification.js';
import {supportsVision} from './ai-settings.js';
import {withUsageStatus} from './library-model.js';
import {hiddenAssetCopy} from './asset-retention.js';
import {explainUserError} from './user-facing-error.js';
import {recordRuntimeIssue} from './runtime-diagnostics.js';
import {updateShell} from './react-shell.jsx';

export async function runAssetBatchAction(c,selection,action,value){
  const {state,db,render}=c;
  const selected=()=>state.assets.filter(asset=>selection.selected.has(asset.id));
  switch(action){
    case 'add-matching':{
      addMatchingFromLibrary(state,[...selection.selected]);finishSelection(selection);
      updateShell({basketCount:state.basket.length});
      void c.matchingSession?.persist?.().catch(console.warn);
      c.toast('已加入搭配素材篮 · ★ 必须使用');return;
    }
    case 'delete':{
      const records=selected();
      if(!records.length||!confirm('将所选 '+records.length+' 件素材移到最近删除？'))return;
      const entries=records.map(item=>({id:crypto.randomUUID(),kind:'asset',item:structuredClone(item),date:new Date().toISOString()}));
      const hidden=records.map(hiddenAssetCopy);
      await db.transaction(['assets','trash'],tx=>{
        for(let index=0;index<entries.length;index++){
          tx.objectStore('assets').put(hidden[index]);tx.objectStore('trash').put(entries[index]);
        }
      });
      for(const item of hidden)Object.assign(state.assets.find(asset=>asset.id===item.id),item);
      state.basket=state.basket.filter(id=>!selection.selected.has(id));
      state.trash.push(...entries);finishSelection(selection);render();return;
    }
    case 'export':return exportImages(c,selection,value);
    case 'print':return c.exportSelectedMaterials([...selection.selected]);
    case 'assign-series':return assignSeries(c,selection,value);
    case 'assign-new-series':{
      const name=String(value||'').trim();if(!name)throw Error('请填写系列名称');
      const series={id:crypto.randomUUID(),title:name,introduction:'',
        createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
      return assignSeries(c,selection,series.id,series);
    }
    case 'set-used':{
      const used=!!value,at=new Date().toISOString();
      const revised=selected().map(asset=>withUsageStatus(asset,used,at));
      await db.transaction(['assets'],tx=>{for(const asset of revised)tx.objectStore('assets').put(asset);});
      for(const asset of revised)Object.assign(state.assets.find(item=>item.id===asset.id),asset);
      render();c.toast('已设置 '+revised.length+' 件素材为'+(used?'已使用':'未使用'));return;
    }
    case 'classify':{
      const records=selected().map(asset=>structuredClone(asset)),
        settings=structuredClone(state.aiSettings),accountID=state.accountId;
      if(!settings.key||!settings.includeThumbnails||!supportsVision(settings))
        throw Error('请先配置可用的视觉模型并开启素材图片');
      let completed=0,failed=0,firstError=null;
      await c.assetOrganization.run(records,{priority:'foreground',organize:async(record,isCurrent)=>{
        if(state.accountId!==accountID||!isCurrent())return;
        const image=await c.modelImage(record,null,512,false);
        if(!image)throw Error('素材图像无法读取');
        const result=await classifyRecord({kind:'asset',record,settings,image,assets:[]});
        if(await c.applyAssetClassification(record,result,{
          manual:true,isCurrent:()=>state.accountId===accountID&&isCurrent()
        }))completed++;
      },onError:error=>{failed++;firstError||=error;
        recordRuntimeIssue('handled',error,state.route,{phase:'ai'});}});
      if(state.accountId===accountID)c.toast(failed?
        `已整理 ${completed} 件，${failed} 件未完成。${explainUserError(firstError,'素材整理')}`:
        `已整理 ${completed} 件`);
      return;
    }
    default:throw Error('未知素材批量操作：'+action);
  }
}

async function assignSeries(c,selection,id,newSeries=null){
  const revised=c.state.assets.filter(asset=>selection.selected.has(asset.id))
    .map(asset=>({...asset,seriesID:id}));
  await c.db.transaction(newSeries?['assets','series']:['assets'],tx=>{
    if(newSeries)tx.objectStore('series').put(newSeries);
    for(const asset of revised)tx.objectStore('assets').put(asset);
  });
  if(newSeries)c.state.series.push(newSeries);
  for(const asset of revised)Object.assign(c.state.assets.find(item=>item.id===asset.id),asset);
  finishSelection(selection);c.render();c.toast('已更新所属系列');
}

async function exportImages(c,selection,format){
  const records=c.state.assets.filter(asset=>selection.selected.has(asset.id)),files=[];
  for(const asset of records){
    let blob=(await c.db.get('blobs',format==='original'?asset.originalBlobId||asset.blobId:asset.blobId))?.data;
    if(!blob){
      if(format==='original'&&asset.originalBlobId&&asset.originalBlobId!==asset.blobId)
        throw Error('「'+asset.title+'」没有可导出的原始图像');
      const src=c.imgTag(asset).match(/src="([^"]+)"/)?.[1];
      if(!src)throw Error('无法读取「'+asset.title+'」图像');
      const response=await fetch(src);if(!response.ok)throw Error('图像读取失败');
      blob=await response.blob();
    }
    if(format!=='original'){
      const bitmap=await createImageBitmap(blob),canvas=document.createElement('canvas');
      canvas.width=bitmap.width;canvas.height=bitmap.height;
      const context=canvas.getContext('2d');
      if(format==='jpeg'){context.fillStyle='white';context.fillRect(0,0,canvas.width,canvas.height);}
      context.drawImage(bitmap,0,0);bitmap.close();
      blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/'+format,.95));
    }
    const ext=({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif',
      'image/svg+xml':'svg','image/avif':'avif','image/heic':'heic'})[blob.type]||'bin';
    files.push(new File([blob],asset.title.replace(/[\\/:*?"<>|]/g,'_')+'.'+ext,{type:blob.type}));
  }
  if(navigator.canShare?.({files})){
    try{await navigator.share({files,title:'拾页素材图像'});return;}
    catch(error){if(error.name==='AbortError')return;}
  }
  for(const file of files)c.download(file,file.name);
  c.toast('已导出 '+files.length+' 张图像');
}
