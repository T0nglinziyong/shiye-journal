import fs from 'node:fs';
import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';
// Private research fixtures stay outside Git. Pass their extracted directory.
const root=process.env.SHIYE_RESEARCH_ROOT;
if(!root)throw new Error('请设置 SHIYE_RESEARCH_ROOT 为研究交接包的解压目录');
const scenes=JSON.parse(fs.readFileSync(root+'/fixtures/synthetic_gt_manifest.json','utf8')).scenes;
const b=await browserHarness('shiye-research-synthetic-browser',process.env.SHIYE_TEST_URL||'http://127.0.0.1:5173');
let totalIoU=0,totalGT=0,totalPred=0,tp=0;
try{
 await b.wait('.series-grid');
 for(const row of scenes){
  const dir=root+'/'+row.scene_dir,photo=fs.readFileSync(dir+'/camera_rgb.png').toString('base64');
  const refs=Array.from({length:row.truth_mask_sha256.length},(_,i)=>fs.readFileSync(dir+`/gt_outer_mask_${String(i+1).padStart(2,'0')}.png`).toString('base64'));
  const expr=`(async()=>{
   const decode=async(base)=>createImageBitmap(new Blob([Uint8Array.from(atob(base),c=>c.charCodeAt(0))],{type:'image/png'}));
   const original=await decode(${JSON.stringify(photo)}),rawW=original.width,rawH=original.height;
   const raw=document.createElement('canvas');raw.width=rawW;raw.height=rawH;raw.getContext('2d').drawImage(original,0,0);
   const rawPixels=raw.getContext('2d',{willReadFrequently:true}).getImageData(0,0,rawW,rawH).data;
   const {visionTask}=await import('/src/vision-runtime.js');
   const {detectPaperCandidates}=await import('/src/image.js');
   const width=900,height=636;
   const corners=${JSON.stringify(row.detector_A4_corners_original_pixels)}.map(([x,y])=>({x:x/rawW,y:y/rawH}));
   const corrected=await visionTask('warp-research',{pixels:rawPixels,sourceWidth:rawW,sourceHeight:rawH,corners,width,height});
   const page=document.createElement('canvas');page.width=width;page.height=height;
   page.getContext('2d').putImageData(new ImageData(corrected.pixels,width,height),0,0);
   const bitmap=await createImageBitmap(page);
   const truth=[];
   for(const encoded of ${JSON.stringify(refs)}){
    const im=await decode(encoded),c=document.createElement('canvas');c.width=rawW;c.height=rawH;
    const cx=c.getContext('2d',{willReadFrequently:true});cx.drawImage(im,0,0);
    const source=cx.getImageData(0,0,rawW,rawH).data;
    const mask=new Uint8Array(rawW*rawH);for(let i=0;i<mask.length;i++)mask[i]=source[i*4]>127?1:0;
    truth.push(mask);im.close();
   }
   const start=performance.now(),pieces=await detectPaperCandidates(bitmap,{x:0,y:0,w:1,h:1},9,{paperRectified:true,paperWidthMM:297,paperHeightMM:210,recognition:'auto',candidateDiscovery:'unified',recognitionPixels:900,recognitionSource:{bitmap:original,corners},recognitionPostprocess:{shapeRegularization:false,apertures:false}});
   const recognitionMS=Math.round(performance.now()-start);
   const pred=[];
   for(const p of pieces.filter(p=>p.mask?.alpha?.length)){
    const out=new Uint8Array(width*height),mx=Math.round(p.x*width),my=Math.round(p.y*height),mw=p.mask.width,mh=p.mask.height,a=p.mask.alpha;
    for(let y=0;y<mh;y++)for(let x=0;x<mw;x++){
      const xx=mx+x,yy=my+y;if(xx>=0&&yy>=0&&xx<width&&yy<height)out[yy*width+xx]=a[y*mw+x]>127?255:0;
    }
    const projected=await visionTask('project-mask-nearest',{mask:out,width,height,rawWidth:rawW,rawHeight:rawH,corners});
    pred.push(Uint8Array.from(projected.mask,v=>v>127?1:0));
   }
   const areas=pred.map(p=>p.reduce((n,v)=>n+v,0)),matrix=truth.map(r=>pred.map((p,j)=>{let inter=0,ra=0;for(let i=0;i<r.length;i++){ra+=r[i];inter+=r[i]&p[i];}return inter/Math.max(1,ra+areas[j]-inter)}));
   let bestScore=-1,best=[];const assign=(row,used,values,sum)=>{if(row===truth.length){if(sum>bestScore){bestScore=sum;best=values.slice()}return}assign(row+1,used,[...values,0],sum);for(let j=0;j<pred.length;j++)if(!used.has(j)){used.add(j);assign(row+1,used,[...values,matrix[row][j]],sum+matrix[row][j]);used.delete(j)}};assign(0,new Set(),[],0);const matches=best
   bitmap.close();original.close();return {seed:${row.seed},gt:truth.length,pred:pieces.length,elapsedMS:recognitionMS,iou:matches.map(x=>+x.toFixed(4)),meanIoU:matches.reduce((a,c)=>a+c,0)/matches.length,tp:matches.filter(x=>x>=.5).length};
  })()`;
  const result=await b.evaluate(expr);console.log(JSON.stringify(result));totalIoU+=result.meanIoU*result.gt;totalGT+=result.gt;totalPred+=result.pred;tp+=result.tp;
 }
 const current={weightedIoU:totalIoU/totalGT,tp,fp:totalPred-tp,fn:totalGT-tp,gt:totalGT,pred:totalPred};
 const baseline=scenes.reduce((sum,row)=>({
   weightedIoU:sum.weightedIoU+row.metrics.mean_gt_iou_missing_zero*row.metrics.objects_gt,
   tp:sum.tp+row.metrics.tp_iou_ge_0_5,
   fp:sum.fp+row.metrics.fp,
   fn:sum.fn+row.metrics.fn
 }),{weightedIoU:0,tp:0,fp:0,fn:0});
 baseline.weightedIoU/=totalGT;
 console.log('TOTAL',JSON.stringify({current,baseline}));
 assert.ok(current.weightedIoU>=baseline.weightedIoU,'浏览器合成独立真值 IoU 不得低于研究基线');
 assert.ok(current.tp>=baseline.tp&&current.fp<=baseline.fp&&current.fn<=baseline.fn,
   '浏览器合成独立真值检出数量不得低于研究基线');
}finally{try{await b.close()}catch(error){console.warn('close',String(error))}}
