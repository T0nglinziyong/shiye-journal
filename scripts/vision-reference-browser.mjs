// Explicit local reference inputs only. Never imports the user's live database
// or uploads an image. Outputs and model comparison PNGs remain outside Git.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {browserHarness} from '../tests/browser-harness.mjs';
const [first,second]=process.argv.slice(2);if(!first||!second)throw Error('Supply exactly two local reference images');
const out='/tmp/shiye-vision-reference';await mkdir(out,{recursive:true});
const b=await browserHarness('shiye-vision-reference',process.env.SHIYE_TEST_URL||'http://localhost:5175');
try{await b.wait('.series-grid');const report=[];
  for(const [index,path] of [first,second].entries()){
    const data=(await readFile(path)).toString('base64');
    const result=await b.evaluate(`(async()=>{
      const {suggestPaperCorners,rectifyA4}=await import('/src/perspective.js'),{visionTask}=await import('/src/vision-runtime.js');
      const bitmap=await createImageBitmap(await (await fetch('data:image/jpeg;base64,${data}')).blob()),corners=await suggestPaperCorners(bitmap);
      if(!corners)return {corners:null,detectionFailed:true};
      const rectified=await createImageBitmap(await rectifyA4(bitmap,corners,1000,210/297)),c=document.createElement('canvas');c.width=rectified.width;c.height=rectified.height;
      const ctx=c.getContext('2d');ctx.drawImage(rectified,0,0);const before=ctx.getImageData(0,0,c.width,c.height),balanced=await visionTask('balance',{pixels:before.data,width:c.width,height:c.height});const original=c.toDataURL();
      ctx.putImageData(new ImageData(balanced.pixels,c.width,c.height),0,0);let delta=0;for(let i=0;i<before.data.length;i+=4)delta+=Math.abs(before.data[i]-balanced.pixels[i])+Math.abs(before.data[i+1]-balanced.pixels[i+1])+Math.abs(before.data[i+2]-balanced.pixels[i+2]);
      return {corners,width:c.width,height:c.height,meanRGBChange:delta/(c.width*c.height*3),original,balanced:c.toDataURL()};})()`);
    for(const key of ['original','balanced']){if(result[key])await writeFile(out+'/'+(index+1)+'-'+key+'.png',Buffer.from(result[key].split(',')[1],'base64'));delete result[key];}report.push(result);
  }await writeFile(out+'/report.json',JSON.stringify({report,errors:b.errors},null,2));console.log(JSON.stringify(report));
}finally{await b.close();}
