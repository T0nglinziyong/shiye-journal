import test from 'node:test';import assert from 'node:assert/strict';
import {createCanvas,loadImage} from 'canvas';
import {physicalSVGPath} from '../src/svg-paint-geometry.js';
import {shapeSVG,commonShapes,advancedShapes} from '../src/editor-tools-model.js';
test('physical outline transformation retains curves, subpaths, relative and smooth segments',()=>{
 assert.equal(physicalSVGPath('m1 2 l3 4 h5 v6 z',{sx:2,sy:3,tx:7,ty:11}),'M9 17 L15 29 L25 29 L25 47 Z');
 assert.equal(physicalSVGPath('M0 0 C1 2 3 4 5 6 S9 10 11 12 Q13 14 15 16 T19 20',{sx:2,sy:3}),'M0 0 C2 6 6 12 10 18 C14 24 18 30 22 36 Q26 42 30 48 Q34 54 38 60');
 assert.match(physicalSVGPath('M0 0 A10 20 30 0 1 20 40'),/^M0 0 C.*20 40$/);
 assert.equal(physicalSVGPath('M1 2 A0 0 0 0 1 3 4'),'M1 2 L3 4');
 assert.throws(()=>physicalSVGPath('M1 2 A2 3 0 4 5 6 7'),/标志/);assert.throws(()=>physicalSVGPath('L1 2'),/M/);
});
test('every published preset renders nonempty real outline and gradient SVG on nonsquare frames',async()=>{
 for(const [kind] of [...commonShapes,...advancedShapes]){
  if(kind==='vector')continue;
  const node={id:'preset-'+kind,type:'shape',kind,x:0,y:0,width:131,height:83,fill:'#FFFFFF',stroke:'#334455',lineWidth:2,graphicOutline:{color:'#00FF00',width:3,offsetX:2,offsetY:1},graphicGradient:{angleDeg:45,stops:[{offset:0,color:'#FF0000'},{offset:1,color:'#0000FF'}]}};
  const svg=shapeSVG(node),image=await loadImage(Buffer.from(svg.replace('<svg ', '<svg width="140" height="92" '))),c=createCanvas(image.width,image.height),ctx=c.getContext('2d');ctx.drawImage(image,0,0);const pixels=ctx.getImageData(0,0,c.width,c.height).data;
  assert.ok(pixels.some((v,i)=>i%4===3&&v>0),kind);assert.ok(!svg.includes('stroke-linejoin="round" stroke-linejoin="round"'),kind);
 }
});

