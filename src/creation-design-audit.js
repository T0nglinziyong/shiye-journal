// Advisory geometry diagnostics. A frame-covered cell is NOT proof of visible
// ink or aesthetic completeness (transparent cutouts, paper interiors, masks).
import {worldBox} from './scene-spatial.js';
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
 if(types.material<=2)observations.push('素材少：文字块、艺术标题、几何底色与矢量可以担当主体，不要把它们限为点缀。');
 if(types.text>1&&Math.max(...fontSizes)-Math.min(...fontSizes)<2)observations.push('文字字号接近：看真实 PNG 是否仍有标题、正文与插话的视觉层级。');
 if(fontSizes.length&&Math.max(...fontSizes)<11)observations.push('所有新增文字都偏小：核对整页正常显示时的可读性，优先重排而不是继续缩字。');
 if(!types.ink&&!types.shape)observations.push('没有新增图形或笔迹：检查小素材/印刷字是否已经提供层次；若仍平铺或孤立，进入点缀与连接阶段，不机械凑数量。');
 const graphicKinds=[...new Set(entries.filter(entry=>entry.type==='shape').map(entry=>entry.kind||'unknown'))].sort();
 const graphicBoxes=boxes.filter(box=>box.type==='shape'||box.type==='ink');
 const graphicPages=Object.fromEntries(pages.map(page=>[page.page,0]));
 for(const box of graphicBoxes){const index=Math.min(nPages-1,Math.max(0,Math.floor((box.x+box.width/2)/perPage)));graphicPages[pages[index].page]++;}
 const graphicVocabulary={kinds:graphicKinds,inkStrokes:types.ink,pages:graphicPages};
 const graphicScale={maxWidthFraction:0,maxHeightFraction:0};
 for(const box of graphicBoxes){graphicScale.maxWidthFraction=Math.max(graphicScale.maxWidthFraction,Math.min(1,box.width/perPage));graphicScale.maxHeightFraction=Math.max(graphicScale.maxHeightFraction,Math.min(1,box.height/page.canvas.height));}
 for(const key of Object.keys(graphicScale))graphicScale[key]=Number(graphicScale[key].toFixed(3));
 // A long, faint marker is not a large filled visual block. Estimate painted
 // area separately from bounding boxes so one swoop cannot silence feedback.
 const painted=entries.reduce((total,node)=>{
  if(node.type==='ink'){
   const length=(node.points||[]).slice(1).reduce((sum,point,index)=>sum+Math.hypot(point.x-node.points[index].x,point.y-node.points[index].y),0);
   return total+length*(node.width||0)*(node.opacity??1);
  }
  if(node.type==='shape'){
   const box=boxes.find(item=>item.id===node.id),filled=node.fill!=null?box.width*box.height:0;
   const outlined=node.stroke!=null?2*(box.width+box.height)*(node.lineWidth||0):0;
   return total+(filled+outlined)*(node.opacity??1);
  }
  return total;
 },0);
 const estimatedGraphicPaintFraction=Number(Math.min(1,painted/(page.canvas.width*page.canvas.height)).toFixed(4));
 if(styles.includes('丰富层叠')&&!types.ink&&graphicKinds.every(kind=>['rectangle','ellipse','line','frame'].includes(kind)))observations.push('丰富层叠目前仅使用基础圆、矩形或直线，没有可编辑笔迹或来自本次素材形状的图形：打开 PNG 检查是否缺少阅读路线、纸边连接或局部手绘回应；先试画再比较，若现有印刷图案已承担这些作用可以保留，不要为消除提示随机加星星。');
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
  return {assetAlias:material?.alias||null,title:material?.title||null,journalRoles:material?.journalRoles||[],estimatedPageFrameFraction:Number((box.width*box.height/pageArea).toFixed(3)),annotationFrames:hits.length,estimatedAnnotationFrameFraction:Number((Math.min(1,hits.reduce((sum,area)=>sum+area,0)/(box.width*box.height))).toFixed(3))};
 });
 if(materialFrames.some(frame=>!frame.annotationFrames))observations.push('有大素材框没有文字、图形或笔迹相交：看真实 PNG 判断它是有内容的印刷主角，还是只充当未使用的整张底纸；后者应调整露出面积或建立具体图文关系。');
 if(materialFrames.some(frame=>frame.journalRoles.includes('headline')&&frame.estimatedPageFrameFraction>=.2)&&fontSizes.length&&Math.max(...fontSizes)<18)observations.push('现成印刷标题框占据较大页面面积，新增字级明显较轻：缩看 PNG 比较两者视觉重量；如果印刷字压住全部新增表达，调整露出范围、合法裁片或正文层级。');
 return {kind:'design-advisory',visualReviewPerformed:false,method:'24x32 rotated-frame AABB grid, approximate stroke/fill area and material-frame intersections; ignores actual alpha/masks and text glyph fill',limitations:'不是像素留白率或审美评分；笔触面积忽略真实纹理、透明材料和局部遮挡，图形尺度和类别不是质量或数量评分；背景纸框可能覆盖整页。不得据此声称已看图或强制填满。',layers:types,graphicVocabulary,graphicScale,estimatedGraphicPaintFraction,typography:{fontSizesPt:[...new Set(fontSizes.map(n=>Number(n.toFixed(2))))].sort((a,b)=>a-b),fontChoices:[...fonts],effects},pages,materialFrames,observations};
}
