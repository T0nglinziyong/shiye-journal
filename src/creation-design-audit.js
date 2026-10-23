// Advisory geometry diagnostics. A frame-covered cell is NOT proof of visible
// ink or aesthetic completeness (transparent cutouts, paper interiors, masks).
import {worldBox} from './scene-spatial.js';
export function auditCreationDesign(page,{materials=[]}={}){
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
 if(pages.some(p=>p.uncoveredRectangleFraction>.2))observations.push('存在较大的未覆盖框区域：在 PNG 上区分呼吸留白与未完成空洞；优先重分主块、文字或图形，避免随机填充。');
 const pageArea=perPage*page.canvas.height;
 const materialFrames=boxes.filter(box=>box.type==='material'&&box.width*box.height>=pageArea*.08).map(box=>{
  const hits=boxes.filter(other=>['text','shape','ink'].includes(other.type)).map(other=>{
   const width=Math.max(0,Math.min(box.x+box.width,other.x+other.width)-Math.max(box.x,other.x));
   const height=Math.max(0,Math.min(box.y+box.height,other.y+other.height)-Math.max(box.y,other.y));
   return width*height;
  }).filter(Boolean);
  const material=materials.find(item=>item.assetID===box.assetID);
  return {assetAlias:material?.alias||null,title:material?.title||null,annotationFrames:hits.length,estimatedAnnotationFrameFraction:Number((Math.min(1,hits.reduce((sum,area)=>sum+area,0)/(box.width*box.height))).toFixed(3))};
 });
 if(materialFrames.some(frame=>!frame.annotationFrames))observations.push('有大素材框没有文字、图形或笔迹相交：看真实 PNG 判断它是有内容的印刷主角，还是只充当未使用的整张底纸；后者应调整露出面积或建立具体图文关系。');
 return {kind:'design-advisory',visualReviewPerformed:false,method:'24x32 rotated-frame AABB grid and material-frame intersections; ignores actual alpha/masks and text glyph fill',limitations:'不是像素留白率或审美评分；背景纸框可能覆盖整页，相交图层也可能被遮挡。不得据此声称已看图或强制填满。',layers:types,typography:{fontSizesPt:[...new Set(fontSizes.map(n=>Number(n.toFixed(2))))].sort((a,b)=>a-b),fontChoices:[...fonts],effects},pages,materialFrames,observations};
}
