import test from 'node:test';
import assert from 'node:assert/strict';
import {PNG} from 'pngjs';
import {deriveMaterialEdgeQuads} from '../creative-agent/runtime/material-edge-quads.mjs';

const image=inside=>{
 const png=new PNG({width:96,height:96});
 for(let y=0;y<96;y++)for(let x=0;x<96;x++){
  const i=(y*96+x)*4;png.data[i]=220;png.data[i+1]=200;png.data[i+2]=180;png.data[i+3]=inside(x,y)?255:0;
 }
 return PNG.sync.write(png);
};
test('server edge derivation accepts visible paper, rejects cutouts and opaque photo frames',()=>{
 const source={materials:[{alias:'paper',assetID:'paper-id'},{alias:'cutout',assetID:'cutout-id'},{alias:'opaque',assetID:'opaque-id'}]};
 const images={paper:image((x,y)=>x>=10+y*.04&&x<=86-y*.03&&y>=8&&y<=88),cutout:image((x,y)=>x>=12&&x<=82&&y>=8&&y<=87&&(x<31||y>60)),opaque:image(()=>true)};
 const quads=deriveMaterialEdgeQuads(source,images);
 assert.equal(quads['paper-id'].length,4);
 assert.equal(quads['cutout-id'],undefined);
 assert.equal(quads['opaque-id'],undefined);
});
