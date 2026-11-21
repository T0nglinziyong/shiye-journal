// Real Chromium: assert visual ink pixels are actually rendered at DPR,
// preserve Canvas identity across small viewport changes and use the same
// smooth vector path as the stored editable ink. No COS/auth bytes involved.
import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';
const b=await browserHarness('shiye-ink-dpi',process.env.SHIYE_TEST_URL||'http://127.0.0.1:5173');
try{
 await b.wait('.series-grid');
 for(const [width,height,dpr] of [[390,844,3],[768,1024,2],[1440,900,2]]){
  await b.command('Emulation.setDeviceMetricsOverride',
    {width,height,deviceScaleFactor:dpr,mobile:width<700});
  const sample=await b.evaluate(`(async()=>{
    const [{configureInkBacking},{traceSmoothInk,smoothInkSVG}]=await Promise.all([
      import('/src/ink-raster-scale.js'),import('/src/ink-path-geometry.js')]);
    const area=document.createElement('div');
    area.style.cssText='position:fixed;top:0;left:0;z-index:9999;pointer-events:none';
    const c=document.createElement('canvas');c.style.cssText='display:block;width:270px;height:360px';
    area.append(c);document.body.append(area);
    const original=c,points=[{x:20,y:20},{x:80,y:110},{x:160,y:180},{x:260,y:250}];
    const backing=configureInkBacking(c,400,500,{pixelRatio:Math.max(2,devicePixelRatio)});
    const ctx=backing.ctx;ctx.lineWidth=9;ctx.strokeStyle='#ee0000';
    ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();traceSmoothInk(ctx,points);ctx.stroke();
    const atX=Math.round(20*c.width/400),atY=Math.round(20*c.height/500);
    const pixel=[...ctx.getImageData(atX,atY,1,1).data];
    const initialPixels=[c.width,c.height];
    c.style.width='283px';c.style.height='377px';
    const after=configureInkBacking(c,400,500,{pixelRatio:Math.max(2,devicePixelRatio)});
    const retained=[...ctx.getImageData(atX,atY,1,1).data];
    const result={backing:initialPixels,pixel,retained,changed:after.changed,
      identical:c===original,vector:smoothInkSVG(points,v=>v),
      logical:[400,500],screen:[innerWidth,innerHeight]};
    area.remove();return result;
  })()`);
  assert.ok(sample.pixel[3]>0,JSON.stringify(sample));
  assert.ok(sample.retained[3]>0,'DPI adjustment cleared the live stroke: '+JSON.stringify(sample));
  assert.equal(sample.changed,false,'Small resize recreated ink buffer: '+JSON.stringify(sample));
  assert.equal(sample.identical,true);
  assert.ok(sample.backing[0]>sample.logical[0]&&sample.backing[1]>sample.logical[1],
    'Retina render lacks high resolution: '+JSON.stringify(sample));
  assert.ok(sample.vector.includes(' Q'),'Final path is not smoothly curved');
 }
}finally{await b.close();}
