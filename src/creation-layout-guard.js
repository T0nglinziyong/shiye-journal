import {worldBox,setWorldPosition} from './scene-spatial.js';

// page.left/right use coordinates local to that leaf. Models sometimes give a
// spread-wide x while retaining page.right; normalize that unambiguous case.
export function normalizePageReferenceCoordinates(operations=[],page){
  if(page.pageMode!=='spread')return operations;
  const width=page.canvas.width*page.physicalPageHeightMM/page.canvas.height;
  const leaf=width/2;
  const visit=operation=>{
    const place=operation.place;
    if(place?.reference==='page.right'&&place.unit==='mm'&&Array.isArray(place.at)&&place.at[0]>=leaf&&place.at[0]<=width){
      place.reference='page';
    }
    for(const child of operation.children||[])visit(child);
  };
  operations.forEach(visit);
  return operations;
}

export function creationBoundaryIssues(document){
  const {page,source}=document,canvas=page.canvas,scale=canvas.height/page.physicalPageHeightMM;
  const leafWidth=canvas.width/(page.pageMode==='spread'?2:1);
  const aliases=new Map((source.materials||[]).map(item=>[item.assetID,item.alias]));
  const issues=[];
  const visit=nodes=>{
    for(const node of nodes||[]){
      if(node.hidden||node.isHidden||node.isParked||node.parked||node.opacity===0||node.surface&&node.surface!=='page')continue;
      if(node.type==='group'){visit(node.children);continue;}
      if(!['material','text','shape','ink'].includes(node.type))continue;
      const box=worldBox(page,node.id),angle=box.rotation*Math.PI/180;
      const width=Math.abs(Math.cos(angle))*box.w+Math.abs(Math.sin(angle))*box.h;
      const height=Math.abs(Math.sin(angle))*box.w+Math.abs(Math.cos(angle))*box.h;
      const left=box.cx-width/2,right=box.cx+width/2,top=box.cy-height/2,bottom=box.cy+height/2;
      const location=page.pageMode==='spread'?(box.cx<leafWidth?'左页':'右页'):'单页';
      const bounds={xMin:Number((width/(2*scale)).toFixed(1)),xMax:Number((leafWidth/scale-width/(2*scale)).toFixed(1)),yMin:Number((height/(2*scale)).toFixed(1)),yMax:Number(((canvas.height-height/2)/scale).toFixed(1))};
      const base={id:node.id,alias:aliases.get(node.assetID)||node.key||node.agentKey||node.id,type:node.type,location,bounds};
      if(page.pageMode==='spread'&&left<leafWidth-1&&right>leafWidth+1){
        const overlap=Math.min(right-leafWidth,leafWidth-left)/width;
        issues.push({...base,clipped:Number(overlap.toFixed(3)),limit:0,edge:'中缝'});
      }
      const insideWidth=Math.max(0,Math.min(right,canvas.width)-Math.max(left,0));
      const insideHeight=Math.max(0,Math.min(bottom,canvas.height)-Math.max(top,0));
      const clipped=1-insideWidth*insideHeight/(width*height);
      const limit=.01;
      if(clipped>limit+1e-6)issues.push({...base,clipped:Number(clipped.toFixed(3)),limit,edge:[left<0?'左':null,right>canvas.width?'右':null,top<0?'上':null,bottom>canvas.height?'下':null].filter(Boolean).join('')});
    }
  };
  visit(page.layers);
  return issues;
}

// A visible paper-colored rim is useful even in a dense collage. This is an
// advisory about substantial foreground objects, not a ban on deliberate
// tape/sticker bleed or on overlapping layers.
export function creationMarginIssues(document){
  const {page,source}=document,scale=page.canvas.height/page.physicalPageHeightMM;
  const leafWidth=page.canvas.width/(page.pageMode==='spread'?2:1);
  const issues=[];
  const visit=nodes=>{
    for(const node of nodes||[]){
      if(node.hidden||node.isHidden||node.isParked||node.parked||node.opacity===0||node.surface&&node.surface!=='page')continue;
      if(node.type==='group'){visit(node.children);continue;}
      if(!['material','text'].includes(node.type))continue;
      const box=worldBox(page,node.id),angle=box.rotation*Math.PI/180;
      const width=Math.abs(Math.cos(angle))*box.w+Math.abs(Math.sin(angle))*box.h;
      const height=Math.abs(Math.sin(angle))*box.w+Math.abs(Math.cos(angle))*box.h;
      if(node.type==='material'&&width*height<leafWidth*page.canvas.height*.07)continue;
      const left=box.cx-width/2,right=box.cx+width/2,top=box.cy-height/2,bottom=box.cy+height/2;
      const leaf=Math.max(0,Math.min(page.pageMode==='spread'?1:0,Math.floor(box.cx/leafWidth)));
      const outerLeft=leaf===0?left:Infinity,outerRight=leaf===(page.pageMode==='spread'?1:0)?page.canvas.width-right:Infinity;
      const distances={左:outerLeft,右:outerRight,上:top,下:page.canvas.height-bottom};
      const desired=node.type==='text'?6:4;
      for(const [edge,distance] of Object.entries(distances))if(distance<desired*scale)
        issues.push({id:node.id,type:node.type,edge,clearanceMm:Number((distance/scale).toFixed(1)),desiredMm:desired});
    }
  };
  visit(page.layers);
  return issues;
}

export function assertNoWorseningBoundary(before,after){
  const old=new Map(creationBoundaryIssues(before).map(issue=>[issue.id+':'+issue.edge,issue.clipped]));
  const worse=creationBoundaryIssues(after).filter(issue=>issue.clipped>(old.get(issue.id+':'+issue.edge)||0)+.001);
  if(worse.length)throw Error('对象越出所属单页：'+worse.map(issue=>`${issue.alias}（${issue.location}，${issue.edge}${issue.edge==='中缝'?'跨页':'侧裁切 '+Math.round(issue.clipped*100)+'%'}；中心坐标允许 x=${issue.bounds.xMin}–${issue.bounds.xMax}mm、y=${issue.bounds.yMin}–${issue.bounds.yMax}mm）`).join('、')+'。请按相应单页的本地毫米坐标整批重排；可以减少这次批次的对象，先看图再补。');
}

// Editing software normally snaps a slightly misplaced object back onto its
// sheet. Apply the same translation before rejecting a whole model batch. The
// object is never resized, so physical material dimensions remain intact.
export function constrainCreationToPages(before,after){
  const old=new Map(creationBoundaryIssues(before).map(issue=>[issue.id+':'+issue.edge,issue.clipped]));
  const issues=creationBoundaryIssues(after).filter(issue=>issue.clipped>(old.get(issue.id+':'+issue.edge)||0)+.001);
  const corrections=[];
  const seen=new Set();
  const {page}=after,scale=page.canvas.height/page.physicalPageHeightMM,leafWidth=page.canvas.width/(page.pageMode==='spread'?2:1);
  for(const issue of issues){
    if(seen.has(issue.id))continue;seen.add(issue.id);
    const box=worldBox(page,issue.id),angle=box.rotation*Math.PI/180;
    const width=Math.abs(Math.cos(angle))*box.w+Math.abs(Math.sin(angle))*box.h;
    const height=Math.abs(Math.sin(angle))*box.w+Math.abs(Math.cos(angle))*box.h;
    if(width>leafWidth+1||height>page.canvas.height+1)throw Error(`${issue.alias} 实际尺寸大于所属单页，无法平移入页；请合法裁切、调整朝向或留在暂存区`);
    const offset=issue.location==='右页'?leafWidth:0;
    const rim=Math.min(3*scale,Math.max(0,(leafWidth-width)/2),Math.max(0,(page.canvas.height-height)/2));
    const x=Math.min(leafWidth-width/2-rim,Math.max(width/2+rim,box.cx-offset))+offset;
    const y=Math.min(page.canvas.height-height/2-rim,Math.max(height/2+rim,box.cy));
    if(Math.hypot(x-box.cx,y-box.cy)<.01)continue;
    setWorldPosition(page,issue.id,{x,y});
    corrections.push({id:issue.id,alias:issue.alias,dxMm:Number(((x-box.cx)/scale).toFixed(1)),dyMm:Number(((y-box.cy)/scale).toFixed(1)),reason:issue.edge});
  }
  assertNoWorseningBoundary(before,after);
  return corrections;
}
