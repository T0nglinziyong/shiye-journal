import {uid,itemFromAsset,validatePhysicalDraft} from './domain.js';
const color=v=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v);
const number=(v,name,min=-20000,max=20000)=>{if(!Number.isFinite(v)||v<min||v>max)throw Error(name+' 参数不合法');return v;};
const position=(v,size)=>number(v,'位置')*size;
const keyIndex=(draft)=>new Map([
  ...draft.items.map(i=>[i.creativePieceID||i.id,i]),
  ...draft.primitives.map(i=>[i.key||i.id,i]),
  ...draft.textBlocks.map(i=>[i.agentKey||i.id,i])
]);
export function normalizeCalls(raw){
  const input=typeof raw==='string'?JSON.parse(raw):raw;
  const list=Array.isArray(input)?input:input.tools||input.tool_calls||input.choices?.[0]?.message?.tool_calls;
  if(!Array.isArray(list))throw Error('未找到 tools / tool_calls 数组');
  return list.map(x=>({name:x.name||x.function?.name,arguments:x.arguments??x.function?.arguments??{},id:x.id||uid()}));
}
function executeOne(d,assets,aliases,call,options={}){
  const a=call.arguments||{},name=call.name;
  if(name==='place_materials'){
    if(!Array.isArray(a.items)||!a.items.length||a.items.length>12)throw Error('items 应含 1–12 件素材');
    for(const entry of a.items){const assetID=aliases[entry.asset]||entry.asset,asset=assets.find(x=>x.id===assetID);if(!asset)throw Error('素材编号不存在：'+entry.asset);if(!(asset.physicalWidthMM>0&&asset.physicalHeightMM>0))throw Error(asset.title+' 未确认实物尺寸');
      const existing=d.items.find(i=>i.assetID===assetID&&(!i.creativePieceID||i.creativePieceID===(entry.piece||'p-'+entry.asset+'-0')));
      const x=position(entry.x??.5,d.canvas.width),y=position(entry.y??.5,d.canvas.height);
      if(existing){existing.x=x;existing.y=y;existing.generationBaseline.x=x;existing.generationBaseline.y=y;continue;}
      const item=itemFromAsset(asset,d,x,y,entry.z??10+d.items.length,true);item.creativePieceID=entry.piece||'p-'+entry.asset+'-0';item.rotation=entry.rotation||0;item.generationBaseline.rotation=item.rotation;d.items.push(item);
    }
    const errors=validatePhysicalDraft(d,assets);if(errors.length)throw Error(errors[0]);
    return `已放置 ${a.items.length} 件实物`;
  }
  if(name==='edit_materials'){
    if(!Array.isArray(a.items)||!a.items.length||a.items.length>12)throw Error('加工条目数量不合法');
    for(const entry of a.items){const item=d.items.find(i=>i.creativePieceID===entry.piece||i.id===entry.piece);
      if(!item)throw Error('找不到实物片段：'+entry.piece);
      if(!Array.isArray(entry.operations)||entry.operations.length!==1)throw Error('当前仅支持单次直线矩形裁切');
      const operation=entry.operations[0],source=assets.find(x=>x.id===item.assetID);
      if(!source)throw Error('缺少原素材');
      const permission=options.assetProcessing?.[source.id]||options.processing;
      if(operation.type==='rectangularCut'&&permission==='保留完整')throw Error(source.title+' 设置为保留完整，不允许裁切');
      if(operation.type==='useWhole'){
        item.cropRect=null;item.width=source.physicalWidthMM/(d.physicalPageHeightMM||297)*d.canvas.height;
        item.height=source.physicalHeightMM/(d.physicalPageHeightMM||297)*d.canvas.height;
      }else if(operation.type==='rectangularCut'){
        const rect=operation.cropRectMM?{x:operation.cropRectMM.x/source.physicalWidthMM,y:operation.cropRectMM.y/source.physicalHeightMM,width:operation.cropRectMM.width/source.physicalWidthMM,height:operation.cropRectMM.height/source.physicalHeightMM}:operation.cropRect;
        if(!rect||[rect.x,rect.y,rect.width,rect.height].some(v=>!Number.isFinite(v))||rect.x<0||rect.y<0||rect.width<=0||rect.height<=0||rect.x+rect.width>1.00001||rect.y+rect.height>1.00001)throw Error('裁片必须在原素材范围内');
        if(rect.width*source.physicalWidthMM<6||rect.height*source.physicalHeightMM<6)throw Error('裁片短边不得小于 6 mm');
        if(permission==='少量裁剪'&&rect.width*rect.height<.6)throw Error(source.title+' 仅允许少量裁剪，须保留至少 60% 面积');
        item.cropRect=rect;item.width=rect.width*source.physicalWidthMM/(d.physicalPageHeightMM||297)*d.canvas.height;
        item.height=rect.height*source.physicalHeightMM/(d.physicalPageHeightMM||297)*d.canvas.height;
      }else throw Error('当前未实现 '+operation.type+' 的图像加工');
      item.operation=operation;item.materialSteps=[operation];item.generationBaseline={...item.generationBaseline,width:item.width,height:item.height,operation,materialSteps:[operation]};
    }
    const errors=validatePhysicalDraft(d,assets);if(errors.length)throw Error(errors[0]);
    return `已加工 ${a.items.length} 件材料`;
  }
  if(name==='upsert_text'){
    if(!Array.isArray(a.items)||!a.items.length||a.items.length>12)throw Error('文字条目数量不合法');
    for(const t of a.items){if(!t.key||typeof t.content!=='string'||!t.content.trim()||!Number.isFinite(t.width))throw Error('文字需要 key、真实内容和 width');const old=d.textBlocks.find(x=>x.agentKey===t.key),w=position(t.width,d.canvas.width);if(w<=0)throw Error('文字宽度不合法');const role=t.role||'body';const font=t.font_size||t.fontSize||(role==='title'?58:role==='caption'?28:38);
      const data={content:t.content,x:position(t.x??.5,d.canvas.width),y:position(t.y??.5,d.canvas.height),width:w,height:Math.max(font*1.6,position(t.height??.1,d.canvas.height)),fontSize:Math.max(role==='title'?46:role==='caption'?24:32,number(font,'字号',8,160)),style:t.style||'serif',color:color(t.color)?t.color:'#30463d',zIndex:t.z??1001,alignment:t.alignment||'left',rotation:t.rotation||0,agentKey:t.key};
      if(old)Object.assign(old,data);else d.textBlocks.push({id:uid(),...data});
    }return `已写入 ${a.items.length} 块可编辑文字`;
  }
  if(name==='upsert_primitives'){
    if(!Array.isArray(a.items)||!a.items.length||a.items.length>12)throw Error('图形条目数量不合法');
    for(const g of a.items){if(!g.key||!g.kind)throw Error('图形缺少 key 或 kind');if(g.fill!=null&&!color(g.fill)||g.stroke!=null&&!color(g.stroke))throw Error('图形颜色不合法');const data={key:g.key,kind:g.kind,x:position(g.x??.5,d.canvas.width),y:position(g.y??.5,d.canvas.height),width:position(g.width??.2,d.canvas.width),height:position(g.height??.1,d.canvas.height),rotation:g.rotation||0,zIndex:g.z??500,fill:g.fill??'#e7eef7',stroke:g.stroke??'#547da4',lineWidth:g.line_width??3,opacity:g.opacity??1};if(data.width<=0||data.height<=0)throw Error('图形尺寸不合法');const old=d.primitives.find(x=>x.key===g.key);if(old)Object.assign(old,data);else d.primitives.push({id:uid(),...data});
    }return `已写入 ${a.items.length} 个数字图形`;
  }
  if(name==='set_paper'){if(a.color&&!color(a.color))throw Error('纸张颜色不合法');if(a.color)d.paperColor=a.color;if(a.pattern)d.paperPattern=a.pattern==='lined'?'lines':a.pattern;d.compositionIntent=a.intent||d.compositionIntent;return '已更新纸张';}
  if(name==='move_elements'){if(!Array.isArray(a.items)||!a.items.length)throw Error('缺少移动条目');for(const entry of a.items){const target=keyIndex(d).get(entry.key);if(!target)throw Error('图层不存在：'+entry.key);if(entry.x!==undefined)target.x=position(entry.x,d.canvas.width);if(entry.y!==undefined)target.y=position(entry.y,d.canvas.height);if(entry.rotation!==undefined)target.rotation=number(entry.rotation,'旋转',-180,180);if(entry.z!==undefined)target.zIndex=number(entry.z,'图层',-1000,1000);if(target.generationBaseline){target.generationBaseline.x=target.x;target.generationBaseline.y=target.y;}}const errors=validatePhysicalDraft(d,assets);if(errors.length)throw Error(errors[0]);return '已移动图层';}
  if(name==='delete_elements'){if(!Array.isArray(a.keys))throw Error('缺少图层编号');for(const key of a.keys){const target=keyIndex(d).get(key);if(!target)throw Error('图层不存在：'+key);for(const field of ['items','primitives','textBlocks'])d[field]=d[field].filter(x=>x!==target);}return '已移除图层';}
  if(name==='finish_design'){if(!d.textBlocks.some(x=>x.content?.trim()))throw Error('完成前需要加入可读的文字内容');for(const [id,required] of Object.entries(options.materialUseRequired||{})){if(!required)continue;const item=d.items.find(i=>i.assetID===id&&!i.isParked);if(!item)throw Error('必做用法的素材尚未放入页面：'+(assets.find(x=>x.id===id)?.title||id));const hint=options.materialUseHints?.[id];if(['截段固定','取一块真实区域'].includes(hint)&&!item.cropRect)throw Error('必做用法尚未裁切：'+hint);if(hint==='完整保留'&&item.cropRect)throw Error('必做用法要求完整保留：'+(assets.find(x=>x.id===id)?.title||id));}const errors=validatePhysicalDraft(d,assets);if(errors.length)throw Error(errors[0]);d.agentRun={status:'finished',note:a.summary||'',turns:1};return '方案完成';}
  throw Error(`暂不支持 ${name}；之前成功的调用已保留`);
}
export function applyToolCalls(source,base,assets,aliases={},options={}){
  const calls=normalizeCalls(source),draft=structuredClone(base),results=[];
  for(const call of calls){const snapshot=structuredClone(draft);try{if(typeof call.arguments==='string')call.arguments=JSON.parse(call.arguments);const detail=executeOne(draft,assets,aliases,call,options);results.push({id:call.id,name:call.name,ok:true,detail});}
    catch(error){Object.keys(draft).forEach(k=>delete draft[k]);Object.assign(draft,snapshot);results.push({id:call.id,name:call.name,ok:false,detail:error.message});}}
  return {draft,results,committed:results.some(x=>x.ok)};
}
