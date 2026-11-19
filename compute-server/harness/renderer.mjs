import {createHash} from 'node:crypto';
import {loadOfflineCanvas,renderOfflinePNG} from '../../src/offline-node-preview.mjs';
import {creationSceneRevision} from '../../src/creation-transaction.js';

const hash=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
export async function createHarnessRenderer({source,images,saveArtifact}){
  const canvas=await loadOfflineCanvas(),decodedCache=new Map();
  const modelImage=async bytes=>{
    const image=await canvas.loadImage(Buffer.from(bytes)),scale=Math.min(1,1280/Math.max(image.width,image.height));
    const out=canvas.createCanvas(Math.max(1,Math.round(image.width*scale)),Math.max(1,Math.round(image.height*scale))),ctx=out.getContext('2d');
    ctx.fillStyle='#ffffff';ctx.fillRect(0,0,out.width,out.height);ctx.drawImage(image,0,0,out.width,out.height);
    return 'data:image/jpeg;base64,'+out.toBuffer('image/jpeg',{quality:.88}).toString('base64');
  };
  const sourceImages=new Map();
  for(const material of source.materials){
    const bytes=images[material.alias];if(!bytes)throw Error('缺少授权素材图像：'+material.alias);
    sourceImages.set(material.alias,await modelImage(bytes));
  }
  return {
    async inspectMaterials(keys){return keys.map(alias=>{
      if(!sourceImages.has(alias))throw Error('素材不在本次授权来源中');
      return {alias,url:sourceImages.get(alias)};
    });},
    async render(document,signal){
      signal?.throwIfAborted();
      const started=performance.now(),{png,report}=await renderOfflinePNG(document.page,source,images,canvas,{decodedCache});
      signal?.throwIfAborted();
      const pngHash=hash(png),sceneRevision=creationSceneRevision(document);
      const artifact=await saveArtifact({png,pngHash,sceneRevision,document,report});
      return {pngHash,sceneRevision,artifact,imageURL:await modelImage(png),renderMs:Math.round(performance.now()-started),renderer:report.rendererBackend};
    }
  };
}
