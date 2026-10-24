import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';

const browser=await browserHarness('shiye-recognition-stage-reuse',process.env.SHIYE_TEST_URL||'http://127.0.0.1:5173');
try{
  await browser.wait('.series-grid');
  const result=await browser.evaluate(`(async()=>{
    const {visionTask}=await import('/src/vision-runtime.js');
    const {reprocessPaperCandidates}=await import('/src/image.js');
    const width=180,height=220,pixels=new Uint8ClampedArray(width*height*4);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const at=(y*width+x)*4,inside=x>=35&&x<145&&y>=32&&y<190;
      pixels.set(inside?[166,174,188,255]:[245,245,244,255],at);
    }
    const candidate={x:35/width,y:32/height,w:110/width,h:158/height,fillRatio:.95,seedDensity:.7};
    const base=await visionTask('process-material-boxes',{
      pixels,sourcePixels:pixels,width,height,boxes:[candidate],method:'physical',
      paperWidthMM:210,paperHeightMM:297,mergeSharedCarrier:true,
      shapeRegularization:false,apertures:false
    });
    const analysis={candidates:base,frame:{data:pixels},sourceFrame:{data:pixels},
      width,height,preprocess:{chromaEdges:true},paperWidthMM:210,paperHeightMM:297};
    const run=async options=>{
      const events=[];
      const pieces=await reprocessPaperCandidates(analysis,{...options,onProgress:event=>events.push(event.engine)});
      return {count:pieces.length,hasMask:pieces.every(p=>p.mask?.alpha?.length>0),events};
    };
    const untouched=await run({postprocess:{shapeRegularization:false,apertures:false}});
    const shaped=await run({postprocess:{shapeRegularization:true,apertures:false}});
    const holed=await run({postprocess:{shapeRegularization:false,apertures:true}});
    const separate=await run({mergeSharedCarrier:false,postprocess:{shapeRegularization:false,apertures:false}});
    return {base:base.length,untouched,shaped,holed,separate};
  })()`);
  assert.ok(result.base>0,JSON.stringify(result));
  for(const key of ['untouched','shaped','holed','separate'])
    assert.ok(result[key].count>0&&result[key].hasMask,JSON.stringify(result));
  assert.deepEqual(result.untouched.events,[]);
  assert.ok(result.shaped.events.includes('shape-regularization'));
  assert.ok(result.holed.events.includes('repeated-apertures'));
  assert.ok(result.separate.events.includes('separate-carrier'));
  assert.deepEqual(browser.errors,[]);
  console.log('Recognition stage reuse: all three switches apply to cached base masks');
}finally{await browser.close();}
