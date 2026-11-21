import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';
// This fixture approximates the specific *failure modes* (5 physical pieces,
// 3 neutral shadow islands and a duplicated internal sports-sticker fragment).
// It does NOT replace the private original photo as the final acceptance test.
const b=await browserHarness('shiye-material-count',process.env.SHIYE_TEST_URL||'http://127.0.0.1:5194');
try{
  await b.wait('.series-grid');
  const result=await b.evaluate(`(async()=>{
    const width=600,height=800,n=width*height,mask=new Uint8Array(n),
      evidence=new Uint8Array(n),foregroundSeeds=new Uint8Array(n);
    const stamp=(pixel,signal=1,seed=1)=>{
      if(pixel<0||pixel>=n)return;
      mask[pixel]=1;evidence[pixel]=signal;foregroundSeeds[pixel]=seed;
    };
    const rect=(x0,y0,w,h)=>{
      for(let y=y0;y<y0+h;y++)for(let x=x0;x<x0+w;x++)stamp(y*width+x);
    };
    // Four physical rectangular elements, disjoint from each other.
    rect(65,115,145,225); // blue punched paper
    rect(65,465,150,265); // green paper
    rect(355,90,125,135); // photo
    rect(295,335,200,170); // keyboard memo
    // A sports cutout has a large irregular outline, plus a disconnected
    // printed component inside the same physical outline.
    for(let y=555;y<741;y++)for(let x=350;x<520;x++){
      const outer=(x<357||x>512||y<562||y>733);
      if(outer)stamp(y*width+x);
    }
    rect(384,601,95,97); // must be absorbed by outer sports fragment
    // Three neutral non-material shadows/edge artifacts near upper paper.
    const shadows=[[230,130,65,55],[225,245,70,75],[440,270,55,40]];
    for(const [x0,y0,w,h] of shadows){
      for(let y=y0;y<y0+h;y++)for(let x=x0;x<x0+w;x++){
        const xrel=(x-x0)/w,yrel=(y-y0)/h;
        if(xrel<yrel*.8)stamp(y*width+x,0,0);
      }
    }
    const {visionTask}=await import('/src/vision-runtime.js');
    const boxes=await visionTask('boxes-simple',{mask,evidence,foregroundSeeds,
      width,height,paperWidthMM:210,paperHeightMM:297,smallestMM:6});
    return {count:boxes.length,boxes:boxes.map(x=>({
      x:Math.round(x.x*width),y:Math.round(x.y*height),
      w:Math.round(x.w*width),h:Math.round(x.h*height),
      fragments:x.absorbedFragments
    }))};
  })()`);
  console.log('MATERIAL_COUNT_SYNTHETIC',JSON.stringify(result));
  assert.equal(result.count,5,JSON.stringify(result));
  assert.ok(result.boxes.some(x=>x.fragments>=1),'sports cutout duplicated component not absorbed');
  assert.deepEqual(b.errors,[]);
}finally{await b.close();}
