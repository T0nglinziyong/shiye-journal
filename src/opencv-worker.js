import {refineMaterialBoundaries} from './material-boundary-refiners.js';
import {discoverMaterialBoxes} from './material-box-discovery.js';
import {separateSharedCarrier} from './material-carrier.js';
import {segmentMaterialBoxes} from './material-segmentation.js';
import {restoreRepeatedApertures} from './repeated-apertures.js';
import {detectPaperQuadMultiScale} from './paper-quad-multiscale.js';
export async function processVision(cv,operation,p){
  const resources=[],own=mat=>(resources.push(mat),mat);
  try{
    if(operation==='warmup')return {ready:true};
    if(operation==='resize'){
      const src=own(cv.matFromArray(p.sourceHeight,p.sourceWidth,cv.CV_8UC4,p.pixels)),
        roi=own(src.roi(new cv.Rect(p.x||0,p.y||0,p.cropWidth||p.sourceWidth,p.cropHeight||p.sourceHeight))),dst=own(new cv.Mat());
      cv.resize(roi,dst,new cv.Size(p.width,p.height),0,0,
        p.width<roi.cols||p.height<roi.rows?cv.INTER_AREA:cv.INTER_LINEAR);
      return {pixels:new Uint8ClampedArray(dst.data),width:p.width,height:p.height};
    }
    if(operation==='balance'){
      const options={illumination:p.options?.illumination!==false,denoise:p.options?.denoise!==false,localContrast:p.options?.localContrast!==false},
        src=own(cv.matFromArray(p.height,p.width,cv.CV_8UC4,p.pixels)),rgb=own(new cv.Mat()),lab=own(new cv.Mat()),channels=own(new cv.MatVector()),balanced=own(new cv.Mat()),output=own(new cv.Mat());
      cv.cvtColor(src,rgb,cv.COLOR_RGBA2RGB);cv.cvtColor(rgb,lab,cv.COLOR_RGB2Lab);cv.split(lab,channels);
      const light=own(channels.get(0)),denoised=own(new cv.Mat()),normalized=own(new cv.Mat()),finalLight=own(new cv.Mat());
      if(options.denoise)cv.GaussianBlur(light,denoised,new cv.Size(3,3),0,0,cv.BORDER_REPLICATE);else light.copyTo(denoised);
      if(options.illumination){
        const scale=Math.min(1,128/Math.max(p.width,p.height)),small=own(new cv.Mat()),background=own(new cv.Mat()),blurred=own(new cv.Mat()),field=own(new cv.Mat()),
          kernel=own(cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(21,21)));
        cv.resize(denoised,small,new cv.Size(Math.max(1,Math.round(p.width*scale)),Math.max(1,Math.round(p.height*scale))),0,0,cv.INTER_AREA);
        cv.morphologyEx(small,background,cv.MORPH_CLOSE,kernel);cv.GaussianBlur(background,blurred,new cv.Size(15,15),0);cv.resize(blurred,field,new cv.Size(p.width,p.height),0,0,cv.INTER_LINEAR);
        const samples=Array.from(blurred.data).sort((a,b)=>a-b),reference=samples[Math.floor(samples.length*.9)]||1;denoised.copyTo(normalized);
        for(let i=0;i<denoised.data.length;i++){const gain=Math.max(.9,Math.min(1.35,reference/Math.max(1,field.data[i])));normalized.data[i]=Math.min(255,Math.round(denoised.data[i]*gain));}
      }else denoised.copyTo(normalized);
      if(options.localContrast){
        // Deliberately gentle: improve pale carrier/page separation without
        // turning printed checker/letter texture into stronger contour forces.
        const clahe=own(new cv.CLAHE(1.12,new cv.Size(8,8)));clahe.apply(normalized,finalLight);
      }else normalized.copyTo(finalLight);
      channels.set(0,finalLight);cv.merge(channels,balanced);cv.cvtColor(balanced,rgb,cv.COLOR_Lab2RGB);cv.cvtColor(rgb,output,cv.COLOR_RGB2RGBA);
      const pixels=new Uint8ClampedArray(output.data);for(let i=3;i<pixels.length;i+=4)pixels[i]=p.pixels[i];
      return {pixels,width:p.width,height:p.height,applied:options};
    }
    if(operation==='quad')return detectPaperQuadMultiScale(cv,p,own);
    if(operation==='alignment'){
      const src=own(cv.matFromArray(p.height,p.width,cv.CV_8UC1,p.alpha)),binary=own(new cv.Mat()),contours=own(new cv.MatVector()),hierarchy=own(new cv.Mat());
      cv.threshold(src,binary,127,255,cv.THRESH_BINARY);cv.findContours(binary,contours,hierarchy,cv.RETR_EXTERNAL,cv.CHAIN_APPROX_SIMPLE);
      let largest=null,area=0;
      for(let i=0;i<contours.size();i++){const c=own(contours.get(i)),a=cv.contourArea(c);if(a>area){area=a;largest=c;}}
      if(!largest||area<16)return {degrees:0};
      const r=cv.minAreaRect(largest),fillRatio=area/(r.size.width*r.size.height),elongation=Math.max(r.size.width,r.size.height)/Math.min(r.size.width,r.size.height);
      let degrees=-r.angle;while(degrees>45)degrees-=90;while(degrees<-45)degrees+=90;
      return {degrees:Math.abs(degrees)>=1.5&&elongation>=1.18&&fillRatio>=.78?degrees:0,fillRatio,elongation};
    }
    if(operation==='boxes-simple')return discoverMaterialBoxes(cv,p,own);
    if(operation==='segment-boxes-classical')return segmentMaterialBoxes(cv,p);
    if(operation==='restore-repeated-apertures')return restoreRepeatedApertures(cv,p);
    if(operation==='process-material-boxes'){
      let out;
      if(p.method==='morphgac'||p.method==='auto')out=segmentMaterialBoxes(cv,{...p,pixels:p.pixels});
      else if(p.method==='hybrid')out=refineMaterialBoundaries(cv,{...p,candidates:p.boxes,mode:'hybrid',postprocess:{edgePolish:true,shapeRegularization:false,curveSmooth:false,apertures:false}});
      else out=refineMaterialBoundaries(cv,{...p,candidates:p.boxes,mode:'grabcut',postprocess:{edgePolish:false,shapeRegularization:false,curveSmooth:false,apertures:false}});
      if(p.shapeRegularization!==false)out=refineMaterialBoundaries(cv,{...p,candidates:out,mode:'postprocess',postprocess:{edgePolish:false,shapeRegularization:true,curveSmooth:false,apertures:false}});
      if(p.apertures!==false)out=restoreRepeatedApertures(cv,{pixels:p.sourcePixels||p.pixels,width:p.width,height:p.height,candidates:out,paperWidthMM:p.paperWidthMM,paperHeightMM:p.paperHeightMM});
      return p.mergeSharedCarrier===false?separateSharedCarrier(out,p.sourcePixels||p.pixels,p.width,p.height):out;
    }

    if(operation==='material-boundary-refine')return refineMaterialBoundaries(cv,p);

    if(operation==='warp'){
      const src=own(cv.matFromArray(p.sourceHeight,p.sourceWidth,cv.CV_8UC4,p.pixels)),dst=own(new cv.Mat());
      const from=own(cv.matFromArray(4,1,cv.CV_32FC2,p.corners.flatMap(c=>[c.x*p.sourceWidth,c.y*p.sourceHeight])));
      const to=own(cv.matFromArray(4,1,cv.CV_32FC2,[0,0,p.width,0,p.width,p.height,0,p.height]));
      const transform=own(cv.getPerspectiveTransform(from,to));
      cv.warpPerspective(src,dst,transform,new cv.Size(p.width,p.height),cv.INTER_LINEAR,cv.BORDER_REPLICATE);
      return {pixels:new Uint8ClampedArray(dst.data),width:p.width,height:p.height};
    }
    throw Error('未知图像操作');
  }finally{for(const resource of resources.reverse())resource.delete();}
}
