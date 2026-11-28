import {creationPageRegions} from './creation-page-regions.js';
// Advisory geometry diagnostics. A frame-covered cell is NOT proof of visible
// ink or aesthetic completeness (transparent cutouts, paper interiors, masks).
import {worldBox} from './scene-spatial.js';
import {creationMarginIssues} from './creation-layout-guard.js';
export function auditCreationDesign(page,{materials=[],styles=[]}={}){
 const entries=[];
 const walk=nodes=>{for(const n of nodes){if(n.hidden||n.isHidden||n.isParked||n.parked||n.opacity===0)continue;if(n.type==='group')walk(n.children||[]);else entries.push(n);}};walk(page.layers);
 const s=page.canvas.height/page.physicalPageHeightMM,types={material:0,text:0,shape:0,ink:0},fontSizes=[],fonts=new Set(),effects={outline:0,gradient:0,shadow:0};
 const boxes=entries.map(n=>{types[n.type]=(types[n.type]||0)+1;if(n.type==='text'){fontSizes.push(n.fontSize/s*72/25.4);fonts.add(n.fontName||n.style||'default');if(n.textOutline)effects.outline++;if(n.textGradient)effects.gradient++;if(n.shadow)effects.shadow++;}
  const b=worldBox(page,n.id),a=b.rotation*Math.PI/180,w=Math.abs(Math.cos(a))*b.w+Math.abs(Math.sin(a))*b.h,h=Math.abs(Math.sin(a))*b.w+Math.abs(Math.cos(a))*b.h;
  return {id:n.id,type:n.type,assetID:n.assetID,x:b.cx-w/2,y:b.cy-h/2,width:w,height:h};
 });
 const nPages=page.pageMode==='spread'?2:1,perPage=page.canvas.width/nPages,pages=[];
 for(let p=0;p<nPages;p++){
  const columns=24,rows=32,cw=perPage/columns,ch=page.canvas.height/rows,left=p*perPage;
  const filled=Array.from({length:rows},()=>Array(columns).fill(false));
  for(const b of boxes){const minX=Math.max(0,Math.floor((b.x-left)/cw)),maxX=Math.min(columns-1,Math.floor((b.x+b.width-left)/cw)),minY=Math.max(0,Math.floor(b.y/ch)),maxY=Math.min(rows-1,Math.floor((b.y+b.height)/ch));for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++)filled[y][x]=true;}
  const heights=Array(columns).fill(0);let best={area:0,x:0,y:0,w:0,h:0};
  for(let y=0;y<rows;y++){for(let x=0;x<columns;x++)heights[x]=filled[y][x]?0:heights[x]+1;for(let x=0;x<columns;x++){let h=heights[x];for(let end=x;end<columns;end++){h=Math.min(h,heights[end]);const area=h*(end-x+1);if(area>best.area)best={area,x,y:y-h+1,w:end-x+1,h};}}}
  const occupied=filled.flat().filter(Boolean).length;
  pages.push({page:nPages===1?'page':p===0?'page.left':'page.right',estimatedFrameCoverage:Number((occupied/(rows*columns)).toFixed(3)),largestUncoveredRectangleMm:{x:(left+best.x*cw)/s,y:best.y*ch/s,width:best.w*cw/s,height:best.h*ch/s},uncoveredRectangleFraction:Number((best.area/(rows*columns)).toFixed(3))});
 }
 for(const p of pages)for(const k of Object.keys(p.largestUncoveredRectangleMm))p.largestUncoveredRectangleMm[k]=Number(p.largestUncoveredRectangleMm[k].toFixed(2));
 const observations=[];
 const marginIssues=creationMarginIssues({page,source:{sourceSnapshots:materials}});
 if(marginIssues.length)observations.push('外缘呼吸边不足：'+marginIssues.slice(0,8).map(issue=>`${issue.id}靠${issue.edge}边${issue.clearanceMm}mm（建议约${issue.desiredMm}mm）`).join('、')+'。只移动重要文字或大前景素材；底纸、胶带、小贴纸可有意贴边。需结合真实 PNG 核查可见轮廓。');
 const regions=creationPageRegions(page),gutter=regions.gutter;
 const gutterIntersections=gutter?boxes.filter(b=>['material','text'].includes(b.type)&&b.y<page.canvas.height&&b.y+b.height>0&&b.x<(gutter.x+gutter.width)*s&&b.x+b.width>gutter.x*s).map(b=>({id:b.id,type:b.type,crossesSeam:b.x<gutter.center*s&&b.x+b.width>gutter.center*s})):[];
 if(gutterIntersections.length)observations.push(`中缝安全带内有素材或文字（${gutterIntersections.map(b=>b.id+(b.crossesSeam?'：跨缝':'：靠缝')).join('、')}）：默认移回左右单页，连同关联文字/图案一起调整。若是透明空边、裁片遮罩或明确有意跨页，须看真实 PNG 确认；不得缩放实体来避让。`);

 if(types.material<=2)observations.push('素材少：文字块、艺术标题、几何底色与矢量可以担当主体，不要把它们限为点缀。');
 if(types.text>1&&Math.max(...fontSizes)-Math.min(...fontSizes)<2)observations.push('文字字号接近：看真实 PNG 是否仍有标题、正文与插话的视觉层级。');
 if(fontSizes.length&&Math.max(...fontSizes)<11)observations.push('所有新增文字都偏小：核对整页正常显示时的可读性，优先重排而不是继续缩字。');
 const narrowText=entries.filter(node=>node.type==='text'&&String(node.content||'').replace(/\s/g,'').length>=10).filter(node=>{
  const box=boxes.find(item=>item.id===node.id);
  return box&&box.width<Math.max(node.fontSize||0,1)*2.6;
 }).map(node=>node.id);
 if(narrowText.length)observations.push(`较长文字的文本框不足约 2.6 个字宽（${narrowText.join('、')}）：打开 PNG 检查是否挤成单字竖列；若不是有意的短竖批注，移到更宽的纸面或素材可写区，避免只缩小字号。`);
 const coveredText=[];
 for(let i=0;i<entries.length;i++){
  const node=entries[i],frame=boxes[i];
  if(node.type!=='text'||String(node.content||'').replace(/\s/g,'').length<6)continue;
  for(let j=i+1;j<entries.length;j++){
   const cover=entries[j],box=boxes[j];
   if(!((cover.type==='shape'&&cover.fill!=null)||(cover.type==='material'&&!cover.tapeStrip))||(cover.opacity??1)<.85)continue;
   const overlapW=Math.max(0,Math.min(frame.x+frame.width,box.x+box.width)-Math.max(frame.x,box.x));
   const overlapH=Math.max(0,Math.min(frame.y+frame.height,box.y+box.height)-Math.max(frame.y,box.y));
   if(overlapW>Math.max(7,(node.fontSize||8)*1.5)&&overlapH>Math.max(7,(node.fontSize||8)*1.2))coveredText.push({textId:node.id,coverId:cover.id,text:String(node.content||''),box:{x:frame.x,y:frame.y,width:frame.width,height:frame.height},overlapArea:overlapW*overlapH});
  }
 }
 if(coveredText.length)observations.push(`后放的素材或实心图形与已有文字外框明显相交（${coveredText.slice(0,5).map(item=>item.textId+' / '+item.coverId).join('、')}）：看真实 PNG 判断是否盖住字；若是，用 layer.stack/order 调层序、移动段落或调整叠放。透明孔洞与有意遮挡可能是误报。`);
 if(!types.ink&&!types.shape)observations.push('没有新增图形或笔迹：检查小素材/印刷字是否已经提供层次；若仍平铺或孤立，进入点缀与连接阶段，不机械凑数量。');
 // Full-bleed page grounds are paper, not hand-drawn decoration. Counting
 // them made a plain two-color spread appear to have abundant graphic paint.
 const foregroundGraphics=entries.flatMap((entry,index)=>{
  if(!['shape','ink'].includes(entry.type))return [];
  const box=boxes[index];
  // A large unoutlined colour card supports composition and writing; it is
  // not evidence that the page already has small decorative marks.
  if(entry.type==='shape'&&((box.width>=perPage*.85&&box.height>=page.canvas.height*.85)||
    (entry.kind==='path'&&entry.fill!=null&&entry.stroke==null&&box.width>=perPage*.32&&box.height>=page.canvas.height*.3)))return [];
  return [{entry,box}];
 });
 const graphicKinds=[...new Set(foregroundGraphics.filter(({entry})=>entry.type==='shape').map(({entry})=>entry.kind||'unknown'))].sort();
 const graphicBoxes=foregroundGraphics.map(({box})=>box);
 const graphicPages=Object.fromEntries(pages.map(page=>[page.page,0]));
 for(const box of graphicBoxes){const index=Math.min(nPages-1,Math.max(0,Math.floor((box.x+box.width/2)/perPage)));graphicPages[pages[index].page]++;}
 const graphicVocabulary={kinds:graphicKinds,inkStrokes:types.ink,pages:graphicPages};
 const graphicScale={maxWidthFraction:0,maxHeightFraction:0};
 for(const box of graphicBoxes){graphicScale.maxWidthFraction=Math.max(graphicScale.maxWidthFraction,Math.min(1,box.width/perPage));graphicScale.maxHeightFraction=Math.max(graphicScale.maxHeightFraction,Math.min(1,box.height/page.canvas.height));}
 for(const key of Object.keys(graphicScale))graphicScale[key]=Number(graphicScale[key].toFixed(3));
 // A long, faint marker is not a large filled visual block. Estimate painted
 // area separately from bounding boxes so one swoop cannot silence feedback.
 const painted=foregroundGraphics.reduce((total,{entry:node,box})=>{
  if(node.type==='ink'){
   const length=(node.points||[]).slice(1).reduce((sum,point,index)=>sum+Math.hypot(point.x-node.points[index].x,point.y-node.points[index].y),0);
   return total+length*(node.width||0)*(node.opacity??1);
  }
  if(node.type==='shape'){
   const filled=node.fill!=null?box.width*box.height:0;
   const outlined=node.stroke!=null?2*(box.width+box.height)*(node.lineWidth||0):0;
   return total+(filled+outlined)*(node.opacity??1);
  }
  return total;
 },0);
 const estimatedGraphicPaintFraction=Number(Math.min(1,painted/(page.canvas.width*page.canvas.height)).toFixed(4));
 const clusterAlignment=[];
 for(let p=0;p<nPages;p++){
  const left=p*perPage;
  const candidates=boxes.filter(box=>box.type==='material'&&box.x+box.width/2>=left&&box.x+box.width/2<left+perPage);
  const anchor=candidates.sort((a,b)=>b.width*b.height-a.width*a.height)[0];
  const body=entries.map((entry,index)=>({entry,box:boxes[index]})).filter(({entry,box})=>entry.type==='text'&&String(entry.content||'').replace(/\s/g,'').length>=35&&box.x+box.width/2>=left&&box.x+box.width/2<left+perPage).sort((a,b)=>String(b.entry.content).length-String(a.entry.content).length)[0];
  if(!anchor||!body)continue;
  const edgeOffset=(body.box.x-anchor.x)/perPage;
  const verticalGap=Math.max(0,Math.max(body.box.y,anchor.y)-Math.min(body.box.y+body.box.height,anchor.y+anchor.height))/page.canvas.height;
  clusterAlignment.push({page:nPages===1?'page':p?'page.right':'page.left',material:anchor.id,text:body.box.id,leftEdgeOffsetFraction:Number(edgeOffset.toFixed(2)),verticalGapFraction:Number(verticalGap.toFixed(2))});
  if(Math.abs(edgeOffset)>.1)observations.push(`${nPages===1?'本页':p?'右页':'左页'}长正文与最大素材的左边线相差约 ${Math.round(Math.abs(edgeOffset)*100)}% 页宽（${body.box.id} / ${anchor.id}）；缩看 PNG，确认它们是否由共同中心、遮挡或引导线组成一簇。若读起来脱节，移动正文或加有目的的短连接，不要只追求数值对齐。`);
  if(verticalGap>.1)observations.push(`${nPages===1?'本页':p?'右页':'左页'}长正文与最大素材在纵向相隔约 ${Math.round(verticalGap*100)}% 页高（${body.box.id} / ${anchor.id}）；缩看 PNG，确认中间是否有其他元素承接。若没有，先移动整段或主素材形成连续图文簇，再处理小点缀。`);
 }
 if(styles.includes('丰富层叠')&&estimatedGraphicPaintFraction<.007)observations.push('除整页底色外，新增装饰笔触与图形仍很轻；缩看 PNG 检查是否看得出与素材相呼应的星点、圆圈、线条或边角记号。若看不出，用当前配色在几个阅读转折处加入大小有别的可编辑装饰，而不是随机撒满。');
 if(styles.includes('丰富层叠')&&graphicBoxes.length&&!types.ink&&graphicKinds.every(kind=>['rectangle','ellipse','line','frame'].includes(kind)))observations.push('丰富层叠目前仅使用基础圆、矩形或直线，没有可编辑笔迹或来自本次素材形状的图形：打开 PNG 检查是否缺少阅读路线、纸边连接或局部手绘回应；先试画再比较，若现有印刷图案已承担这些作用可以保留，不要为消除提示随机加星星。');
 if(styles.includes('丰富层叠')&&graphicBoxes.length&&graphicScale.maxWidthFraction<.33&&graphicScale.maxHeightFraction<.22)observations.push('新增图形都局限在较小范围；它们可能只是在圈点和划短线。缩看真实 PNG：若主块仍像独立摆放的素材，先试一个从本次素材轮廓、方向或文字空间生长的承托/跨边/阅读路线图形，再决定是否保留。不要为消除提示放大无关图案。');
 if(styles.includes('丰富层叠')&&graphicBoxes.length&&estimatedGraphicPaintFraction<.007)observations.push('新增图形的估计笔触面积很轻；长而淡的色线也可能只留下细微痕迹。缩看真实 PNG，确认图形是否真正组织主块、与素材轮廓或书写内容建立关系；若没有，调整位置、形态和层级，别靠放大无关色块凑面积。');
 const frontMarkers=entries.flatMap((node,index)=>{
  if(node.type!=='ink'||node.penStyle!=='marker')return [];
  const mark=boxes[index];return entries.slice(0,index).flatMap((prior,priorIndex)=>{
   if(prior.type!=='text')return [];
   const target=boxes[priorIndex],width=Math.max(0,Math.min(mark.x+mark.width,target.x+target.width)-Math.max(mark.x,target.x)),height=Math.max(0,Math.min(mark.y+mark.height,target.y+target.height)-Math.max(mark.y,target.y));
   return width*height>0?[{marker:node.id,text:prior.id}]:[];
  });
 });
 if(frontMarkers.length)observations.push(`荧光笔在文字图层上方且外框相交（${frontMarkers.map(pair=>pair.marker+'→'+pair.text).join('、')}）：打开 PNG 核对是否遮字；若是背景高亮，用 order.before 指向文字并复核位置。外框相交不能证明实际笔迹遮字。`);
 if(styles.includes('丰富层叠')&&nPages===2&&graphicBoxes.length&&Object.values(graphicPages).some(count=>count===0))observations.push('新增图形与笔迹只在一页：打开 PNG 检查另一页是否已有足够的素材细节和阅读连接；若没有，从那页的实物轮廓或一句文字尝试局部回应，而不是机械补图形。');
 if(pages.some(p=>p.uncoveredRectangleFraction>.2))observations.push('存在较大的未覆盖框区域：在 PNG 上区分呼吸留白与未完成空洞；优先重分主块、文字或图形，避免随机填充。');
 const pageArea=perPage*page.canvas.height;
 const materialFrames=boxes.filter(box=>box.type==='material'&&box.width*box.height>=pageArea*.08).map(box=>{
  const hits=boxes.filter(other=>['text','shape','ink'].includes(other.type)).map(other=>{
   const width=Math.max(0,Math.min(box.x+box.width,other.x+other.width)-Math.max(box.x,other.x));
   const height=Math.max(0,Math.min(box.y+box.height,other.y+other.height)-Math.max(box.y,other.y));
   return width*height;
  }).filter(Boolean);
  const material=materials.find(item=>item.assetID===box.assetID);
  return {assetAlias:material?.alias||null,title:material?.title||null,estimatedPageFrameFraction:Number((box.width*box.height/pageArea).toFixed(3)),annotationFrames:hits.length,estimatedAnnotationFrameFraction:Number((Math.min(1,hits.reduce((sum,area)=>sum+area,0)/(box.width*box.height))).toFixed(3))};
 });
 if(materialFrames.some(frame=>!frame.annotationFrames))observations.push('有大素材框没有文字、图形或笔迹相交：看真实 PNG 判断它是有内容的印刷主角，还是只充当未使用的整张底纸；后者应调整露出面积或建立具体图文关系。');
 const lightlyUsed=materialFrames.filter(frame=>frame.estimatedPageFrameFraction>=.25&&frame.estimatedAnnotationFrameFraction<.12);
 if(lightlyUsed.length)observations.push(`大素材占据约四分之一页以上，新增图文只触及少量区域（${lightlyUsed.map(frame=>frame.assetAlias||frame.title||'未命名素材').join('、')}）：缩看真实 PNG，检查印刷字、截图界面或底纸是否盖过亲手写下的内容；若是，合法裁取或改变露出方式，把可写空间交还给内容。框级估算不代表实际可见面积。`);
 return {kind:'design-advisory',visualReviewPerformed:false,method:'24x32 rotated-frame AABB grid, approximate foreground stroke/fill area and material-frame intersections; ignores actual alpha/masks and text glyph fill',limitations:'不是像素留白率或审美评分；笔触面积忽略真实纹理、透明材料和局部遮挡，图形尺度和类别不是质量或数量评分；背景纸框可能覆盖整页。不得据此声称已看图或强制填满。',textCoverCandidates:coveredText,textRegions:entries.flatMap((node,index)=>node.type==='text'&&String(node.content||'').trim()? [{textId:node.id,text:String(node.content),box:boxes[index]}]:[]),regions,gutterIntersections,layers:types,graphicVocabulary,graphicScale,estimatedGraphicPaintFraction,clusterAlignment,typography:{fontSizesPt:[...new Set(fontSizes.map(n=>Number(n.toFixed(2))))].sort((a,b)=>a-b),fontChoices:[...fonts],effects},pages,materialFrames,observations};
}
