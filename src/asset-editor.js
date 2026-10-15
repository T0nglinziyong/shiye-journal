import {parseTags,usedAssetIDs,withUsageStatus} from './library-model.js';
import {onDialogClosed} from './dialog-lifecycle.js';

export function assetEditorValue(old,values) {
  if(!values.title.trim())throw Error('请填写素材名称');
  const dimension=value=>{if(value==='')return null;const n=Number(value);if(!Number.isFinite(n)||n<=0)throw Error('实物宽高必须是正数或留空');return n;};
  const quantity=Number(values.quantity);if(!Number.isInteger(quantity)||quantity<0||quantity>999)throw Error('数量需要是 0–999 的整数');
  const width=dimension(values.width),height=dimension(values.height);
  const next={...old,title:values.title.trim(),kind:values.kind,role:values.role,texture:values.texture.trim(),physicalWidthMM:width,physicalHeightMM:height,
    tags:parseTags(values.tags),contentTags:parseTags(values.contentTags),styleTags:parseTags(values.styleTags),materialTags:parseTags(values.materialTags),
    seriesID:values.seriesID||null,reviewStatus:values.reviewStatus,supply:{...old.supply,kind:quantity===999?'unlimited':quantity===1?'single':'quantity',quantity},updatedAt:new Date().toISOString()};
  next.tags=[...new Set([...next.tags,...next.contentTags,...next.styleTags,...next.materialTags])];
  if(values.usageStatus!=='used'&&values.usageStatus!=='unused')throw Error('使用状态无效');
  Object.assign(next,withUsageStatus(next,values.usageStatus==='used',next.updatedAt));
  if(width!==old.physicalWidthMM||height!==old.physicalHeightMM)next.dimensionSource=width&&height?'manual':null;
  if(values.kind==='tape') {
    if(values.tapeRoll&&quantity!==999){const length=Number(values.supplyLength);if(!Number.isFinite(length)||length<=0)throw Error('整卷胶带需要填写实际剩余长度');next.supply={...next.supply,kind:'tapeRoll',availableLengthMM:length};}
    next.tapeRepeatMode=values.repeatable?'repeatablePattern':'singleStrip';
    if(values.repeatable){const period=Number(values.repeatPeriod);if(!Number.isFinite(period)||period<=0||!width||!height||period>Math.max(width,height))throw Error('重复周期需为正数，且不得超过已校准样段长度');next.tapeRepeatPeriodMM=period;}
    else next.tapeRepeatPeriodMM=null;
  }
  // Saving an unchanged form must not create a new cloud revision or restart
  // image/works sync. The two timestamps are effects of a real edit only.
  const content=record=>{const {updatedAt,usageUpdatedAt,...fields}=record;return fields;};
  if(JSON.stringify(content(next))===JSON.stringify(content(old)))return old;
  return next;
}
export function showAssetEditor(c,id) {
  const a=c.state.assets.find(a=>a.id===id);if(!a)return;
  const input=(label,key,value,type='text')=>'<label>'+label+'<input id="asset-'+key+'" type="'+type+'" value="'+c.esc(value??'')+'"></label>';
  const select=(label,key,choices,value)=>'<label>'+label+'<select id="asset-'+key+'">'+choices.map(([id,text])=>'<option value="'+id+'" '+(id===value?'selected':'')+'>'+text+'</option>').join('')+'</select></label>';
  c.body.innerHTML='<div class="dialog-head asset-edit-head"><h2>编辑素材</h2><div class="asset-edit-actions"><button type="button" id="asset-dialog-close" aria-label="取消编辑">取消</button><button type="button" class="btn primary" id="save-asset">保存</button></div></div><div class="detail-layout"><div>'+c.imgTag(a)+'</div><div class="stack">'+
    input('名称','title',a.title)+select('类型','kind',[['sticker','贴纸'],['paper','纸张'],['tape','胶带'],['photo','照片'],['text','文字'],['reference','参考']],a.kind)+
    select('画面作用','role',[['focal','主角'],['support','陪衬'],['background','背景'],['connector','连接'],['annotation','注释']],a.role)+input('材质','texture',a.texture)+
    '<div class="form-grid">'+input('实物宽 mm','width',a.physicalWidthMM,'number')+input('实物高 mm','height',a.physicalHeightMM,'number')+'</div>'+input('数量（999＝不限使用）','quantity',a.supply?.quantity??(a.kind==='tape'?999:1),'number')+
    input('具体内容','content-tags',(a.contentTags||[]).join('、'))+input('风格','style-tags',(a.styleTags||[]).join('、'))+input('材质标签','material-tags',(a.materialTags||[]).join('、'))+input('其他标签','tags',(a.tags||[]).join('、'))+
    select('所属系列','series',[['','不归入系列'],...c.state.series.map(s=>[s.id,c.esc(s.title)])],a.seriesID||'')+select('整理状态','status',[['ready','已整理'],['pendingReview','待检查']],a.reviewStatus||'pendingReview')+select('使用状态','usage',[['unused','未使用'],['used','已使用']],usedAssetIDs(c.state.assets).has(a.id)?'used':'unused')+
    '<section id="tape-stock"><h3>胶带库存</h3><label class="toggle-row">实际持有整卷<input type="checkbox" id="asset-tape-roll" '+(a.supply?.kind==='tapeRoll'?'checked':'')+'></label>'+input('整卷剩余长度 mm','supply-length',a.supply?.availableLengthMM,'number')+'<label class="toggle-row">已确认重复纹样<input type="checkbox" id="asset-repeatable" '+(a.tapeRepeatMode==='repeatablePattern'?'checked':'')+'></label>'+input('真实重复周期 mm','repeat-period',a.tapeRepeatPeriodMM,'number')+'<p>未知周期时只能使用照片拍到的一段。</p></section><p>数量 999 表示无限使用，创作后不会自动减为 998；数量为 0 时不可用于搭配。</p><p id="asset-save-error" role="alert"></p></div></div>';
  const tape=c.body.querySelector('#tape-stock'),kind=c.body.querySelector('#asset-kind');
  tape.hidden=kind.value!=='tape';
  kind.onchange=()=>{
    tape.hidden=kind.value!=='tape';
    const stock=c.body.querySelector('#asset-quantity');
    if(kind.value==='tape'&&Number(stock.value)===1)stock.value='999';
  };
  c.body.querySelector('#asset-dialog-close').onclick=()=>c.modal.close();
  c.body.querySelector('#save-asset').onclick=async()=>{
    const button=c.body.querySelector('#save-asset');button.disabled=true;
    const value=id=>c.body.querySelector('#asset-'+id).value;
    try {
      const usage=value('usage');
      const next=assetEditorValue(a,{title:value('title'),kind:value('kind'),role:value('role'),texture:value('texture'),width:value('width'),height:value('height'),quantity:value('quantity'),tags:value('tags'),contentTags:value('content-tags'),styleTags:value('style-tags'),materialTags:value('material-tags'),seriesID:value('series'),reviewStatus:value('status'),usageStatus:usage,tapeRoll:c.body.querySelector('#asset-tape-roll').checked,supplyLength:value('supply-length'),repeatable:c.body.querySelector('#asset-repeatable').checked,repeatPeriod:value('repeat-period')});
      if(next===a){c.modal.close();c.toast('素材信息未变化');return;}
      await c.db.put('assets',next);Object.assign(a,next);if(next.supply.quantity===0)c.state.basket=c.state.basket.filter(x=>x!==id);c.modal.close();c.render();c.toast('素材信息已保存');
    }catch(error){c.body.querySelector('#asset-save-error').textContent=error.message;button.disabled=false;}
  };
  const layout=c.body.querySelector('.detail-layout');layout.className='material-editor';const picture=layout.firstElementChild;picture.className='material-editor-preview';
  const stack=layout.lastElementChild,controls=document.createElement('section');controls.className='material-editor-controls';
  const tabs=document.createElement('div');tabs.className='cutout-tabs';controls.append(tabs);
  const groups=[['基本信息',['asset-title','asset-kind','asset-role','asset-texture','asset-usage']],['尺寸与库存',['asset-width','asset-height','asset-quantity','tape-stock']],['分类与标签',['asset-content-tags','asset-style-tags','asset-material-tags','asset-tags','asset-series','asset-status']]];
  groups.forEach(([title,ids],index)=>{const panel=document.createElement('div');panel.className='stack material-info-panel';panel.hidden=index!==0;for(const id of ids){const field=c.body.querySelector('#'+id);if(!field)continue;let row=field.closest('label')||field;if(row.parentElement?.classList.contains('form-grid'))row=row.parentElement;if(!panel.contains(row))panel.append(row);}const tab=document.createElement('button');tab.type='button';tab.textContent=title;tab.classList.toggle('selected',index===0);tab.onclick=()=>{controls.querySelectorAll('.material-info-panel').forEach(p=>p.hidden=p!==panel);tabs.querySelectorAll('button').forEach(b=>b.classList.toggle('selected',b===tab));};tabs.append(tab);controls.append(panel);});
  while(stack.firstChild)controls.append(stack.firstChild);stack.replaceWith(controls);
  c.modal.classList.add('material-editor-dialog');onDialogClosed(c.modal,()=>{c.modal.classList.remove('material-editor-dialog');});
  if(!c.modal.open)c.modal.showModal();
}
