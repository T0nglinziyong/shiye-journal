import {createHash} from 'node:crypto';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadOfflineCanvas} from '../../src/offline-node-preview.mjs';
import {normalizeGeometry,geometryArea} from '../../src/craft-topology.js';
import polygonClipping from 'polygon-clipping';

const digest=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
export function normalizeSegmentationGeometry(raw){
  if(!Array.isArray(raw)||raw.length>128||raw.some(p=>!Array.isArray(p)||!p.length||p.length>64||p.some(r=>!Array.isArray(r)||r.length<3||r.length>1024||r.some(v=>!Array.isArray(v)||v.length!==2||v.some(n=>!Number.isFinite(n)||n<0||n>1))))||raw.flat(2).length>8192)
    throw Error('分割轮廓超过可编辑复杂度，请缩小选区');
  const repaired=polygonClipping.union(raw).filter(p=>geometryArea([p])>1e-9).sort((a,b)=>geometryArea([b])-geometryArea([a]));
  if(!repaired.length)throw Error('分割区域为空');
  const discarded=geometryArea(repaired.slice(1))/geometryArea(repaired);
  if(discarded>.01)throw Error('选区包含多个分离主体，请分别框选');
  return {geometry:normalizeGeometry([repaired[0]]),discardedAreaRatio:discarded};
}
export function compileSegmentationCuts({document,proposals,cuts}){
  const nodes=[];const walk=rows=>{for(const node of rows){nodes.push(node);if(node.children)walk(node.children);}};walk(document.page.layers);
  return cuts.map(({proposalId,target,mode,resultId,keepRemainder})=>{
    const proposal=proposals.find(p=>p.id===proposalId),node=nodes.find(n=>[n.id,n.creativePieceID].includes(target));
    const source=document.source.materials.find(m=>m.alias===proposal?.alias);
    const snapshot=document.source.sourceSnapshots.find(s=>s.assetID===source?.assetID);
    if(!proposal||!source||!node||node.type!=='material'||node.assetID!==source.assetID||snapshot?.sourceRevision!==proposal.sourceRevision)
      throw Error('分割裁片与本次素材来源不一致');
    return {op:'material.cut',target,mode,region:{shape:'geometry',space:'source',unit:'ratio',geometry:proposal.geometry},
      ...(resultId?{resultId}:{}),...(keepRemainder!==undefined?{keepRemainder}:{})};
  });
}

export async function createMaterialSegmenter({source,images,imageHashes,daemon,saveArtifact}){
  const canvas=await loadOfflineCanvas();
  return async({alias,box},signal)=>{
    signal?.throwIfAborted();
    const material=source.materials.find(m=>m.alias===alias),bytes=images[alias];
    const snapshot=source.sourceSnapshots.find(s=>s.assetID===material?.assetID);
    if(!material||!snapshot||!bytes||digest(bytes)!==imageHashes?.[alias])throw Error('分割输入不属于本次授权素材');
    if(!Array.isArray(box)||box.length!==4||box.some(v=>!Number.isFinite(v)||v<0||v>1)||box[0]>=box[2]||box[1]>=box[3])throw Error('分割范围无效');
    const original=await canvas.loadImage(bytes),scale=Math.min(1,1280/Math.max(original.width,original.height));
    const image=canvas.createCanvas(Math.round(original.width*scale),Math.round(original.height*scale));
    image.getContext('2d').drawImage(original,0,0,image.width,image.height);
    const pixels=[Math.floor(box[0]*image.width),Math.floor(box[1]*image.height),Math.ceil(box[2]*image.width),Math.ceil(box[3]*image.height)];
    const folder=await mkdtemp(join(tmpdir(),'shiye-creative-cut-')),started=performance.now();
    try{
      const input=join(folder,'input.png'),output=join(folder,'out');
      await writeFile(input,image.toBuffer('image/png'),{mode:0o600});
      await daemon.run({input,output,model:'small',scope:'material',box:pixels,preprocessing:{illumination:false,denoise:false,localContrast:false}});
      signal?.throwIfAborted();
      const result=JSON.parse(await readFile(join(output,'materials/result.json'),'utf8'));
      if(result.version!==2||result.width!==image.width||result.height!==image.height||result.objects.length!==1)throw Error('没有得到唯一的有效分割区域');
      const {geometry,discardedAreaRatio}=normalizeSegmentationGeometry(result.objects[0].geometry);
      if(!geometry.length||geometryArea(geometry)<.0001||geometry.flat(2).some(p=>p.some(v=>v<0||v>1)))throw Error('分割轮廓无效');
      const sourceHash=imageHashes[alias],sourceRevision=snapshot.sourceRevision;
      const id=digest(JSON.stringify({alias,sourceHash,sourceRevision,geometry})).slice(7);
      const proposal={id,alias,sourceHash,sourceRevision,geometry,box,discardedAreaRatio,model:result.model,milliseconds:Math.round(performance.now()-started)};
      const overlay=canvas.createCanvas(image.width,image.height),ctx=overlay.getContext('2d');
      ctx.fillStyle='#ffffff';ctx.fillRect(0,0,image.width,image.height);ctx.drawImage(image,0,0);
      ctx.beginPath();for(const polygon of geometry)for(const ring of polygon){ring.forEach(([x,y],i)=>ctx[i?'lineTo':'moveTo'](x*image.width,y*image.height));ctx.closePath();}
      ctx.fillStyle='rgba(32,171,111,.4)';ctx.fill('evenodd');ctx.strokeStyle='#168653';ctx.lineWidth=1.5;ctx.stroke();
      const png=overlay.toBuffer('image/png'),artifact=await saveArtifact?.({proposal,png});
      return {proposal,artifact,imageURL:'data:image/png;base64,'+png.toString('base64')};
    }finally{await rm(folder,{recursive:true,force:true});}
  };
}
