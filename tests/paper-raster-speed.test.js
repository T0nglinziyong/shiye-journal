import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {detectWhitePaperQuad} from '../src/white-paper-quad.js';
import {workerRasterPair} from '../src/worker-raster-pair.js';
import {estimatePageLighting} from '../src/material-color-restoration.js';
const source=file=>readFile(new URL('../src/'+file,import.meta.url),'utf8');

function sheetFixture(width,height){
  const landscape=width>height;
  const normalized=landscape
    ?[[.11,.12],[.89,.12],[.93,.86],[.05,.86]]
    :[[.12,.10],[.88,.10],[.88,.90],[.12,.90]];
  const pts=normalized.map(([x,y])=>[Math.round(width*x),Math.round(height*y)]);
  const gray=new Uint8Array(width*height).fill(20),support=new Uint8Array(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    let inside=false;
    for(let i=0,j=3;i<4;j=i++){
      const a=pts[i],b=pts[j];
      if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])
        inside=!inside;
    }
    if(inside)gray[y*width+x]=235;
  }
  const lines=pts.map((p,i)=>[...p,...pts[(i+1)%4]]);
  for(const [x1,y1,x2,y2] of lines){
    for(let t=0;t<=700;t++){
      const x=Math.round(x1+(x2-x1)*t/700);
      const y=Math.round(y1+(y2-y1)*t/700);
      for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){
        const xx=x+dx,yy=y+dy;
        if(xx>=0&&xx<width&&yy>=0&&yy<height)support[yy*width+xx]=255;
      }
    }
  }
  return {pts,gray,support,lines,ratio:landscape?297/210:210/297};
}
test('single 800px paper analysis pass, not algorithm or resolution fallback',async()=>{
  const [perspective,worker]=await Promise.all([source('perspective.js'),source('opencv-worker.js')]);
  assert.match(perspective,/PAPER_DETECTION_LONG_EDGE=800/);
  assert.match(perspective,/await visionTask\('quad',/);
  assert.doesNotMatch(perspective,/PAPER_RETRY_LONG_EDGE|for\(const longest|for\(const maxEdge/);
  assert.match(worker,/detectWhitePaperQuad\(lines,blurred\.data,support\.data/);
  assert.doesNotMatch(worker,/paperQuadFromLines|if\(best\)return best\.corners|for\(const threshold of/);
  assert.match(worker,/cv\.HoughLinesP\(edges,segments,1,Math\.PI\/180,35/);
});
test('single border scorer locates white sheet in landscape and portrait',()=>{
  for(const [width,height] of [[800,600],[600,800]]){
    const {pts,gray,support,lines,ratio}=sheetFixture(width,height);
    const corners=detectWhitePaperQuad(lines,gray,support,width,height,ratio);
    assert.equal(corners?.length,4,'portrait/landscape paper must be found');
    for(let i=0;i<4;i++){
      assert.ok(Math.abs(corners[i].x-pts[i][0]/width)<.013);
      assert.ok(Math.abs(corners[i].y-pts[i][1]/height)<.013);
    }
    assert.equal(detectWhitePaperQuad(lines.slice(0,3),gray,support,width,height,ratio),null);
  }
});
test('detector rejects blank inputs and incomplete bright objects',()=>{
  const width=800,height=600,white=new Uint8Array(width*height).fill(255);
  const noEdges=new Uint8Array(width*height);
  assert.equal(detectWhitePaperQuad([],white,noEdges,width,height,297/210),null);
  const {lines}=sheetFixture(width,height);
  assert.equal(detectWhitePaperQuad(lines,white,noEdges,width,height,297/210),null);
  assert.equal(detectWhitePaperQuad(lines.slice(0,2),white,noEdges,width,height,297/210),null);
});
test('recognition worker reuses one source raster for identical foreground and discovery pixels',()=>{
  const data=new Uint8ClampedArray([20,30,40,255]);
  const result=workerRasterPair({data},{data});
  assert.equal(result.pixels,result.sourcePixels);
  assert.notEqual(result.pixels,data);
  assert.deepEqual([...result.pixels],[...data]);
  const separate=workerRasterPair({data},{data:new Uint8ClampedArray([1,2,3,4])});
  assert.notEqual(separate.pixels,separate.sourcePixels);
});
test('stable light estimation reads the corrected page as in c9',async()=>{
 const code=await source('material-color-restoration.js');
 assert.match(code,/const ratio=Math.min\(1,maxDimension\/Math.max\(source.width,source.height\)\)/);
 assert.doesNotMatch(code,/analysisRaster\?\.data/);
});
test('A4 correction retained while the rest of recognition matches c9',async()=>{
 const [image,raster,app,perspective,matching]=await Promise.all([
  source('image.js'),source('recognition-raster.js'),source('app.js'),
  source('perspective.js'),source('matching-view.js')
 ]);
 assert.match(image,/const candidates=await segmentPaperMaterials\(discoveryFrame/);
 assert.match(image,/const degrees=rotation\?\?/);
 assert.doesNotMatch(image,/onAnalysisRaster\(/);
 assert.match(raster,/colorSpaceConversion:'none'/);
 assert.match(app,/rectifyA4Frame\(state.importBitmap,state.paperCorners,4096/);
 assert.match(perspective,/sourcePixels\(bitmap\)/);
 assert.ok(matching.includes('data-act="reset-match"'));
});
