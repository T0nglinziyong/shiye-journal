// Fast whole-page material box discovery.
//
// This module ONLY answers: where are the material objects and how many are
// there? It does not produce a final cutout mask and does not call any boundary
// segmentation engine.
//
// Input is a full-page foreground-evidence mask discovered from the real image.
// Pipeline:
//   light physical closing -> connected components -> conservative filtering
//   -> absorb tiny internal fragments -> robust detection-box adjustment.
//
// Two geometry-only adjustments handle the recurring real-image failure modes:
// 1) pale/white carriers with sparse strong seeds get a small physical safety
//    margin so their box contains the carrier, not only printed content;
// 2) a high-fill component touching the rectified frame may include a broad
//    page-edge residue. Dense row/column support recovers the main body box.
// Neither rule uses material class labels or ground-truth coordinates.

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const containsCenter=(outer,inner,margin=0)=>{
  const x=inner.x+inner.w/2,y=inner.y+inner.h/2;
  return x>=outer.x-margin&&x<=outer.x+outer.w+margin
    &&y>=outer.y-margin&&y<=outer.y+outer.h+margin;
};
function oddPhysical(pxPerMM,mm,min=3,max=15){
  let n=Math.max(min,Math.min(max,Math.round(pxPerMM*mm)));
  if(!(n&1))n++;
  return n;
}
function metrics(stats,label,w,h,paperWidthMM,paperHeightMM,pxPerMM){
  const base=label*5,x=stats.data32S[base],y=stats.data32S[base+1],
    bw=stats.data32S[base+2],bh=stats.data32S[base+3],pixels=stats.data32S[base+4],
    widthMM=bw/w*paperWidthMM,heightMM=bh/h*paperHeightMM,
    safeBand=Math.max(2,Math.round(pxPerMM*3)),
    touchesProtected=x<=safeBand||y<=safeBand||x+bw>=w-safeBand||y+bh>=h-safeBand;
  return {label,x,y,w:bw,h:bh,pixels,widthMM,heightMM,touchesProtected,evidenceN:0,seedN:0};
}
// A single irregular cutout can create two substantial connected components
// whose bounding boxes overlap almost completely. The old small-fragment
// rule (<=15% area) missed these duplicate instances.
export function duplicatePhysicalBox(a,b){
  const x0=Math.max(a.x,b.x),y0=Math.max(a.y,b.y),
    x1=Math.min(a.x+a.w,b.x+b.w),y1=Math.min(a.y+a.h,b.y+b.h),
    intersection=Math.max(0,x1-x0)*Math.max(0,y1-y0),
    smaller=Math.max(1,Math.min(a.w*a.h,b.w*b.h));
  // Require near-containment, not ordinary intersection: two adjacent or
  // overlapping physical materials should never be collapsed based on IoU.
  return intersection/smaller>=.80;
}
// Fragmented die-cut subjects (e.g. the basketball silhouette) may have a
// detached arm/ball cluster whose *bounding* intersection changes with A4
// corner rounding. Merge only if BOTH regions are sparse silhouettes and the
// smaller component's center remains within the larger physical silhouette.
// Never merge ordinary rectangular cards or merely adjacent materials.
export function duplicateSparseCutout(parent,child,pxPerMM=3){
  if((parent.fillRatio??1)>.48||(child.fillRatio??1)>.48)return false;
  if((child.pixels??Infinity)>(parent.pixels??0)*.75)return false;
  const overlapX=Math.max(0,Math.min(parent.x+parent.w,child.x+child.w)-Math.max(parent.x,child.x));
  const overlapY=Math.max(0,Math.min(parent.y+parent.h,child.y+child.h)-Math.max(parent.y,child.y));
  const overlap=overlapX*overlapY/Math.max(1,Math.min(parent.w*parent.h,child.w*child.h));
  return overlap>=.35&&containsCenter(parent,child,Math.max(2,pxPerMM*3));
}
export function likelyNeutralPageArtifact(item){
  // Weak, almost seed-free neutral background residue should not become a
  // material. Non-neutral/pale carriers keep chromatic evidence even when
  // printed details are sparse.
  return item.seedDensity<.003&&item.evidenceDensity<(item.touchesProtectedFrame?.08:.035)
    &&(item.fillRatio<.55||item.touchesProtectedFrame===true);
}
export function likelyFrameDebris(item,pageW,pageH,pxPerMM){
  // A photographed paper edge can leave a long, sparse coloured strip just
  // inside the frame after perspective interpolation. It has enough ink to
  // pass the ordinary evidence gate, but is too thin to be a physical item.
  const nearEdge=item.x<pageW*.05||item.y<pageH*.05
    ||item.x+item.w>pageW*.95||item.y+item.h>pageH*.95;
  const shortSide=Math.min(item.w,item.h),longSide=Math.max(item.w,item.h);
  return nearEdge&&shortSide<pxPerMM*10&&longSide/Math.max(1,shortSide)>4
    &&item.fillRatio<.28&&item.seedDensity<.035;
}
// Image-space angle (clockwise positive): select the shortest turn that makes
// one principal rectangle edge horizontal. Equal-length sides are allowed.
export function minimalHorizontalAngle(degrees){
  let angle=((degrees+45)%90+90)%90-45;
  return Math.abs(angle)<.8?0:angle;
}
function orientationFromInstance(cv,item,group,labels,pageW,pageH,rectangularityThreshold=.77){
  const pts=new cv.Mat(item.w*item.h,1,cv.CV_32SC2);
  let n=0;
  for(let y=item.y;y<item.y+item.h;y++)for(let x=item.x;x<item.x+item.w;x++){
    if(!group.has(labels.data32S[y*pageW+x]))continue;
    pts.data32S[n*2]=x;pts.data32S[n*2+1]=y;n++;
  }
  if(n<3){pts.delete();return null;}
  const points=pts.rowRange(0,n),r=cv.minAreaRect(points);
  points.delete();pts.delete();
  const area=Math.max(1,r.size.width*r.size.height),rectangularity=n/area;
  // OpenCV angle may refer to either edge: modulo 90 handles both.
  const rotation=minimalHorizontalAngle(r.angle);
  // If the minimal horizontal turn differs from the raw OpenCV angle by
  // a right angle, interchange side lengths to describe the SAME rectangle.
  const swap=Math.abs(rotation-r.angle)>45;
  return {centerX:r.center.x/pageW,centerY:r.center.y/pageH,
    width:(swap?r.size.height:r.size.width)/pageW,
    height:(swap?r.size.width:r.size.height)/pageH,
    rotation,rectangularity,
    autoDeskew:rectangularity>=rectangularityThreshold,
    source:'instance'};
}
function supportedRange(values,threshold){
  let first=-1,last=-1,count=0;
  for(let i=0;i<values.length;i++){
    if(values[i]>=threshold){
      if(first<0)first=i;
      last=i;count++;
    }
  }
  return count>=3?{first,last,count}:null;
}

export function discoverMaterialBoxes(cv,p,own){
  const w=p.width,h=p.height,paperWidthMM=p.paperWidthMM||210,
    paperHeightMM=p.paperHeightMM||297,smallestMM=p.smallestMM||6,
    pxPerMM=Math.max(.5,((w/paperWidthMM)+(h/paperHeightMM))/2),
    src=own(cv.matFromArray(h,w,cv.CV_8UC1,Uint8Array.from(p.mask||new Uint8Array(w*h),v=>v?255:0))),
    // Bridge a few pixels of interrupted pale edges before background gaps
    // split one physical material into separate components.
    closed=own(new cv.Mat()),closeSize=oddPhysical(pxPerMM,1.5),
    kernel=own(cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(closeSize,closeSize)));
  cv.morphologyEx(src,closed,cv.MORPH_CLOSE,kernel);

  const labels=own(new cv.Mat()),stats=own(new cv.Mat()),centroids=own(new cv.Mat()),
    count=cv.connectedComponentsWithStats(closed,labels,stats,centroids,8,cv.CV_32S),
    minPixels=Math.max(12,Math.round(pxPerMM*pxPerMM*smallestMM*smallestMM*.05)),
    raw=[];
  for(let label=1;label<count;label++){
    const item=metrics(stats,label,w,h,paperWidthMM,paperHeightMM,pxPerMM);
    if(item.pixels<minPixels)continue;
    if(Math.min(item.widthMM,item.heightMM)<smallestMM)continue;
    if(item.w>w*.96||item.h>h*.96)continue;
    raw.push(item);
  }

  const byLabel=new Map(raw.map(item=>[item.label,item]));
  for(let i=0;i<w*h;i++){
    const item=byLabel.get(labels.data32S[i]);if(!item)continue;
    if(p.evidence?.[i])item.evidenceN++;
    if(p.foregroundSeeds?.[i])item.seedN++;
  }
  for(const item of raw){
    item.evidenceDensity=item.evidenceN/Math.max(1,item.pixels);
    item.seedDensity=item.seedN/Math.max(1,item.pixels);
    item.fillRatio=item.pixels/Math.max(1,item.w*item.h);
    item.touchesProtectedFrame=item.touchesProtected;
  }

  // A closed background-flood island is not automatically a material. Real
  // objects still need a small amount of direct visual support (colour, ink,
  // highlight or physical edge). This rejects paper wrinkles/shadow pockets
  // that are topologically enclosed but contain essentially no material signal.
  const pageArea=w*h;
  let candidates=raw.filter(item=>{
    const minimumEvidence=Math.max(12,Math.ceil(item.pixels*.004));
    if(item.evidenceN<minimumEvidence)return false;
    if(!item.touchesProtected)return true;
    const shortMM=Math.min(item.widthMM,item.heightMM),
      longFraction=Math.max(item.w/w,item.h/h),
      smallAtFrame=item.pixels<pageArea*.004
        ||shortMM<Math.max(10,smallestMM*1.6),
      longThinFrameStrip=longFraction>.42&&shortMM<15;
    return !(smallAtFrame||longThinFrameStrip);
  });

  candidates=candidates.filter(item=>!likelyNeutralPageArtifact(item)
    &&!likelyFrameDebris(item,w,h,pxPerMM));

  // Tiny disconnected islands whose centers sit inside a much larger object's
  // box are not separate materials. Keep their pixels associated with the
  // parent for robust geometry, but do not increase object count.
  candidates.sort((a,b)=>b.pixels-a.pixels);
  const suppressed=new Set(),fragments=new Map();
  for(let i=0;i<candidates.length;i++){
    const parent=candidates[i];if(suppressed.has(parent.label))continue;
    for(let j=i+1;j<candidates.length;j++){
      const child=candidates[j];if(suppressed.has(child.label))continue;
      const ratio=child.pixels/Math.max(1,parent.pixels);
      if((ratio<=.15&&containsCenter(parent,child,Math.round(pxPerMM*1.0)))
        ||duplicatePhysicalBox(parent,child)
        ||(p.mergeSharedCarrier!==false&&duplicateSparseCutout(parent,child,pxPerMM))){
        suppressed.add(child.label);
        if(!fragments.has(parent.label))fragments.set(parent.label,[]);
        fragments.get(parent.label).push(child.label);
      }
    }
  }
  candidates=candidates.filter(item=>!suppressed.has(item.label));

  const out=[];
  for(const item of candidates){
    const group=new Set([item.label,...(fragments.get(item.label)||[])]),
      rowCounts=new Uint32Array(item.h),colCounts=new Uint32Array(item.w),colSeeds=new Uint32Array(item.w);
    let groupedPixels=0,groupEvidence=0,groupSeeds=0;
    for(let yy=0;yy<item.h;yy++)for(let xx=0;xx<item.w;xx++){
      const at=(item.y+yy)*w+item.x+xx;
      if(!group.has(labels.data32S[at]))continue;
      rowCounts[yy]++;colCounts[xx]++;groupedPixels++;
      if(p.evidence?.[at])groupEvidence++;
      if(p.foregroundSeeds?.[at]){groupSeeds++;colSeeds[xx]++;}
    }
    const fill=groupedPixels/Math.max(1,item.w*item.h),
      seedDensity=groupSeeds/Math.max(1,groupedPixels),
      evidenceDensity=groupEvidence/Math.max(1,groupedPixels);

    let x0=item.x,y0=item.y,x1=item.x+item.w,y1=item.y+item.h,
      boxAdjustment='raw';

    // High-fill material touching the page frame: use only columns/rows that
    // are almost fully occupied by the same component. This rejects broad
    // frame/background residue without relying on a class-specific rectangle.
    if(item.touchesProtected&&fill>=.70){
      // Perspective interpolation and binder holes lower occupancy. A strict
      // 96% core can retain only the opaque centre of a patterned sheet, so
      // use the same 70% support threshold at every analysis resolution.
      const occupancyThreshold=.70,
        colOcc=Array.from(colCounts,v=>v/Math.max(1,item.h)),
        rowOcc=Array.from(rowCounts,v=>v/Math.max(1,item.w)),
        xr=supportedRange(colOcc,occupancyThreshold),yr=supportedRange(rowOcc,occupancyThreshold),
        pad=Math.max(1,pxPerMM*1.5);
      if(xr){x0=clamp(item.x+xr.first-pad,0,w);x1=clamp(item.x+xr.last+1+pad,0,w);}
      if(yr){y0=clamp(item.y+yr.first-pad,0,h);y1=clamp(item.y+yr.last+1+pad,0,h);}
      // Page residue may occupy most columns even after the dense-body test.
      // For a strongly printed sheet, foreground seeds locate the real body
      // while the neutral page/shadow extension contains essentially none.
      let seededBody=false;
      if(seedDensity>.2){
        const seeded=supportedRange(colSeeds,Math.max(3,item.h*.12));
        if(seeded&&seeded.last-seeded.first+1>=item.w*.45){
          x0=clamp(item.x+seeded.first-pad,0,w);
          x1=clamp(item.x+seeded.last+1+pad,0,w);
          seededBody=true;
        }
      }
      if(xr||yr||seededBody)boxAdjustment='dense-frame-body';
    // Sparse strong seeds inside a medium/low-fill component are the common
    // signature of printed content on a pale carrier. Add a small physical
    // safety margin so downstream segmentation sees the outer carrier too.
    }else if(fill<.80&&seedDensity<.12){
      const pad=pxPerMM*2.0;
      x0=clamp(x0-pad,0,w);y0=clamp(y0-pad,0,h);
      x1=clamp(x1+pad,0,w);y1=clamp(y1+pad,0,h);
      boxAdjustment='pale-carrier-margin';
    }

    const bw=Math.max(1,x1-x0),bh=Math.max(1,y1-y0);
    // Once frame residue has been trimmed, the raw connected component's
    // minAreaRect still includes that residue. Never seed a segmenter from it.
    const orientedBox=boxAdjustment==='dense-frame-body'?null
      :orientationFromInstance(cv,item,group,labels,w,h);
    out.push({
      x:x0/w,y:y0/h,w:bw/w,h:bh/h,
      orientedBox,
      pixels:groupedPixels,
      instanceMethod:'connected-component-box',
      boxAdjustment,
      rawBox:{x:item.x/w,y:item.y/h,w:item.w/w,h:item.h/h},
      fillRatio:fill,evidenceDensity,seedDensity,
      touchesProtectedFrame:item.touchesProtected,
      absorbedFragments:(fragments.get(item.label)||[]).length
    });
  }
  return out.sort((a,b)=>a.y-b.y||a.x-b.x).slice(0,48);
}

