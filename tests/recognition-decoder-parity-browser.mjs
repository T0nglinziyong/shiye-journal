import fs from 'node:fs';
import {createHash} from 'node:crypto';
import decodeJpeg,{init as initJpeg} from '@jsquash/jpeg/decode.js';
import {browserHarness} from './browser-harness.mjs';

const root=process.env.SHIYE_RESEARCH_ROOT;
if(!root)throw new Error('请设置 SHIYE_RESEARCH_ROOT 为研究交接包的解压目录');
const rows=JSON.parse(fs.readFileSync(root+'/fixtures/real_golden_manifest.json','utf8')).cases;
const wasm=fs.readFileSync(new URL('../node_modules/@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm',import.meta.url));
initJpeg(await WebAssembly.compile(wasm));
const browser=await browserHarness('shiye-jpeg-parity',process.env.SHIYE_TEST_URL||'http://127.0.0.1:5173');
try{
  await browser.wait('.series-grid');
  for(const row of rows){
    const bytes=fs.readFileSync(root+'/'+row.raw);
    const input=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
    const node=await decodeJpeg(input,{preserveOrientation:true});
    const nodeHash=createHash('sha256').update(node.data).digest('hex');
    const encoded=bytes.toString('base64');
    const result=await browser.evaluate(`(async()=>{
      const bytes=Uint8Array.from(atob(${JSON.stringify(encoded)}),c=>c.charCodeAt(0));
      const {decodeRecognitionImage,sourcePixels}=await import('/src/recognition-raster.js');
      const hashes=[];let dimensions;
      for(let i=0;i<2;i++){
        const canvas=await decodeRecognitionImage(new Blob([bytes],{type:'image/jpeg'}),{research:true});
        dimensions=[canvas.width,canvas.height];
        const pixels=sourcePixels(canvas);
        const digest=await crypto.subtle.digest('SHA-256',pixels);
        hashes.push([...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join(''));
      }
      return {hashes,dimensions};
    })()`);
    if(result.dimensions[0]!==node.width||result.dimensions[1]!==node.height||
      result.hashes.some(hash=>hash!==nodeHash))throw Error(`案例 ${row.case} 浏览器与 Node JPEG 像素不一致`);
    console.log(`案例 ${row.case}: ${node.width}×${node.height} 两次浏览器解码与 Node 逐像素一致`);
  }
}finally{await browser.close()}
