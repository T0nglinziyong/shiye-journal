import {readFile} from 'node:fs/promises';
import {createCanvas,loadImage} from 'canvas';
import {boundedMap} from '../../src/bounded-map.js';
import {assetFromSourceSnapshot,sameMaterialCutoutAndSize} from '../../src/material-anatomy.js';
import {creativePresetAssets} from '../../src/creative-presets.js';
import {creativeObjectHash} from './cloud-journal.mjs';

const presets=new Map(creativePresetAssets.map(asset=>[asset.id,asset]));
const validID=/^[A-Za-z0-9_-]{1,100}$/;

export async function loadCreativeMaterialImages(source,{owner,store,lookupRecords,signal}){
  const snapshots=new Map(source.sourceSnapshots.map(snapshot=>[snapshot.assetID,snapshot]));
  const ids=[...new Set(source.materials.filter(item=>!snapshots.get(item.assetID)?.isCreativePreset).map(item=>item.assetID))];
  const records=async(kind,keys)=>{
    const groups=[];for(let i=0;i<keys.length;i+=40)groups.push(keys.slice(i,i+40));
    const rows=(await boundedMap(groups,4,group=>lookupRecords(owner,kind,group))).flat();
    return new Map(rows.map(row=>[row.id,row.record]));
  };
  if(ids.some(id=>!validID.test(id)))throw Error('创作素材编号无效');
  const assets=await records('assets',ids);
  const blobIDs=[];
  for(const id of ids){
    const snapshot=snapshots.get(id),current=assets.get(id);
    if(!snapshot||!current||current.id!==id||current.isProjectInternal||
      !sameMaterialCutoutAndSize(assetFromSourceSnapshot(snapshot),current))throw Error('创作素材尚未同步或来源已变化：'+id);
    if(!validID.test(current.blobId||''))throw Error('创作素材图片编号无效');
    blobIDs.push(current.blobId);
  }
  const blobs=await records('blobs',[...new Set(blobIDs)]);
  const loaded=await boundedMap(source.materials,4,async material=>{
    signal?.throwIfAborted();
    const snapshot=snapshots.get(material.assetID);
    if(!snapshot)throw Error('创作素材来源快照缺失');
    let bytes;
    if(snapshot.isCreativePreset){
      const preset=presets.get(material.assetID);
      if(!preset||!sameMaterialCutoutAndSize(assetFromSourceSnapshot(snapshot),preset))throw Error('创作预设来源已变化');
      bytes=await readFile(new URL('../../public'+preset.staticPath,import.meta.url));
    }else{
      const current=assets.get(material.assetID),blob=blobs.get(current.blobId),path=blob?.storagePath;
      if(blob?.storageProvider!=='cloudbase'||typeof path!=='string'||!path.startsWith(owner+'/')||
        !/^[A-Za-z0-9/_\-.]+$/.test(path)||path.includes('..')||path.includes('//'))
        throw Error('创作素材图片尚未同步：'+material.assetID);
      bytes=await store.download(path);
    }
    signal?.throwIfAborted();
    const image=await loadImage(bytes),scale=Math.min(1,1280/Math.max(image.width,image.height));
    const canvas=createCanvas(Math.max(1,Math.round(image.width*scale)),Math.max(1,Math.round(image.height*scale)));
    canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
    const png=canvas.toBuffer('image/png');
    return {alias:material.alias,bytes:png,sha256:creativeObjectHash(png)};
  });
  return {images:Object.fromEntries(loaded.map(item=>[item.alias,item.bytes])),
    hashes:Object.fromEntries(loaded.map(item=>[item.alias,item.sha256]))};
}
