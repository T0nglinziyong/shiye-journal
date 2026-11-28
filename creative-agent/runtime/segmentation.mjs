import {createHash} from 'node:crypto';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadOfflineCanvas} from '../../src/offline-node-preview.mjs';
import {normalizeGeometry,geometryArea,geometryIntersection,geometryDifference,transformGeometry} from '../../src/craft-topology.js';
import {itemSourceGeometry} from '../../src/craft-region-ops.js';
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

const sceneNodes=layers=>layers.flatMap(node=>[node,...sceneNodes(node.children||[])]);
export function compileSegmentationGroup({document,assets,target,method,proposals}){
  const nodes=sceneNodes(document.page.layers),node=nodes.find(item=>[item.id,item.creativePieceID,item.agentKey].includes(target));
  if(!node||node.type!=='material'||node.tapeStrip)throw Error('智能分割需要已放置的普通实体素材对象');
  const asset=assets.find(item=>item.id===node.assetID);
  if(!asset)throw Error('分割素材来源不存在');
  const alias=document.source.materials.find(item=>item.assetID===node.assetID)?.alias;
  const snapshot=document.source.sourceSnapshots.find(item=>item.assetID===node.assetID);
  if(!alias||!snapshot||!proposals.length||proposals.some(item=>item.alias!==alias||item.sourceRevision!==snapshot.sourceRevision))throw Error('智能分割结果与当前素材来源不一致');
  const source=itemSourceGeometry(node,asset),width=asset.physicalWidthMM,height=asset.physicalHeightMM;
  const available=proposals.map(proposal=>({proposal,geometry:geometryIntersection(source,transformGeometry(proposal.geometry,([x,y])=>[x*width,y*height]))}))
    .filter(item=>geometryArea(item.geometry)>Math.max(1e-6,width*height*.0001));
  if(!available.length)throw Error('分割主体不在当前裁片内');
  // SAM automatic masks include carriers and nested alternatives. A physical
  // source can only be used once, so preserve all source material while
  // assigning each pixel to at most one independently editable piece.
  const candidates=method==='extract'?available.slice(0,1):available.filter(item=>item.proposal.area<.94||available.length===1).sort((a,b)=>geometryArea(a.geometry)-geometryArea(b.geometry));
  const chosen=[];
  for(const candidate of candidates){
    if(chosen.length>=12)break;
    const overlaps=chosen.map(item=>geometryArea(geometryIntersection(candidate.geometry,item.geometry)));
    if(overlaps.some((area,index)=>area/Math.min(geometryArea(candidate.geometry),geometryArea(chosen[index].geometry))>.12))continue;
    const distinct=chosen.length?geometryDifference(candidate.geometry,...chosen.map(item=>item.geometry)):candidate.geometry;
    if(distinct.length!==1||geometryArea(distinct)<Math.max(1e-6,width*height*.0001))continue;
    chosen.push({proposal:candidate.proposal,geometry:normalizeGeometry(distinct)});
  }
  if(!chosen.length)throw Error('未检测到可独立取用的主体；请缩小范围改用 extract');
  const suffix=createHash('sha256').update(target+chosen.map(item=>item.proposal.id).join(':')).digest('hex').slice(0,8);
  const groupId=`${target.slice(0,48)}-segments-${suffix}`;
  if(nodes.some(item=>item.id===groupId))throw Error('分割组合编号已存在');
  const pieces=chosen.map((item,index)=>({id:`${groupId}-subject-${index+1}`,region:{shape:'geometry',space:'source',unit:'mm',geometry:item.geometry}}));
  const rest=geometryDifference(source,...chosen.map(item=>item.geometry));
  const remainder=rest.filter(polygon=>geometryArea([polygon])>1e-6).map((polygon,index)=>({id:`${groupId}-remainder-${index+1}`,region:{shape:'geometry',space:'source',unit:'mm',geometry:[polygon]}}));
  if(pieces.length+remainder.length>24)throw Error('分割裁片过多，请缩小主体范围');
  const subjectIds=pieces.map(item=>item.id),remainderIds=remainder.map(item=>item.id),operations=[
    {op:'material.split',target,pieces:[...pieces,...remainder],keepRemainder:false},
    ...remainderIds.map(id=>({op:'layer.update',target:id,hidden:true}))
  ];
  if(method==='detect_all'){
    const branches=new Map(),top=[];
    chosen.forEach((item,index)=>{
      const path=item.proposal.groupPath||[];
      if(!path.length){top.push(subjectIds[index]);return;}
      for(let depth=1;depth<=path.length;depth++){
        const key=path.slice(0,depth).join('-');
        if(!branches.has(key))branches.set(key,{path:path.slice(0,depth),children:[]});
        if(depth===path.length)branches.get(key).children.push(subjectIds[index]);
      }
    });
    for(const [key,branch] of [...branches].sort((a,b)=>b[1].path.length-a[1].path.length)){
      const id=`${groupId}-objects-${key}`;
      operations.push({op:'group.create',id,targets:branch.children});
      const parentKey=branch.path.slice(0,-1).join('-');
      if(parentKey)branches.get(parentKey).children.push(id);else top.push(id);
    }
    const objectsId=`${groupId}-objects`;
    operations.push({op:'group.create',id:objectsId,targets:top},{op:'group.create',id:groupId,targets:[objectsId,...remainderIds]});
  }else operations.push({op:'group.create',id:groupId,targets:[...subjectIds,...remainderIds]});
  return {groupId,members:[...subjectIds.map((id,index)=>({id,role:'subject',proposalId:chosen[index].proposal.id})),...remainderIds.map(id=>({id,role:'remainder',hidden:true}))],operations};
}

export async function createMaterialSegmenter({source,images,imageHashes,daemon,saveArtifact}){
  const canvas=await loadOfflineCanvas();
  return async({method,alias,box},signal)=>{
    signal?.throwIfAborted();
    if(!['extract','foreground','detect_all'].includes(method))throw Error('未知智能分割方法');
    const material=source.materials.find(m=>m.alias===alias),bytes=images[alias];
    const snapshot=source.sourceSnapshots.find(s=>s.assetID===material?.assetID);
    if(!material||!snapshot||!bytes||digest(bytes)!==imageHashes?.[alias])throw Error('分割输入不属于本次授权素材');
    if(method==='extract'&&(!Array.isArray(box)||box.length!==4||box.some(v=>!Number.isFinite(v)||v<0||v>1)||box[0]>=box[2]||box[1]>=box[3]))throw Error('extract 需要有效的 0–1 比例 xyxy 框');
    if(method!=='extract'&&box!==undefined)throw Error(method+' 自动分割不接受 box；需要指定区域请用 extract');
    const original=await canvas.loadImage(bytes),scale=Math.min(1,1280/Math.max(original.width,original.height));
    const image=canvas.createCanvas(Math.round(original.width*scale),Math.round(original.height*scale));
    image.getContext('2d').drawImage(original,0,0,image.width,image.height);
    const pixels=method==='extract'?[Math.floor(box[0]*image.width),Math.floor(box[1]*image.height),Math.ceil(box[2]*image.width),Math.ceil(box[3]*image.height)]:null;
    const folder=await mkdtemp(join(tmpdir(),'shiye-creative-cut-')),started=performance.now();
    try{
      const input=join(folder,'input.png'),output=join(folder,'out');
      await writeFile(input,image.toBuffer('image/png'),{mode:0o600});
      await daemon.run({input,output,model:'small',scope:method==='extract'?'material':method==='foreground'?'material-foreground':'material-detect-all',
        ...(pixels?{box:pixels}:{pointsPerSide:12,cropNLayers:0,granularity:'balanced'}),preprocessing:{illumination:false,denoise:false,localContrast:false}});
      signal?.throwIfAborted();
      const result=JSON.parse(await readFile(join(output,'materials/result.json'),'utf8'));
      if(result.version!==2||result.width!==image.width||result.height!==image.height||!Array.isArray(result.objects))throw Error('智能分割结果无效');
      const sourceHash=imageHashes[alias],sourceRevision=snapshot.sourceRevision;
      const candidates=[];
      const rawObjects=[];
      const collect=(item,path=[])=>{
        if(method==='detect_all'&&item.subregions?.length){item.subregions.forEach((child,index)=>collect(child,[...path,index+1]));return;}
        rawObjects.push({item,groupPath:path});
      };
      result.objects.forEach((item,index)=>collect(item,item.subregions?.length?[index+1]:[]));
      for(const {item,groupPath} of rawObjects){
        try{
          const {geometry,discardedAreaRatio}=normalizeSegmentationGeometry(item.geometry);
          const area=geometryArea(geometry);
          if(area<.0001)continue;
          const id=digest(JSON.stringify({alias,sourceHash,sourceRevision,geometry})).slice(7);
          candidates.push({id,alias,sourceHash,sourceRevision,geometry,area,box:item.bbox_xyxy?.map((v,i)=>v/(i%2?image.height:image.width))||box,groupPath,discardedAreaRatio,model:result.model,method,milliseconds:Math.round(performance.now()-started)});
        }catch(error){if(method==='extract')throw error;}
      }
      if(method==='extract'&&candidates.length!==1)throw Error('没有得到唯一的有效分割区域');
      if(!candidates.length)throw Error('没有得到有效的真实分割区域');
      candidates.sort((a,b)=>b.area-a.area);
      const choices=method==='extract'?[candidates[0]]:(candidates.filter(candidate=>candidate.area<.94).length?candidates.filter(candidate=>candidate.area<.94):candidates).slice(0,12);
      const overlay=canvas.createCanvas(image.width,image.height),ctx=overlay.getContext('2d');
      ctx.fillStyle='#ffffff';ctx.fillRect(0,0,image.width,image.height);ctx.drawImage(image,0,0);
      for(const [index,proposal] of choices.entries()){
        ctx.beginPath();for(const polygon of proposal.geometry)for(const ring of polygon){ring.forEach(([x,y],i)=>ctx[i?'lineTo':'moveTo'](x*image.width,y*image.height));ctx.closePath();}
        const hue=(index*67+155)%360;ctx.fillStyle=`hsla(${hue},70%,46%,0.32)`;ctx.fill('evenodd');ctx.strokeStyle=`hsl(${hue},75%,34%)`;ctx.lineWidth=2;ctx.stroke();
        if(method==='detect_all'){const [x,y]=proposal.box||[.02,.02];ctx.font='bold 18px sans-serif';ctx.fillStyle='#FFFFFF';ctx.fillText(String(index+1),x*image.width+3,y*image.height+20);}
      }
      const png=overlay.toBuffer('image/png'),artifact=await saveArtifact?.({proposal:choices[0],proposals:choices,png});
      return {proposals:choices,proposal:choices[0],artifact,imageURL:'data:image/png;base64,'+png.toString('base64')};
    }finally{await rm(folder,{recursive:true,force:true});}
  };
}
