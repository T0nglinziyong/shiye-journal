import fs from 'node:fs';
import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';
// Private research fixtures stay outside Git. Pass their extracted directory.
const root=process.env.SHIYE_RESEARCH_ROOT;
if(!root)throw new Error('请设置 SHIYE_RESEARCH_ROOT 为研究交接包的解压目录');
const rows=JSON.parse(fs.readFileSync(root+'/fixtures/real_golden_manifest.json','utf8')).cases;
const b=await browserHarness('shiye-research-real-browser',process.env.SHIYE_TEST_URL||'http://127.0.0.1:5173');
try{
 await b.wait('.series-grid');
 for(const row of rows.filter(item=>!process.env.SHIYE_CASE||String(item.case)===process.env.SHIYE_CASE)){
 const data=fs.readFileSync(root+'/'+row.raw).toString('base64');
 const rawPNG=process.env.SHIYE_CV2_RAW_PNG==='1'?fs.readFileSync(`/tmp/shiye-cv2-raw-case${row.case}.png`).toString('base64'):null;
 const correctedReference=fs.readFileSync(root+`/fixtures/real_golden/case${row.case}/corrected_rgb.png`).toString('base64');
  const refs=Array.from({length:row.count},(_,i)=>fs.readFileSync(root+`/fixtures/real_golden/case${row.case}/mask_${String(i+1).padStart(2,'0')}.png`).toString('base64'));
  const expr=`(async()=>{
   const decode=async(base,type)=>createImageBitmap(new Blob([Uint8Array.from(atob(base),c=>c.charCodeAt(0))],{type}));
   const {decodeRecognitionImage}=await import('/src/recognition-raster.js');
   const inputBlob=new Blob([Uint8Array.from(atob(${JSON.stringify(data)}),c=>c.charCodeAt(0))],{type:'image/jpeg'});
   const original=${JSON.stringify(!!rawPNG)}?await decode(${JSON.stringify(rawPNG)},'image/png')
     :${JSON.stringify(process.env.SHIYE_FULL_APP_PIPELINE==='1')}?await decodeRecognitionImage(inputBlob,{research:true})
     :${JSON.stringify(process.env.SHIYE_NATIVE_NO_COLOR==='1')}?await createImageBitmap(inputBlob,{colorSpaceConversion:'none'}):await decodeRecognitionImage(inputBlob);
   const canvas=document.createElement('canvas');canvas.width=original.width;canvas.height=original.height;
   const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(original,0,0);
   const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
   const {visionTask}=await import('/src/vision-runtime.js');
   const {detectPaperCandidates}=await import('/src/image.js');
   const {segmentPaperMaterials}=await import('/src/paper-analysis.js');
   const portrait=${row.corrected_shape[0]>row.corrected_shape[1]};
   const width=portrait?636:900,height=portrait?900:636;
   const corners=${JSON.stringify(row.corners_original_px)}.map(([x,y])=>({x:x/original.width,y:y/original.height}));
   let autoCorners=null;
   if(${JSON.stringify(process.env.SHIYE_TEST_AUTO_CORNERS==='1')}){
    const {suggestPaperCorners}=await import('/src/perspective.js');
    autoCorners=await suggestPaperCorners(original,portrait?210/297:297/210);
   }
   const corrected=await visionTask(${JSON.stringify(process.env.SHIYE_RESEARCH_WARP==='1'?'warp-research':'warp')},{pixels,sourceWidth:original.width,sourceHeight:original.height,corners,width,height});
   const referenceImage=await decode(${JSON.stringify(correctedReference)},'image/png');
   const referenceCanvas=document.createElement('canvas');referenceCanvas.width=width;referenceCanvas.height=height;
   const referenceContext=referenceCanvas.getContext('2d',{willReadFrequently:true});referenceContext.drawImage(referenceImage,0,0);
   const referencePixels=referenceContext.getImageData(0,0,width,height).data;
   let rasterError=0,rasterChanged=0;
   for(let i=0;i<referencePixels.length;i+=4){
    let changed=false;
    for(let c=0;c<3;c++){const delta=Math.abs(referencePixels[i+c]-corrected.pixels[i+c]);rasterError+=delta;changed ||= delta>0;}
    rasterChanged+=changed;
   }
   const useReferenceRaster=${JSON.stringify(process.env.SHIYE_USE_REFERENCE_RASTER==='1')};
   const analysisPixels=useReferenceRaster?referencePixels:corrected.pixels;
   const legacy=await segmentPaperMaterials({data:analysisPixels,width,height},{smallestMM:9,paperWidthMM:portrait?210:297,paperHeightMM:portrait?297:210,candidateDiscovery:'legacy'});
   const page=document.createElement('canvas');page.width=width;page.height=height;
   page.getContext('2d').putImageData(new ImageData(analysisPixels,width,height),0,0);
   let bitmap=await createImageBitmap(page);
   const fullPipeline=${JSON.stringify(process.env.SHIYE_FULL_APP_PIPELINE==='1')};
   if(fullPipeline){
    bitmap.close();
    const {rectifyA4Frame}=await import('/src/perspective.js');
    bitmap=(await rectifyA4Frame(original,corners,4096,portrait?210/297:297/210)).canvas;
   }
   const refs=[];for(const encoded of ${JSON.stringify(refs)}){
    const image=await decode(encoded,'image/png'),c=document.createElement('canvas');c.width=width;c.height=height;
    const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(image,0,0);const d=x.getImageData(0,0,width,height).data;
    const mask=new Uint8Array(width*height);for(let i=0;i<mask.length;i++)mask[i]=d[i*4]>127?1:0;
    refs.push(mask);image.close();
   }
   const results=[];
   for(const candidateDiscovery of [${JSON.stringify(process.env.SHIYE_DISCOVERY||'unified')}]){
    let diagnostic=null;
    const start=performance.now();const pieces=await detectPaperCandidates(bitmap,{x:0,y:0,w:1,h:1},6,{paperRectified:true,paperWidthMM:portrait?210:297,paperHeightMM:portrait?297:210,recognition:'auto',candidateDiscovery,recognitionPixels:900,
      recognitionSource:fullPipeline?{bitmap:original,corners}:null,
      recognitionPostprocess:{shapeRegularization:false,apertures:false},onDiagnostic:value=>{diagnostic=value;}});
    const pred=pieces.filter(p=>p.mask?.alpha?.length).map(p=>{const out=new Uint8Array(width*height),mx=Math.round(p.x*width),my=Math.round(p.y*height),mw=p.mask.width,mh=p.mask.height,a=p.mask.alpha;for(let y=0;y<mh;y++)for(let x=0;x<mw;x++){const xx=mx+x,yy=my+y;if(xx>=0&&yy>=0&&xx<width&&yy<height)out[yy*width+xx]=a[y*mw+x]>127?1:0;}return out});
    const areas=pred.map(p=>p.reduce((n,v)=>n+v,0));
    const overlaps=refs.map(r=>pred.map((p,j)=>{let intersection=0,ra=0;for(let i=0;i<r.length;i++){ra+=r[i];intersection+=r[i]&p[i];}return intersection/Math.max(1,ra+areas[j]-intersection)}));
    const best=overlaps.map(row=>Math.max(0,...row));
    let exactMaskMatches=0;for(let i=0;i<refs.length;i++){
      const current=pred[i];if(!current)continue;let same=true;
      for(let k=0;k<current.length;k++)if(current[k]!==refs[i][k]){same=false;break;}
      exactMaskMatches+=same;
    }
    results.push({candidateDiscovery,count:pieces.length,validMasks:pred.length,exactMaskMatches,elapsedMS:Math.round(performance.now()-start),meanBestIoU:+(best.reduce((a,c)=>a+c,0)/best.length).toFixed(4),best:best.map(x=>+x.toFixed(3)),matchedPred:overlaps.map(row=>row.indexOf(Math.max(...row))),dimensions:diagnostic?.dimensions,refinementDimensions:diagnostic?.refinementDimensions,bitmapDimensions:[bitmap.width,bitmap.height],pieces:pieces.map((p,j)=>({box:[p.x*width,p.y*height,p.w*width,p.h*height].map(Math.round),pixels:areas[j],shape:p.unifiedShape,adopted:p.unifiedShapeAdopted,source:p.boundarySource,originalBox:p.originalBox,weakSourceBoxes:p.weakSourceBoxes,circleGeometry:p.circleGeometry})),discovery:diagnostic?.boxes?.map(b=>({box:[b.x*width,b.y*height,b.w*width,b.h*height].map(Math.round),source:b.boundarySource,prior:b.boundaryPrior}))});
   }
   let manual=null;
   if(${row.case}===2){
    const {manualPhysicalRegion}=await import('/src/manual-import-geometry.js');
    const frame=manualPhysicalRegion({x:.062,y:.056,w:.31,h:.34,rotation:0},width,height);
    const started=performance.now();
    const [cutout]=await visionTask('process-material-boxes',{
      pixels:analysisPixels,sourcePixels:analysisPixels,width,height,
      boxes:[frame],method:'morphgac',paperWidthMM:297,paperHeightMM:210,
      shapeRegularization:false,apertures:false
    });
    manual={failed:cutout?.segmentationFailed,maskPixels:cutout?.pixels||0,
      segmentationMethod:cutout?.segmentationMethod,
      bounds:cutout?[cutout.x,cutout.y,cutout.w,cutout.h]:null,
      elapsedMS:Math.round(performance.now()-started)};
   }
   bitmap.close?.();original.close?.();referenceImage.close();return {case:${row.case},expected:${row.count},autoCorners,expectedCorners:corners,rasterMAE:+(rasterError/(width*height*3)).toFixed(4),rasterChangedFraction:+(rasterChanged/(width*height)).toFixed(4),results,manual,legacy:legacy.map(b=>({box:[b.x*width,b.y*height,b.w*width,b.h*height].map(Math.round),seedDensity:b.seedDensity,fillRatio:b.fillRatio}))};
  })()`;
  const result=await b.evaluate(expr);
  if(process.env.SHIYE_DIAGNOSTIC_ONLY!=='1'){
    assert.equal(result.results[0].count,row.count,`案例 ${row.case} 候选数量`);
    assert.equal(result.results[0].validMasks,row.count,`案例 ${row.case} 透明 Mask 数量`);
    if(process.env.SHIYE_REQUIRE_EXACT==='1'){
      assert.equal(result.rasterChangedFraction,0,`案例 ${row.case} 校正图像像素`);
      assert.equal(result.results[0].exactMaskMatches,row.count,`案例 ${row.case} 透明 Mask 逐像素匹配`);
    }
  }
  if(row.case===2){
    assert.equal(result.manual.failed,false,'浅色 LifeWear 卡片手动框应可执行 MorphGAC');
    assert.equal(result.manual.segmentationMethod,'morphgac');
    assert.ok(result.manual.maskPixels>30000,'手动框应覆盖整张浅色卡片，不能只抠文字');
  }
  console.log(JSON.stringify(result));
 }
}finally{await b.close()}
