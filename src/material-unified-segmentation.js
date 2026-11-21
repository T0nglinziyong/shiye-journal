import {orientedContourBox} from './material-orientation.js';

const clamp=(v,low,high)=>Math.max(low,Math.min(high,v));

function sharedGradient(cv,p){
  const resources=[],own=mat=>(resources.push(mat),mat);
  try{
    const src=own(cv.matFromArray(p.height,p.width,cv.CV_8UC4,p.pixels)),
      gray=own(new cv.Mat()),blur=own(new cv.Mat()),rgb=own(new cv.Mat()),
      lab=own(new cv.Mat()),channels=own(new cv.MatVector());
    cv.cvtColor(src,gray,cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray,blur,new cv.Size(3,3),.9);
    cv.cvtColor(src,rgb,cv.COLOR_RGBA2RGB);
    cv.cvtColor(rgb,lab,cv.COLOR_RGB2Lab);
    cv.split(lab,channels);
    const sobel=(source,axis)=>{
      const out=own(new cv.Mat());
      cv.Sobel(source,out,cv.CV_32F,axis==='x'?1:0,axis==='y'?1:0,3);
      return out.data32F;
    };
    const gx=sobel(blur,'x'),gy=sobel(blur,'y'),
      a=own(channels.get(1)),b=own(channels.get(2)),
      ax=sobel(a,'x'),ay=sobel(a,'y'),bx=sobel(b,'x'),by=sobel(b,'y'),
      gradient=new Float32Array(p.width*p.height);
    for(let i=0;i<gradient.length;i++){
      const grayStrength=Math.hypot(gx[i],gy[i])/56,
        chromaStrength=Math.max(Math.hypot(ax[i],ay[i]),Math.hypot(bx[i],by[i]))/50;
      gradient[i]=Math.min(1,Math.max(grayStrength,chromaStrength));
    }
    return gradient;
  }finally{for(const mat of resources.reverse())mat.delete();}
}

function localSeed(cv,box,width,height){
  if(box.physicalMask&&box.physicalMask.alpha?.length===box.physicalMask.width*box.physicalMask.height&&
    box.physicalMask.x>=0&&box.physicalMask.y>=0&&
    box.physicalMask.x+box.physicalMask.width<=width&&box.physicalMask.y+box.physicalMask.height<=height){
    const source=box.physicalMask,pad=Math.max(14,Math.ceil(Math.max(source.width,source.height)*.23)),
      x0=Math.max(0,source.x-pad),y0=Math.max(0,source.y-pad),
      x1=Math.min(width,source.x+source.width+pad),y1=Math.min(height,source.y+source.height+pad),
      mask=cv.Mat.zeros(y1-y0,x1-x0,cv.CV_8UC1);
    for(let y=0;y<source.height;y++)mask.data.set(
      source.alpha.subarray(y*source.width,(y+1)*source.width),
      (source.y-y0+y)*mask.cols+source.x-x0);
    return {x0,y0,mask};
  }
  const points=Array.isArray(box.physicalBoundary)&&box.physicalBoundary.length>=3
    ?box.physicalBoundary:null;
  const xs=points?points.map(p=>p[0]*width):[box.x*width,(box.x+box.w)*width],
    ys=points?points.map(p=>p[1]*height):[box.y*height,(box.y+box.h)*height],
    x0=clamp(Math.floor(Math.min(...xs))-5,0,width-1),
    y0=clamp(Math.floor(Math.min(...ys))-5,0,height-1),
    x1=clamp(Math.ceil(Math.max(...xs))+6,x0+1,width),
    y1=clamp(Math.ceil(Math.max(...ys))+6,y0+1,height),
    mask=cv.Mat.zeros(y1-y0,x1-x0,cv.CV_8UC1);
  if(points){
    const outline=cv.matFromArray(points.length,1,cv.CV_32SC2,
      points.flatMap(([x,y])=>[Math.round(x*width)-x0,Math.round(y*height)-y0])),
      vector=new cv.MatVector();
    try{vector.push_back(outline);cv.fillPoly(mask,vector,new cv.Scalar(255));}
    finally{vector.delete();outline.delete();}
  }else{
    const left=clamp(Math.round(box.x*width)-x0,0,mask.cols-1),
      top=clamp(Math.round(box.y*height)-y0,0,mask.rows-1),
      right=clamp(Math.round((box.x+box.w)*width)-x0,left+1,mask.cols),
      bottom=clamp(Math.round((box.y+box.h)*height)-y0,top+1,mask.rows);
    cv.rectangle(mask,new cv.Point(left,top),new cv.Point(right-1,bottom-1),new cv.Scalar(255),cv.FILLED);
  }
  return {x0,y0,mask};
}

function manualEvidenceSeed(cv,p,box){
  const frame=localSeed(cv,box,p.width,p.height),
    rgba=cv.matFromArray(p.height,p.width,cv.CV_8UC4,p.pixels),
    roi=rgba.roi(new cv.Rect(frame.x0,frame.y0,frame.mask.cols,frame.mask.rows)),
    gray=new cv.Mat(),blur=new cv.Mat();
  try{
    cv.cvtColor(roi,gray,cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray,blur,new cv.Size(3,3),0);
    const frameArea=cv.countNonZero(frame.mask),results=[];
    for(const [low,high,size] of [[8,25,3],[15,45,5],[25,75,3]]){
      const edges=new cv.Mat(),closed=new cv.Mat(),
        kernel=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(size,size)),
        contours=new cv.MatVector(),hierarchy=new cv.Mat();
      try{
        cv.Canny(blur,edges,low,high);
        cv.morphologyEx(edges,closed,cv.MORPH_CLOSE,kernel);
        cv.findContours(closed,contours,hierarchy,cv.RETR_LIST,cv.CHAIN_APPROX_SIMPLE);
        for(let i=0;i<contours.size();i++){
          const contour=contours.get(i);
          try{
            const area=Math.abs(cv.contourArea(contour));
            if(area<Math.max(35,frameArea*.18)||area>frameArea*1.3)continue;
            const proposal=cv.Mat.zeros(frame.mask.rows,frame.mask.cols,cv.CV_8UC1),
              vector=new cv.MatVector();
            try{
              vector.push_back(contour);
              cv.drawContours(proposal,vector,-1,new cv.Scalar(255),cv.FILLED);
              const actual=cv.countNonZero(proposal),a=proposal.data,b=frame.mask.data;
              let shared=0;
              for(let k=0;k<a.length;k++)if(a[k]&&b[k])shared++;
              const inside=shared/Math.max(1,actual);
              if(inside<.9)continue;
              const score=inside*Math.min(1,actual/Math.max(1,frameArea))+
                .05*Math.min(1,actual/Math.max(1,frameArea*.7));
              results.push({score,mask:proposal.clone()});
            }finally{vector.delete();proposal.delete();}
          }finally{contour.delete();}
        }
      }finally{hierarchy.delete();contours.delete();kernel.delete();closed.delete();edges.delete();}
    }
    results.sort((a,b)=>b.score-a.score);
    const best=results.shift();
    for(const other of results)other.mask.delete();
    if(!best){frame.mask.delete();return null;}
    frame.mask.delete();return {...frame,mask:best.mask};
  }finally{blur.delete();gray.delete();roi.delete();rgba.delete();}
}

function largestContour(cv,mask){
  const contours=new cv.MatVector(),hierarchy=new cv.Mat();
  let largest=null,area=0;
  try{
    cv.findContours(mask,contours,hierarchy,cv.RETR_EXTERNAL,cv.CHAIN_APPROX_NONE);
    for(let i=0;i<contours.size();i++){
      const c=contours.get(i),a=Math.abs(cv.contourArea(c));
      if(a>area){largest?.delete();largest=c;area=a;}else c.delete();
    }
    return largest;
  }finally{hierarchy.delete();contours.delete();}
}

function polygonMask(cv,width,height,points){
  const mask=cv.Mat.zeros(height,width,cv.CV_8UC1),
    contour=cv.matFromArray(points.length,1,cv.CV_32SC2,
      points.flatMap(([x,y])=>[Math.round(x),Math.round(y)])),
    vector=new cv.MatVector();
  try{vector.push_back(contour);cv.fillPoly(mask,vector,new cv.Scalar(255));return mask;}
  catch(error){mask.delete();throw error;}
  finally{vector.delete();contour.delete();}
}

function hypotheses(cv,observed){
  const out=[{kind:'observed',mask:observed,complexity:0}],
    contour=largestContour(cv,observed);
  if(!contour||cv.countNonZero(observed)<50){contour?.delete();return out;}
  try{
    const perimeter=cv.arcLength(contour,true);
    for(const fraction of [.008,.018,.032]){
      const poly=new cv.Mat();
      try{
        cv.approxPolyDP(contour,poly,Math.max(.8,perimeter*fraction),true);
        if(poly.rows>=3&&poly.rows<=18){
          const points=Array.from({length:poly.rows},(_,i)=>[poly.data32S[i*2],poly.data32S[i*2+1]]);
          out.push({kind:'polygon',mask:polygonMask(cv,observed.cols,observed.rows,points),complexity:poly.rows});
        }
      }finally{poly.delete();}
    }
    const hull=new cv.Mat();
    try{
      cv.convexHull(contour,hull,false,true);
      const points=Array.from({length:hull.rows},(_,i)=>[hull.data32S[i*2],hull.data32S[i*2+1]]);
      if(points.length>=3)out.push({kind:'convex-envelope',mask:polygonMask(cv,observed.cols,observed.rows,points),complexity:points.length});
    }finally{hull.delete();}
    const quad=cv.boxPoints(cv.minAreaRect(contour)).map(p=>[p.x,p.y]);
    out.push({kind:'quadrilateral',mask:polygonMask(cv,observed.cols,observed.rows,quad),complexity:4});
    if(contour.rows>=5){
      const ellipse=cv.fitEllipse(contour),mask=cv.Mat.zeros(observed.rows,observed.cols,cv.CV_8UC1);
      cv.ellipse(mask,new cv.Point(Math.round(ellipse.center.x),Math.round(ellipse.center.y)),
        new cv.Size(Math.max(1,Math.round(ellipse.size.width/2)),Math.max(1,Math.round(ellipse.size.height/2))),
        ellipse.angle,0,360,new cv.Scalar(255),cv.FILLED);
      out.push({kind:'ellipse',mask,complexity:5});
    }
    return out;
  }finally{contour.delete();}
}

function scoreModel(cv,model,seed,gradient,neighbors,width,height){
  const area=cv.countNonZero(model.mask),referenceArea=cv.countNonZero(seed.mask);
  if(area<20||referenceArea<20||area/referenceArea<.79||area/referenceArea>1.28)return null;
  const kernel=cv.Mat.ones(3,3,cv.CV_8UC1),band=new cv.Mat();
  try{
    cv.morphologyEx(model.mask,band,cv.MORPH_GRADIENT,kernel);
    const pixels=model.mask.data,reference=seed.mask.data,edge=band.data;
    let intersection=0,strength=0,continuity=0,boundary=0,added=0,invasion=0;
    for(let y=0;y<model.mask.rows;y++)for(let x=0;x<model.mask.cols;x++){
      const i=y*model.mask.cols+x,inside=pixels[i]>127,original=reference[i]>127;
      if(inside&&original)intersection++;
      if(inside&&!original){
        added++;
        const xx=seed.x0+x,yy=seed.y0+y;
        if(neighbors.some(other=>xx>=other.x0&&yy>=other.y0&&
          xx<other.x0+other.mask.cols&&yy<other.y0+other.mask.rows&&
          other.mask.data[(yy-other.y0)*other.mask.cols+xx-other.x0]>127))invasion++;
      }
      if(edge[i]){
        const value=gradient[(seed.y0+y)*width+seed.x0+x];
        strength+=value;continuity+=value>.13;boundary++;
      }
    }
    if(!boundary)return null;
    const iou=intersection/Math.max(1,area+referenceArea-intersection),
      invaded=invasion/Math.max(1,added),
      simplicity=model.kind==='observed'?0:1/(1+.08*Math.max(0,model.complexity-4));
    return {value:.44*iou+.35*strength/boundary+.16*continuity/boundary+
      .05*simplicity-.35*invaded,iou,invasion:invaded};
  }finally{band.delete();kernel.delete();}
}

function encode(cv,box,seed,model,pageWidth,pageHeight,metadata){
  const contour=largestContour(cv,model.mask);
  if(!contour)return {...box,segmentationFailed:true,needsBoundaryReview:true,mask:null};
  try{
    const bounds=cv.boundingRect(contour),filled=cv.Mat.zeros(model.mask.rows,model.mask.cols,cv.CV_8UC1),
      vector=new cv.MatVector();
    try{
      vector.push_back(contour);cv.drawContours(filled,vector,-1,new cv.Scalar(255),cv.FILLED);
      const roi=filled.roi(new cv.Rect(bounds.x,bounds.y,bounds.width,bounds.height)),packed=new cv.Mat(),poly=new cv.Mat();
      try{
        roi.copyTo(packed);
        cv.approxPolyDP(contour,poly,Math.max(.7,cv.arcLength(contour,true)*.0015),true);
        const points=Array.from({length:poly.rows},(_,i)=>[
          poly.data32S[i*2]-bounds.x,poly.data32S[i*2+1]-bounds.y]);
        return {...box,...metadata,
          x:(seed.x0+bounds.x)/pageWidth,y:(seed.y0+bounds.y)/pageHeight,
          w:bounds.width/pageWidth,h:bounds.height/pageHeight,
          pixels:cv.countNonZero(filled),
          orientedBox:orientedContourBox(cv,contour,seed.x0,seed.y0,pageWidth,pageHeight,cv.countNonZero(filled)),
          edgeMethod:'unified-v8-v5',segmentationMethod:'unified-v8-v5',segmentationFailed:false,
          needsBoundaryReview:box.needsBoundaryReview===true||!box.physicalBoundary,
          mask:{width:bounds.width,height:bounds.height,alpha:new Uint8Array(packed.data),
            polygons:[points],topologyPreserved:false}};
      }finally{poly.delete();packed.delete();roi.delete();}
    }finally{vector.delete();filled.delete();}
  }finally{contour.delete();}
}

export function segmentUnifiedMaterials(cv,p){
  const boxes=p.boxes||[],gradient=sharedGradient(cv,p),
    seeds=boxes.map(box=>p.manualEvidence===true
      ?manualEvidenceSeed(cv,p,box):localSeed(cv,box,p.width,p.height));
  try{
    return boxes.map((box,index)=>{
      if(!seeds[index])return {...box,segmentationFailed:true,needsBoundaryReview:true,
        segmentationMethod:'unified-manual-evidence',mask:null};
      const seed=seeds[index],models=hypotheses(cv,seed.mask),
        others=seeds.filter((item,i)=>i!==index&&item);
      try{
        const scored=models.map(model=>({model,score:scoreModel(cv,model,seed,gradient,others,p.width,p.height)}))
          .filter(entry=>entry.score);
        const reference=scored.find(entry=>entry.model.kind==='observed'),
          best=scored.sort((a,b)=>b.score.value-a.score.value)[0],
          adopt=best&&reference&&best.model.kind!=='observed'&&
            best.score.value>reference.score.value+.015&&best.score.iou>.88&&best.score.invasion<.06,
          selected=adopt?best?.model:models[0];
        return encode(cv,box,seed,selected,p.width,p.height,{
          unifiedShape:selected.kind,unifiedShapeAdopted:!!adopt,
          boundaryScore:adopt?best.score.value:reference?.score.value??null
        });
      }finally{for(const model of models)if(model.mask!==seed.mask)model.mask.delete();}
    });
  }finally{for(const seed of seeds)seed?.mask.delete();}
}
