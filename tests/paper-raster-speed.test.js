import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {paperQuadFromLines} from '../src/paper-line-candidates.js';
import {workerRasterPair} from '../src/worker-raster-pair.js';
import {estimatePageLighting} from '../src/material-color-restoration.js';

const source=file=>readFile(new URL('../src/'+file,import.meta.url),'utf8');

function paperFixture(width,height){
  const wide=width>height;
  const n=wide?[[.11,.12],[.89,.12],[.93,.86],[.05,.86]]:
    [[.12,.10],[.88,.10],[.88,.90],[.12,.90]];
  const points=n.map(([x,y])=>[Math.round(x*width),Math.round(y*height)]);
  const gray=new Uint8Array(width*height).fill(20);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    let inside=false;
    for(let i=0,j=3;i<4;j=i++){
      const a=points[i],b=points[j];
      if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
    }
    if(inside)gray[y*width+x]=235;
  }
  return {points,gray,lines:points.map((p,i)=>[...p,...points[(i+1)%4]]),
    ratio:wide?297/210:210/297};
}
test('paper detector uses a fixed 900px raster without high resolution retries',async()=>{
  const perspective=await source('perspective.js');
  assert.match(perspective,/PAPER_DETECTION_LONG_EDGE=900/);
  assert.match(perspective,/Math\.min\(1,PAPER_DETECTION_LONG_EDGE\/Math\.max\(bitmap\.width,bitmap\.height\)\)/);
  assert.doesNotMatch(perspective,/for\(const maxEdge of \[800,1200,1600\]\)/);
});
test('fixed-raster paper-line fallback detects landscape and portrait with four real edges',()=>{
  for(const [width,height] of [[900,675],[675,900]]){
    const {points,gray,lines,ratio}=paperFixture(width,height);
    const corners=paperQuadFromLines(lines,gray,width,height,ratio);
    assert.equal(corners?.length,4,String(width)+' x '+height);
    for(let i=0;i<4;i++){
      assert.ok(Math.abs(corners[i].x-points[i][0]/width)<.01);
      assert.ok(Math.abs(corners[i].y-points[i][1]/height)<.01);
    }
    assert.equal(paperQuadFromLines(lines.slice(0,3),gray,width,height,ratio),null);
  }
});
test('line detector cannot override accepted OpenCV contour corners',async()=>{
  const worker=await source('opencv-worker.js');
  assert.match(worker,/if\(best\)return best\.corners/);
  assert.match(worker,/paperQuadFromLines\(candidates,gray\.data,p\.width,p\.height,p\.paperRatio\)/);
});
test('worker parameters share one owned buffer if the source and foreground are identical',()=>{
  const data=new Uint8ClampedArray([20,30,40,255]);
  const result=workerRasterPair({data},{data});
  assert.equal(result.pixels,result.sourcePixels);
  assert.notEqual(result.pixels,data);
  assert.deepEqual([...result.pixels],[...data]);
  const separate=workerRasterPair({data},{data:new Uint8ClampedArray([1,2,3,4])});
  assert.notEqual(separate.pixels,separate.sourcePixels);
});
test('white-paper light map uses the existing analysis pixels without canvas repaint',async()=>{
  const width=128,height=96,data=new Uint8ClampedArray(width*height*4);
  for(let i=0;i<data.length;i+=4){
    data[i]=236;data[i+1]=237;data[i+2]=235;data[i+3]=255;
  }
  const map=await estimatePageLighting(null,[],{analysisRaster:{data,width,height}});
  assert.ok(map);
  assert.ok(map.samples>40);
});
test('explicit deskew skips redundant preview probe and non-JPEG ICC gets converted',async()=>{
  const [image,raster]=await Promise.all([source('image.js'),source('recognition-raster.js')]);
  assert.match(image,/if\(degrees==null\)\{/);
  assert.match(raster,/colorSpaceConversion:'default'/);
  assert.match(image,/onAnalysisRaster\(\{data:discoveryPixels,width:dw,height:dh\}\)/);
});
test('Matching header only contains reset; original high-res import canvas stays preserved',async()=>{
  const [matching,app,perspective]=await Promise.all([source('matching-view.js'),source('app.js'),source('perspective.js')]);
  assert.ok(matching.includes('data-act="reset-match"'));
  assert.ok(!matching.includes('data-act="match-library"'));
  assert.ok(!matching.includes('data-act="match-context"'));
  assert.match(app,/rectifyA4Frame\(state\.importBitmap,state\.paperCorners,4096/);
  assert.match(perspective,/sourcePixels\(bitmap\)/);
});
