import {buildCraftEdge,craftPermission,sourceFootprint,sourceIntersectionArea} from './craft-geometry.js';
import {solveCraftRelations} from './craft-relations.js';
import {uid,itemFromAsset} from './domain.js';
import {textLines,textFont} from './editor-tools-model.js';
import {reviewCreativeDraft} from './creative-quality.js';
import {materialMaskPoints,materialMaskArea,materialMaskGeometry,cutMaterialDiagonal,addMaterialWindow} from './material-mask.js';
import {agentTools,directPageContract,directPageToTools,validateTool,validateValue} from './creative-contract.js';
export {agentTools,directPageContract,directPageToTools};
const EPS=1e-6,fields=['items','primitives','textBlocks'];
const entries=d=>fields.flatMap(f=>(d[f]||[]));
const keyOf=i=>i.creativePieceID||i.agentKey||i.key||i.id;
const index=d=>new Map(entries(d).flatMap(i=>[[keyOf(i),i],[i.id,i]]));
const scale=d=>d.canvas.height/(d.physicalPageHeightMM||297);
const locked=i=>{if(i.isLocked||i.locked)throw Error('图层已锁定：'+keyOf(i));};
const finite=(v,name,min=-20000,max=20000)=>{if(!Number.isFinite(v)||v<min||v>max)throw Error(name+' 数值不合法');return v;};
const find=(d,key)=>{const i=index(d).get(key);if(!i)throw Error('图层不存在：'+key);return i;};
const materialAsset=(assets,aliases,key)=>{const id=Object.hasOwn(aliases,key)?aliases[key]:key;const a=assets.find(a=>a.id===id);if(!a)throw Error('素材编号不存在：'+key);if(!(Number.isFinite(a.physicalWidthMM)&&a.physicalWidthMM>0&&Number.isFinite(a.physicalHeightMM)&&a.physicalHeightMM>0))throw Error(a.title+' 未确认实物尺寸');return a;};
const dimensions=i=>{const a=(i.rotation||0)*Math.PI/180;return {width:Math.abs(Math.cos(a))*i.width+Math.abs(Math.sin(a))*i.height,height:Math.abs(Math.sin(a))*i.width+Math.abs(Math.cos(a))*i.height};};
const cropOf=i=>i.cropRect||{x:0,y:0,width:1,height:1};
const overlap=(a,b)=>Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)>EPS&&Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y)>EPS;
function assertRect(r){if(!r||[r.x,r.y,r.width,r.height].some(v=>!Number.isFinite(v))||r.x<0||r.y<0||r.width<=0||r.height<=0||r.x+r.width>1+EPS||r.y+r.height>1+EPS)throw Error('裁片必须在原素材范围内');}
function baseline(i){i.generationBaseline={...i.generationBaseline,x:i.x,y:i.y,width:i.width,height:i.height,rotation:i.rotation,zIndex:i.zIndex,cropRect:i.cropRect,materialMask:i.materialMask?structuredClone(i.materialMask):null,operation:i.operation,materialSteps:structuredClone(i.materialSteps||[])};}
function checkDraft(d,assets){
  finite(d.canvas?.width,'画布宽度',1,20000);finite(d.canvas?.height,'画布高度',1,20000);
  const keys=new Set(),usage=new Map();
  for(const i of entries(d)){
    const key=keyOf(i);if(keys.has(key))throw Error('图层编号重复：'+key);keys.add(key);
    for(const k of ['x','y','width','height'])finite(i[k],k,k==='width'||k==='height'?EPS:-20000);
    finite(i.rotation??0,'旋转',-180,180);finite(i.zIndex??0,'图层',-1000,20000);
    // The page is a print crop, not a limit on where a real sheet may lie.
    // Intentional bleed/overhang is clipped by the page renderer; dimensions,
    // source crops and inventory are still checked below.
  }
  for(const i of d.items){
    const a=assets.find(a=>a.id===i.assetID);if(!a)throw Error('缺少素材 '+i.assetID);
    if(!i.generationBaseline)throw Error(a.title+' 缺少生成基线');
    const unit=i.materialUnitIndex??0;finite(unit,'实物单位',0,10000);if(!Number.isInteger(unit))throw Error('实物单位必须是整数');
    const quantity=a.supply?.quantity??1;if(!Number.isFinite(quantity)||quantity<=0||(a.kind!=='tape'&&unit>=quantity))throw Error(a.title+' 超出实物数量');
    const crop=cropOf(i);assertRect(crop);
    if(i.materialMask)materialMaskPoints(i.materialMask);
    const expectedW=crop.width*a.physicalWidthMM*scale(d),expectedH=crop.height*a.physicalHeightMM*scale(d);
    if(!Number.isFinite(expectedW)||!Number.isFinite(expectedH)||Math.abs(i.width-expectedW)>EPS||Math.abs(i.height-expectedH)>EPS)throw Error(a.title+' 实物尺寸与来源不一致');
    if(a.kind!=='tape'){const group=a.id+':'+unit,used=usage.get(group)||[],region=sourceFootprint(i,a,materialMaskGeometry(i.materialMask));if(used.some(previous=>sourceIntersectionArea(previous,region)>1e-6))throw Error(a.title+' 同一实物单位的裁片重叠或重复使用');used.push(region);usage.set(group,used);} // Intersection tolerance is in source mm².
  }
}
function measure(t,options){
  if(typeof options.measureText==='function')return text=>options.measureText(text,t);
  const ctx=globalThis.document?.createElement?.('canvas')?.getContext?.('2d');
  if(ctx){ctx.font=textFont(t);ctx.letterSpacing=(t.letterSpacing||0)+'px';return text=>ctx.measureText(text).width;}
  return text=>Array.from(text).reduce((n,ch)=>n+t.fontSize*(/[\u0000-\u00ff]/u.test(ch)?.65:1)+(t.letterSpacing||0),0);
}
function layoutText(t,options){const result=textLines(t,measure(t,options));return {...result,height:Math.max(t.fontSize*1.3,result.height)};}
function converted(v,unit,d,axis){finite(v,axis);if(unit==='mm')return v*scale(d);if(unit==='pt')return v;return v*d.canvas[axis];}
function place(d,data,fallback){fallback||={x:d.canvas.width/2,y:d.canvas.height/2};
  if(data.relative_to){const target=find(d,data.relative_to),[dx,dy]=data.offset||[0,0];return {x:target.x+dx*target.width,y:target.y+dy*target.height};}
  if(data.offset)throw Error('offset 需要 relative_to');
  return {x:data.x===undefined?fallback.x:converted(data.x,data.coordinate_unit||'ratio',d,'width'),y:data.y===undefined?fallback.y:converted(data.y,data.coordinate_unit||'ratio',d,'height')};
}
function setPosition(d,i,data){locked(i);Object.assign(i,place(d,data,i));if(data.rotation!==undefined)i.rotation=data.rotation;if(data.z!==undefined)i.zIndex=data.z;if(i.assetID)baseline(i);}
function remove(d,keys){for(const key of keys){const target=find(d,key);locked(target);for(const field of fields)d[field]=d[field].filter(i=>i!==target);}}
function permission(options,asset){return craftPermission(options,asset);}
function process(d,item,asset,operations,mode,options){
  locked(item);let current=mode==='replace'?{x:0,y:0,width:1,height:1}:cropOf(item),mask=mode==='replace'?null:item.materialMask||null;
  const steps=mode==='replace'?[]:structuredClone(item.materialSteps||[]);
  if(steps.length+operations.length>12)throw Error('连续工序不得超过12步');
  for(const op of operations){
    if(op.op==='whole'){steps.push(op);continue;}
    if(permission(options,asset)==='保留完整')throw Error(asset.title+' 设置为保留完整，不允许加工');
    if(op.op==='edge'){
      if(mask)throw Error('参数化边缘应先于开窗；修改边缘请 replace 重放完整工序');
      mask=buildCraftEdge(op,current.width*asset.physicalWidthMM,current.height*asset.physicalHeightMM);
      if(permission(options,asset)==='少量裁剪'&&current.width*current.height*materialMaskArea(mask)<.6-EPS)throw Error(asset.title+' 仅允许少量裁剪，须保留至少60%面积');
      steps.push(structuredClone(op));continue;
    }
    if(op.op==='mask'){
      if(mask)throw Error('一个素材片段只能使用一道可见边缘工序');
      mask={shape:op.shape,...(op.shape==='polygon'?{points:structuredClone(op.points)}:op.shape==='rounded'?{radius:op.radius??.1}:{depth:op.depth??.05,waves:op.waves??8})};
      materialMaskPoints(mask);
      if(permission(options,asset)==='少量裁剪'&&current.width*current.height*materialMaskArea(mask)<.6-EPS)throw Error(asset.title+' 仅允许少量裁剪，须保留至少60%面积');
      steps.push(structuredClone(op));continue;
    }
    if(op.op==='diagonal'){
      mask=cutMaterialDiagonal(mask,op.from,op.to,op.keep);
      if(permission(options,asset)==='少量裁剪'&&current.width*current.height*materialMaskArea(mask)<.6-EPS)throw Error(asset.title+' 仅允许少量裁剪，须保留至少60%面积');
      steps.push(structuredClone(op));continue;
    }
    if(op.op==='window'){
      if(op.box[2]*current.width*asset.physicalWidthMM<2-EPS||op.box[3]*current.height*asset.physicalHeightMM<2-EPS)throw Error('开窗宽高不得小于 2 mm');
      mask=addMaterialWindow(mask,{shape:op.shape,box:op.box});
      if(permission(options,asset)==='少量裁剪'&&current.width*current.height*materialMaskArea(mask)<.6-EPS)throw Error(asset.title+' 仅允许少量裁剪，须保留至少60%面积');
      steps.push(structuredClone(op));continue;
    }
    if(mask)throw Error('外轮廓和开窗之后不能再改变来源裁片；请先裁片，再加工边缘');
    if(op.finish&&(op.finish.line!=='straight'||op.finish.corner!=='square'||op.finish.depthMM!==0||op.finish.radiusMM!==0))throw Error('尚未实现波浪、撕边或圆角加工');
    if(op.angle)throw Error('尚未实现斜向裁切');
    const wMM=current.width*asset.physicalWidthMM,hMM=current.height*asset.physicalHeightMM;
    let r={x:0,y:0,width:1,height:1};
    if(op.op==='crop'){
      if(op.box.mode!=='keep')throw Error('尚未实现负形裁片');
      const [x,y,w,h]=op.box.values;r=op.box.unit==='mm'?{x:x/wMM,y:y/hMM,width:w/wMM,height:h/hMM}:{x,y,width:w,height:h};
    }else if(op.op==='trim'){
      const horizontal=['left','right'].includes(op.edge),extent=horizontal?wMM:hMM,value=op.quantity.unit==='mm'?op.quantity.value/extent:op.quantity.value;
      finite(value,'修边比例',0,1);const cut=op.quantity.mode==='remove'?value:1-value;
      if(horizontal){r.width=1-cut;if(op.edge==='left')r.x=cut;}else{r.height=1-cut;if(op.edge==='top')r.y=cut;}
    }else if(op.op==='tape'){
      if(asset.kind!=='tape')throw Error('tape 仅适用于已登记胶带');
      const horizontal=asset.physicalWidthMM>=asset.physicalHeightMM,extent=horizontal?wMM:hMM,start=op.unit==='mm'?op.start/extent:op.start,length=op.unit==='mm'?op.length/extent:op.length;
      if(horizontal)r={x:start,y:0,width:length,height:1};else r={x:0,y:start,width:1,height:length};
      // Each piece keeps the calibrated width and a real source segment;
      // tape can be cut repeatedly from a continuous roll without stretching.
    }else throw Error('尚未实现工序 '+op.op);
    assertRect(r);current={x:current.x+r.x*current.width,y:current.y+r.y*current.height,width:current.width*r.width,height:current.height*r.height};assertRect(current);
    if(current.width*asset.physicalWidthMM<2-EPS||current.height*asset.physicalHeightMM<2-EPS)throw Error('裁片短边不得小于 2 mm');
    if(permission(options,asset)==='少量裁剪'&&current.width*current.height<.6-EPS)throw Error(asset.title+' 仅允许少量裁剪，须保留至少60%面积');steps.push(structuredClone(op));
  }
  item.cropRect=current.width===1&&current.height===1&&current.x===0&&current.y===0?null:current;
  item.materialMask=mask;
  item.width=current.width*asset.physicalWidthMM*scale(d);item.height=current.height*asset.physicalHeightMM*scale(d);
  item.materialSteps=steps;item.operation=steps.at(-1)||{op:'whole'};baseline(item);
}
function addMaterials(d,assets,aliases,list){
  const output=[];
  for(const entry of list){
    const asset=materialAsset(assets,aliases,entry.asset),unit=entry.unit??0,piece=entry.piece||'p-'+entry.asset+'-'+unit;
    let item=d.items.find(i=>keyOf(i)===piece);
    if(!entry.piece&&!item)item=d.items.find(i=>i.assetID===asset.id&&(i.materialUnitIndex??0)===unit&&!i.cropRect);
    if(item){locked(item);if(item.assetID!==asset.id)throw Error('不能改变已有片段来源：'+piece);if(entry.unit!==undefined&&item.materialUnitIndex!==unit)throw Error('不能改变已有片段库存单位');}
    else{if(index(d).has(piece))throw Error('图层编号已被占用：'+piece);item=itemFromAsset(asset,d,0,0,entry.z??10+d.items.length,true);item.creativePieceID=piece;item.materialUnitIndex=unit;d.items.push(item);}
    Object.assign(item,place(d,entry));if(entry.rotation!==undefined)item.rotation=entry.rotation;if(entry.z!==undefined)item.zIndex=entry.z;if(entry.role!==undefined)item.creativeRole=entry.role;if(entry.opacity!==undefined)item.opacity=entry.opacity;if(entry.flip_horizontal!==undefined)item.isFlippedHorizontally=entry.flip_horizontal;baseline(item);output.push(item);
  }return output;
}
function putTexts(d,list,options){if(options.textMode==='none'&&list.length)throw Error('本次创作设置为不新增文字图层');for(const t of list){
  const old=d.textBlocks.find(i=>keyOf(i)===t.key);if(old)locked(old);else if(index(d).has(t.key))throw Error('图层编号已被占用：'+t.key);
  const role=t.role||old?.role||'body',font=t.font_size??old?.fontSize??(role==='title'?58:role==='caption'?28:38),sizeUnit=t.size_unit||'ratio';
  const data={agentKey:t.key,content:t.content,...place(d,t,old),width:converted(t.width,sizeUnit,d,'width'),fontSize:font,style:t.font_style||t.style||old?.style||'serif',fontName:t.font_name??old?.fontName??null,color:t.color||old?.color||'#30463d',zIndex:t.z??old?.zIndex??900,role,rotation:t.rotation??old?.rotation??0,alignment:t.alignment||old?.alignment||'left',bold:t.bold??old?.bold??false,italic:t.italic??old?.italic??false,underline:t.underline??old?.underline??false,strikethrough:t.strikethrough??old?.strikethrough??false,opacity:t.opacity??old?.opacity??1,lineSpacing:t.line_spacing??old?.lineSpacing??0,fixedLineHeight:t.fixed_line_height??old?.fixedLineHeight??null,paragraphSpacing:t.paragraph_spacing??old?.paragraphSpacing??0,letterSpacing:t.letter_spacing??old?.letterSpacing??0};
  data.height=Math.max(t.height===undefined?0:converted(t.height,sizeUnit,d,'height'),layoutText(data,options).height);
  if(old)Object.assign(old,data);else d.textBlocks.push({id:uid(),...data});
}}
function putGraphics(d,list){for(const g of list){
  if(g.kind==='vector'&&!g.vector_paths?.length&&!g.vector_layers?.length)throw Error('自由矢量图形缺少 vector_paths 或 vector_layers');
  const old=d.primitives.find(i=>keyOf(i)===g.key);if(old)locked(old);else if(index(d).has(g.key))throw Error('图层编号已被占用：'+g.key);
  const data={key:g.key,kind:g.kind,...place(d,g,old),width:converted(g.width??.2,g.size_unit||'ratio',d,'width'),height:converted(g.height??.1,g.size_unit||'ratio',d,'height'),rotation:g.rotation??old?.rotation??0,zIndex:g.z??old?.zIndex??500,fill:Object.hasOwn(g,'fill')?g.fill:(g.kind==='frame'?null:'#e7eef7'),stroke:Object.hasOwn(g,'stroke')?g.stroke:'#547da4',lineWidth:g.line_width??old?.lineWidth??3,cornerRadius:g.corner_radius??old?.cornerRadius??.1,opacity:g.opacity??old?.opacity??1,vectorPaths:g.kind==='vector'&&g.vector_paths?structuredClone(g.vector_paths):undefined,vectorLayers:g.vector_layers?structuredClone(g.vector_layers):undefined,vectorSize:g.vector_layers?[1,1]:undefined};
  if(g.match_size_to){const target=find(d,g.match_size_to),[l,t,r,b]=g.padding_mm||[0,0,0,0],s=scale(d),angle=(target.rotation||0)*Math.PI/180,dx=(r-l)*s/2,dy=(b-t)*s/2;data.width=target.width+(l+r)*s;data.height=target.height+(t+b)*s;data.x=target.x+dx*Math.cos(angle)-dy*Math.sin(angle);data.y=target.y+dx*Math.sin(angle)+dy*Math.cos(angle);data.rotation=target.rotation||0;}
  else if(g.padding_mm)throw Error('padding_mm 需要 match_size_to');
  if(old)Object.assign(old,data);else d.primitives.push({id:uid(),...data});
}}
function putInk(d,list){for(const stroke of list){
  d.strokes||=[];
  d.strokes.push({id:uid(),agentGenerated:true,points:stroke.points.map(point=>({x:point.x*d.canvas.width,y:point.y*d.canvas.height,p:point.pressure??.5})),width:stroke.width,color:stroke.color,opacity:stroke.opacity??(stroke.pen_style==='marker'?.4:1),penStyle:stroke.pen_style});
}}
function clearGeneratedScene(d){
  d.items=d.items.filter(i=>!i.creativePieceID||i.isLocked||i.locked);
  d.textBlocks=d.textBlocks.filter(i=>!i.agentKey||i.isLocked||i.locked);
  d.primitives=d.primitives.filter(i=>!i.key||i.isLocked||i.locked);
  d.strokes=(d.strokes||[]).filter(i=>!i.agentGenerated||i.isLocked||i.locked);
}
function setPaper(d,a){if(a.color)d.paperColor=a.color;if(a.pattern)d.paperPattern=a.pattern==='lined'?'lines':a.pattern;if(a.intent)d.compositionIntent=a.intent;if(a.ruling!==undefined){const h=d.canvas.height,step=Math.max(4,a.ruling);d.paperRuling={rowPositions:Array.from({length:Math.ceil(h/step)-1},(_,i)=>(i+1)*step/h).filter(y=>y<1),spans:[{from:0,to:1}],color:'#d0d2d3',relativeLineWidth:1/h};}if(a.center_gutter!==undefined)d.drawCenterGutter=a.center_gutter;}
function relations(d,list){
  const updates=solveCraftRelations(entries(d),list,scale(d));
  for(const [key,update] of updates){const item=find(d,key);locked(item);const {materialRelation,...position}=update;Object.assign(item,position);if(materialRelation)item.materialRelation=materialRelation;else delete item.materialRelation;baseline(item);}
}
function upsertMaterials(d,assets,aliases,a,options){
  remove(d,a.remove||[]);
  for(const e of a.items){const [item]=addMaterials(d,assets,aliases,[{asset:e.asset,piece:e.piece,unit:e.unit,...e.placement,role:e.role,opacity:e.opacity,flip_horizontal:e.flip_horizontal}]);const asset=materialAsset(assets,aliases,e.asset);process(d,item,asset,e.operations,'replace',options);}relations(d,a.items);
}
function compose(d,assets,aliases,a,options){
  if(a.paper)setPaper(d,a.paper);const added=addMaterials(d,assets,aliases,a.materials||[]);
  for(let n=0;n<(a.materials||[]).length;n++){const e=a.materials[n],i=added[n];if(e.crop&&e.crop_px)throw Error('crop 与 crop_px 不能同时提供');let crop=e.crop;
    if(e.crop_px){const asset=assets.find(a=>a.id===i.assetID),size=options.sourceSizes?.[asset.id]||asset.imageSize;if(!size||!Number.isFinite(size.width)||!Number.isFinite(size.height)||size.width<=0||size.height<=0)throw Error('crop_px 需要已确认的源图像素尺寸');crop=e.crop_px.map((v,j)=>v/(j%2===0?size.width:size.height));}
    if(crop)process(d,i,assets.find(a=>a.id===i.assetID),[{op:'crop',box:{unit:'ratio',mode:'keep',values:crop}}],'replace',options);
  }putGraphics(d,a.graphics||[]);putTexts(d,a.texts||[],options);
}
function story(d,assets,aliases,a,options){
  const materialIDs=[a.focal,a.support,a.tape,a.ticket,a.illustration].filter(Boolean),unique=[...new Set(materialIDs)];
  const materials=unique.map((asset,n)=>({asset,piece:'story-p'+(n+1),x:n===0?.30:n===1?.69:n===2?.50:n===3?.20:.81,y:n<2?.41:n===2?.58:.62,rotation:0,z:n+10}));
  const texts=[{key:'story-title',content:a.title,role:'title',x:.5,y:.10,width:.86,font_size:52,color:a.ink,alignment:'center'},
    {key:'story-lead',content:a.lead,role:'body',x:.5,y:.22,width:.84,font_size:30,color:a.ink},
    {key:'story-note-1',content:a.notes[0],x:.27,y:.77,width:.40,font_size:28,color:a.ink},
    {key:'story-note-2',content:a.notes[1],x:.73,y:.77,width:.40,font_size:28,color:a.ink},
    {key:'story-microcopy',content:a.microcopy,role:'caption',x:.5,y:.93,width:.80,font_size:24,color:a.ink,alignment:'center'}];
  compose(d,assets,aliases,{materials,texts,graphics:[{key:'story-rule',kind:'line',x:.5,y:.88,width:.82,height:.008,stroke:a.accent,fill:null,line_width:2}],paper:{color:a.paper,pattern:a.grammar==='diary'?'lined':'plain'}},options);
}
function arrange(d,a){
  if(new Set(a.keys).size!==a.keys.length)throw Error('排列编号不能重复');const objects=a.keys.map(k=>find(d,k));objects.forEach(locked);const gap=(a.gap_mm??4)*scale(d),cols=a.mode==='row'?objects.length:a.mode==='column'?1:(a.columns??Math.ceil(Math.sqrt(objects.length))),rows=Math.ceil(objects.length/cols),sizes=objects.map(dimensions),colWidths=Array(cols).fill(0),rowHeights=Array(rows).fill(0);
  sizes.forEach((s,n)=>{colWidths[n%cols]=Math.max(colWidths[n%cols],s.width);rowHeights[Math.floor(n/cols)]=Math.max(rowHeights[Math.floor(n/cols)],s.height);});
  const totalW=colWidths.reduce((n,v)=>n+v,0)+(cols-1)*gap,totalH=rowHeights.reduce((n,v)=>n+v,0)+(rows-1)*gap,center=place(d,a),left=center.x-totalW/2,top=center.y-totalH/2;
  objects.forEach((i,n)=>{const col=n%cols,row=Math.floor(n/cols);i.x=left+colWidths.slice(0,col).reduce((n,v)=>n+v,0)+col*gap+colWidths[col]/2;i.y=top+rowHeights.slice(0,row).reduce((n,v)=>n+v,0)+row*gap+rowHeights[row]/2;if(i.assetID)baseline(i);});
}
function visibleBounds(i,assets,options){
  const a=assets.find(a=>a.id===i.assetID),bounds=options.visibleBounds?.[keyOf(i)]||options.visibleBounds?.[a?.id]||a?.visibleBounds;
  if(!bounds)return {rect:{x:0,y:0,width:1,height:1},known:!i.assetID,source:'nominal'};
  assertRect(bounds);const crop=cropOf(i),x=Math.max(crop.x,bounds.x),y=Math.max(crop.y,bounds.y),right=Math.min(crop.x+crop.width,bounds.x+bounds.width),bottom=Math.min(crop.y+crop.height,bounds.y+bounds.height);
  if(right<=x||bottom<=y)throw Error('素材可见边界为空');return {rect:{x:(x-crop.x)/crop.width,y:(y-crop.y)/crop.height,width:(right-x)/crop.width,height:(bottom-y)/crop.height},known:true,source:'scanned'};
}
function fitText(d,assets,a,options){
  const t=find(d,a.key),target=find(d,a.target);if(!d.textBlocks.includes(t))throw Error('fit_text_to 的 key 必须是文字');locked(t);
  const visible=a.visible_bounds===false?{rect:{x:0,y:0,width:1,height:1},known:true}:visibleBounds(target,assets,options);
  if(a.visible_bounds!==false&&target.assetID&&!visible.known)throw Error('尚无透明图可见边界；先检查素材，或明确 visible_bounds:false');
  const [l,top,r,b]=a.padding_mm||[2,2,2,2],s=scale(d),rect=visible.rect,width=target.width*rect.width-(l+r)*s,height=target.height*rect.height-(top+b)*s;
  if(width<=0||height<=0)throw Error('文字容器扣除边距后为空');t.width=width;t.fontSize=a.font_size??t.fontSize;if(a.color)t.color=a.color;
  let fit=layoutText(t,options);while(fit.height>height+EPS&&t.fontSize>8){t.fontSize=Math.max(8,t.fontSize-.5);fit=layoutText(t,options);}if(fit.height>height+EPS)throw Error('完整文字无法放入目标；请扩大容器或减少内容');
  const dx=target.width*(rect.x+rect.width/2-.5)+(l-r)*s/2,dy=target.height*(rect.y+rect.height/2-.5)+(top-b)*s/2,angle=(target.rotation||0)*Math.PI/180;
  t.x=target.x+dx*Math.cos(angle)-dy*Math.sin(angle);t.y=target.y+dx*Math.sin(angle)+dy*Math.cos(angle);t.height=height;t.rotation=target.rotation||0;
}
function inspect(d,assets,aliases,a,options){return {materials:a.keys.map(key=>{
  const item=d.items.find(i=>keyOf(i)===key||i.id===key),asset=item?assets.find(a=>a.id===item.assetID):materialAsset(assets,aliases,key),crop=item?cropOf(item):{x:0,y:0,width:1,height:1};
  const virtual=item||{assetID:asset.id,width:asset.physicalWidthMM*scale(d),height:asset.physicalHeightMM*scale(d),cropRect:null},visible=visibleBounds(virtual,assets,options);
  return {key,piece:item?keyOf(item):null,assetID:asset.id,cropRect:crop,widthMM:crop.width*asset.physicalWidthMM,heightMM:crop.height*asset.physicalHeightMM,sourceWidthMM:asset.physicalWidthMM,sourceHeightMM:asset.physicalHeightMM,visibleBounds:visible.rect,boundsKnown:visible.known,visibleWidthMM:crop.width*asset.physicalWidthMM*visible.rect.width,visibleHeightMM:crop.height*asset.physicalHeightMM*visible.rect.height,sourceDescription:[asset.title,asset.kind,asset.role,asset.texture,...(asset.tags||[])].filter(Boolean).join(' · '),sourceRef:{blobId:asset.blobId||null,staticPath:asset.staticPath||null},operations:structuredClone(item?.materialSteps||[])};
})};}
function finish(d,assets,a,options){
  for(const id of new Set([...(options.requiredAssetIDs||[]),...Object.keys(options.materialUseRequired||{}).filter(id=>options.materialUseRequired[id])])){
    const items=d.items.filter(i=>i.assetID===id&&!i.isParked&&!i.isHidden&&!i.hidden);if(!items.length)throw Error('必用素材尚未放入页面：'+(assets.find(a=>a.id===id)?.title||id));
    if(!items.some(i=>{
      const bounds=dimensions(i),left=Math.max(0,i.x-bounds.width/2),top=Math.max(0,i.y-bounds.height/2),right=Math.min(d.canvas.width,i.x+bounds.width/2),bottom=Math.min(d.canvas.height,i.y+bounds.height/2);
      if((i.opacity??1)<=0||right<=left||bottom<=top)return false;
      // Only a provably solid, axis-aligned rectangle can establish complete
      // occlusion here. Other overlapping layers, masks and half-hidden pieces
      // remain legal and are not judged by a page-fill quota.
      return !d.primitives.some(p=>p.kind==='rectangle'&&!p.hidden&&(p.opacity??1)===1&&(p.rotation??0)===0&&(p.zIndex??0)>(i.zIndex??0)&&/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(p.fill||'')&&p.x-p.width/2<=left+EPS&&p.y-p.height/2<=top+EPS&&p.x+p.width/2>=right-EPS&&p.y+p.height/2>=bottom-EPS);
    }))throw Error('必用素材在页面中完全不可见：'+(assets.find(a=>a.id===id)?.title||id));
    const hint=options.materialUseHints?.[id];if(['截段固定','取一块真实区域'].includes(hint)&&!items.some(i=>i.cropRect))throw Error('必做用法尚未裁切：'+hint);
    if(hint==='完整保留'&&items.some(i=>i.cropRect))throw Error('必做用法要求完整保留：'+(assets.find(a=>a.id===id)?.title||id));
  }checkDraft(d,assets);const review=reviewCreativeDraft(d,{measureText:options.measureText});d.agentRun={...d.agentRun,status:'finished',note:a.summary||'',qualityNotes:review.warnings,visualReview:'最后修改后的画面需由代理另行审阅'};
}
function execute(d,assets,aliases,name,a,options){
  switch(name){
    case 'compose_story_page':story(d,assets,aliases,a,options);break;
    case 'compose_page':compose(d,assets,aliases,a,options);break;
    case 'compose_direct_page':validateValue(a,directPageContract);clearGeneratedScene(d);d.style=({'留白叙事':'airy','密集拼贴':'layered','杂志网格':'editorial','手作便签':'memo','胶片日记':'film','自由构图':'free'})[a.style];setPaper(d,{...a.paper,intent:a.intent});upsertMaterials(d,assets,aliases,{items:a.items},options);putGraphics(d,a.graphics||[]);putTexts(d,a.text_blocks.map((t,n)=>({...t,key:'direct-t'+(n+1)})),options);putInk(d,a.ink_strokes||[]);finish(d,assets,{summary:a.intent||''},options);return {detail:'直接页已通过实物与必用约束并完成',mutation:true};
    case 'place_materials':addMaterials(d,assets,aliases,a.items);break;
    case 'edit_materials':for(const e of a.items){const item=find(d,e.piece);if(!d.items.includes(item))throw Error('加工目标必须是实物');process(d,item,assets.find(a=>a.id===item.assetID),e.operations,e.mode||'append',options);}break;
    case 'upsert_materials':upsertMaterials(d,assets,aliases,a,options);break;
    case 'move_elements':for(const e of a.items)setPosition(d,find(d,e.key),e);break;
    case 'arrange_elements':arrange(d,a);break;
    case 'fit_text_to':fitText(d,assets,a,options);break;
    case 'upsert_primitives':putGraphics(d,a.items);break;
    case 'upsert_text':putTexts(d,a.items,options);break;
    case 'delete_elements':remove(d,a.keys);break;
    case 'set_paper':setPaper(d,a);break;
    case 'inspect_materials':return {detail:'已检查 '+a.keys.length+' 件素材',data:inspect(d,assets,aliases,a,options),mutation:false};
    case 'finish_design':finish(d,assets,a,options);return {detail:'方案完成',mutation:true};
    default:throw Error('未知工具 '+name);
  }checkDraft(d,assets);if(d.agentRun?.status==='finished')d.agentRun.status='editing';return {detail:'已执行 '+name,mutation:true};
}
// Legacy local imports remain accepted without advertising unsupported provider fields.
function legacyArgs(name,args){const a=structuredClone(args),warnings=[];
  if(name==='place_materials')for(const e of a.items||[])for(const k of ['width','height'])if(Object.hasOwn(e,k)){delete e[k];warnings.push('忽略模型提供的实物'+k+'，使用素材库毫米尺寸');}
  if(name==='upsert_text')for(const e of a.items||[])if(e.fontSize!==undefined){e.font_size=e.fontSize;delete e.fontSize;}
  if(name==='edit_materials')for(const e of a.items||[])e.operations=(e.operations||[]).map(op=>{
    if(!op.type)return op;
    if(op.type==='useWhole'){if(Object.keys(op).some(k=>k!=='type'))throw Error('whole 工序含未知字段');e.mode='replace';return {op:'whole'};}
    if(op.type!=='rectangularCut')throw Error('尚未实现 '+op.type+' 图像加工');
    if(Object.keys(op).some(k=>!['type','cropRect','cropRectMM'].includes(k)))throw Error('裁切工序含未实现字段');if(op.cropRect&&op.cropRectMM)throw Error('裁切坐标不能重复提供');const rect=op.cropRectMM||op.cropRect;if(!rect)throw Error('缺少裁切范围');return {op:'crop',box:{unit:op.cropRectMM?'mm':'ratio',mode:'keep',values:[rect.x,rect.y,rect.width,rect.height]}};
  });return {args:a,warnings};
}
export function normalizeCalls(raw){
  const input=typeof raw==='string'?JSON.parse(raw):raw;if(input?.version===3)return directPageToTools(input);
  const list=Array.isArray(input)?input:input?.tools||input?.tool_calls||input?.choices?.[0]?.message?.tool_calls;
  if(!Array.isArray(list))throw Error('未找到 tools / tool_calls 数组或Swift v3页面');
  return list.map(x=>({name:x.name||x.function?.name,arguments:x.arguments??x.function?.arguments??{},id:x.id||uid()}));
}
export function applyToolCalls(source,base,assets,aliases={},options={}){
  const calls=normalizeCalls(source),draft=structuredClone(base),results=[];let mutated=false;
  for(const field of fields)draft[field]||=[];
  // A failed retry is no longer a completed AI run, even though its scene
  // layers remain atomic and unchanged. This status is not a scene mutation.
  if(calls.some(c=>c.name!=='inspect_materials')&&draft.agentRun?.status==='finished')draft.agentRun.status='editing';
  for(let n=0;n<calls.length;n++){
    const call=calls[n],snapshot=structuredClone(draft);
    try{
      if(n>=12)throw Error('每轮最多12个工具调用；此前成功调用已保留');
      if(call.name==='finish_design'&&(n!==calls.length-1||results.some(r=>!r.ok)))throw Error('finish_design 必须是最后调用，且本轮前序调用全部成功');
      const raw=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments,{args,warnings}=legacyArgs(call.name,raw);
      if(call.name==='compose_direct_page')validateValue(args,directPageContract);else validateTool(call.name,args);
      const outcome=execute(draft,assets,aliases,call.name,args,options);mutated||=outcome.mutation;results.push({id:call.id||uid(),name:call.name,ok:true,detail:outcome.detail,...(outcome.data?{data:outcome.data}:{}),...(warnings.length?{warnings}:{})});
    }catch(error){for(const k of Object.keys(draft))delete draft[k];Object.assign(draft,snapshot);results.push({id:call.id||uid(),name:call.name,ok:false,detail:error.message});}
  }return {draft,results,committed:mutated};
}
