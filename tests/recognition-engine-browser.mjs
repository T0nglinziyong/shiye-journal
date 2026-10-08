import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';

const b=await browserHarness('shiye-recognition-engine',process.env.SHIYE_TEST_URL||'http://127.0.0.1:5173');
const {evaluate,wait}=b;
try{
  await wait('.series-grid');
  await evaluate(`(()=>{
    const width=160,height=220,pixels=new Uint8ClampedArray(width*height*4),x0=42,y0=34,x1=118,y1=188;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const i=y*width+x,p=i*4,inside=x>=x0&&x<x1&&y>=y0&&y<y1,
        edge=inside&&(x-x0<3||x1-1-x<3||y-y0<3||y1-1-y<3),
        color=inside?(edge?[105,145,185]:[126,174,210]):[246,246,246];
      pixels[p]=color[0];pixels[p+1]=color[1];pixels[p+2]=color[2];pixels[p+3]=255;
    }
    globalThis.__recogFixture={width,height,pixels,box:{x:x0/width,y:y0/height,w:(x1-x0)/width,h:(y1-y0)/height,pixels:(x1-x0)*(y1-y0),fillRatio:.96,seedDensity:.7}};
    return true;
  })()`);
  await evaluate(`(async()=>{const m=await import('/src/vision-runtime.js');globalThis.__visionTask=m.visionTask;return true})()`);
  console.log('Chrome engine step: module imported');

  const warm=await evaluate(`(async()=>{const t=performance.now(),result=await __visionTask('warmup',{});return {elapsedMS:performance.now()-t,result}})()`);
  console.log('Chrome engine step: warmup',JSON.stringify(warm));assert.equal(warm.result.ready,true);

  const run=async method=>{
    const result=await evaluate(`(async()=>{const f=__recogFixture,t=performance.now(),[r]=await __visionTask('process-material-boxes',{pixels:f.pixels,sourcePixels:f.pixels,width:f.width,height:f.height,boxes:[f.box],method:${JSON.stringify(method)},paperWidthMM:210,paperHeightMM:297,shapeRegularization:false,apertures:false});return {elapsedMS:performance.now()-t,edgeMethod:r?.edgeMethod||null,pixels:r?.pixels||0,width:r?.mask?.width||0,height:r?.mask?.height||0}})()`);
    console.log('Chrome final engine step:',method,JSON.stringify(result));return result;
  };

  const morph=await run('morphgac');assert.equal(morph.edgeMethod,'morphgac',JSON.stringify(morph));
  const grabcut=await run('grabcut');assert.equal(grabcut.edgeMethod,'browser-grabcut',JSON.stringify(grabcut));
  const hybrid=await run('hybrid');assert.equal(hybrid.edgeMethod,'browser-morphgac-grabcut',JSON.stringify(hybrid));
  for(const result of [morph,grabcut,hybrid])assert.ok(result.pixels>100&&result.width>10&&result.height>10,JSON.stringify(result));
  // The same JPEG bytes must enter recognition identically at phone and desktop widths.
  const base="/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAQDAwMDAgQDAwMEBAQFBgoGBgUFBgwICQcKDgwPDg4MDQ0PERYTDxAVEQ0NExoTFRcYGRkZDxIbHRsYHRYYGRj/2wBDAQQEBAYFBgsGBgsYEA0QGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBj/wAARCAAMABADAREAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDyfwB8Lf8AVf6N6dqEzy8q4i21PpHSPh2mm+DL69cG32WzBZVyCrkbVII6fMRz2rtwcoKtGVVpRWrbskorVtt6WSTbufUZ1xisBkmKxHtHFqElFq91KS5Y2tqnzNWfTfTcvaXZ2eheAtX1u0tYnuLDT57qJZRlGaONmAYDBxkDOCKzyvDxxWMo4eb0nKKdt7NpaH4FwnOeMx+HwtSTUZzjF23s5JO2+up4d8UPin418YfDfUdJvdU+waVcLC0lhpq+RGwLhCrNy7oRklWYqSenAx1cc5fQyvOMLllCN4cnO29XKV52v9n3eVONktdXd2t/XGZ8HZXlXDGJxFKnz1I8lpT95/xYNNL4U10aimkt9Xf/2Q==";
  const canonical=[];
  for(const width of [390,1440]){
    await b.command('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<700});
    const hashes=await evaluate(`(async()=>{
      const m=await import('/src/recognition-raster.js');
      const bytes=Uint8Array.from(atob('${base}'),c=>c.charCodeAt(0));
      const bitmap=await m.decodeRecognitionImage(new File([bytes],'fixture.jpg',{type:'image/jpeg'}));
      const full=m.sourcePixels(bitmap),small=await m.analysisPixels(bitmap,{x:2/16,y:1/12,w:12/16,h:10/12},7,6);
      const digest=async p=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',p))].map(v=>v.toString(16).padStart(2,'0')).join('');
      return {full:await digest(full),small:await digest(small)};
    })()`);
    canonical.push(hashes);
  }
  assert.deepEqual(canonical,[
    {full:'9db2ff8d3b38f0d18ed5fd05e78084c37d2dcd0692c9746d8ba45ab4bb106ae4',small:'ca70a3bf36e03b8f2b8943fd0559c354e282d36a8d6d281c7f0ccb76b65d0f87'},
    {full:'9db2ff8d3b38f0d18ed5fd05e78084c37d2dcd0692c9746d8ba45ab4bb106ae4',small:'ca70a3bf36e03b8f2b8943fd0559c354e282d36a8d6d281c7f0ccb76b65d0f87'}
  ]);
  assert.deepEqual(b.errors,[]);
}finally{try{await b.close();}catch(error){console.warn('Browser close warning:',String(error?.message||error));}}
