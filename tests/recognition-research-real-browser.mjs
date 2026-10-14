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
 for(const row of rows){
  const data=fs.readFileSync(root+'/'+row.raw).toString('base64');
  const refs=Array.from({length:row.count},(_,i)=>fs.readFileSync(root+`/fixtures/real_golden/case${row.case}/mask_${String(i+1).padStart(2,'0')}.png`).toString('base64'));
  const expr=`(async()=>{
   const decode=async(base,type)=>createImageBitmap(new Blob([Uint8Array.from(atob(base),c=>c.charCodeAt(0))],{type}));
   const original=await decode(${JSON.stringify(data)},'image/jpeg');
   const canvas=document.createElement('canvas');canvas.width=original.width;canvas.height=original.height;
   const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(original,0,0);
   const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
   const {visionTask}=await import('/src/vision-runtime.js');
   const {detectPaperCandidates}=await import('/src/image.js');
   const portrait=${row.corrected_shape[0]>row.corrected_shape[1]};
   const width=portrait?636:900,height=portrait?900:636;
   const corners=${JSON.stringify(row.corners_original_px)}.map(([x,y])=>({x:x/original.width,y:y/original.height}));
   const corrected=await visionTask('warp',{pixels,sourceWidth:original.width,sourceHeight:original.height,corners,width,height});
   const page=document.createElement('canvas');page.width=width;page.height=height;
   page.getContext('2d').putImageData(new ImageData(corrected.pixels,width,height),0,0);
   const bitmap=await createImageBitmap(page);
   const refs=[];for(const encoded of ${JSON.stringify(refs)}){
    const image=await decode(encoded,'image/png'),c=document.createElement('canvas');c.width=width;c.height=height;
    const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(image,0,0);const d=x.getImageData(0,0,width,height).data;
    const mask=new Uint8Array(width*height);for(let i=0;i<mask.length;i++)mask[i]=d[i*4]>127?1:0;
    refs.push(mask);image.close();
   }
   const results=[];
   for(const candidateDiscovery of ['unified']){
    const start=performance.now();const pieces=await detectPaperCandidates(bitmap,{x:0,y:0,w:1,h:1},6,{paperRectified:true,paperWidthMM:portrait?210:297,paperHeightMM:portrait?297:210,recognition:'auto',candidateDiscovery,recognitionPixels:900,recognitionPostprocess:{shapeRegularization:false,apertures:false}});
    const pred=pieces.filter(p=>p.mask?.alpha?.length).map(p=>{const out=new Uint8Array(width*height),mx=Math.round(p.x*width),my=Math.round(p.y*height),mw=p.mask.width,mh=p.mask.height,a=p.mask.alpha;for(let y=0;y<mh;y++)for(let x=0;x<mw;x++){const xx=mx+x,yy=my+y;if(xx>=0&&yy>=0&&xx<width&&yy<height)out[yy*width+xx]=a[y*mw+x]>127?1:0;}return out});
    const areas=pred.map(p=>p.reduce((n,v)=>n+v,0));
    const overlaps=refs.map(r=>pred.map((p,j)=>{let intersection=0,ra=0;for(let i=0;i<r.length;i++){ra+=r[i];intersection+=r[i]&p[i];}return intersection/Math.max(1,ra+areas[j]-intersection)}));
    const best=overlaps.map(row=>Math.max(0,...row));
    results.push({candidateDiscovery,count:pieces.length,validMasks:pred.length,elapsedMS:Math.round(performance.now()-start),meanBestIoU:+(best.reduce((a,c)=>a+c,0)/best.length).toFixed(4),best:best.map(x=>+x.toFixed(3))});
   }
   let manual=null;
   if(${row.case}===2){
    const {manualPhysicalRegion}=await import('/src/manual-import-geometry.js');
    const frame=manualPhysicalRegion({x:.062,y:.056,w:.31,h:.34,rotation:0},width,height);
    const started=performance.now();
    const [cutout]=await visionTask('process-material-boxes',{
      pixels:corrected.pixels,sourcePixels:corrected.pixels,width,height,
      boxes:[frame],method:'morphgac',paperWidthMM:297,paperHeightMM:210,
      shapeRegularization:false,apertures:false
    });
    manual={failed:cutout?.segmentationFailed,maskPixels:cutout?.pixels||0,
      segmentationMethod:cutout?.segmentationMethod,
      bounds:cutout?[cutout.x,cutout.y,cutout.w,cutout.h]:null,
      elapsedMS:Math.round(performance.now()-started)};
   }
   bitmap.close();original.close();return {case:${row.case},expected:${row.count},results,manual};
  })()`;
  const result=await b.evaluate(expr);
  assert.equal(result.results[0].count,row.count,`案例 ${row.case} 候选数量`);
  assert.equal(result.results[0].validMasks,row.count,`案例 ${row.case} 透明 Mask 数量`);
  if(row.case===2){
    assert.equal(result.manual.failed,false,'浅色 LifeWear 卡片手动框应可执行 MorphGAC');
    assert.equal(result.manual.segmentationMethod,'morphgac');
    assert.ok(result.manual.maskPixels>30000,'手动框应覆盖整张浅色卡片，不能只抠文字');
  }
  console.log(JSON.stringify(result));
 }
}finally{await b.close()}
