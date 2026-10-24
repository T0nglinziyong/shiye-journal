import {craftDigest} from './craft-fingerprint.js';
import {craftAssert} from './craft-errors.js';

export function assetVisualDescriptor(asset){
 return {assetID:asset.id,blobId:asset.blobId??null,originalBlobId:asset.originalBlobId??null,staticPath:asset.staticPath??null,
  widthMM:asset.physicalWidthMM,heightMM:asset.physicalHeightMM,imageSize:asset.imageSize??null,
  processingRecord:asset.processingRecord??null,sourceSilhouette:asset.sourceSilhouette??null,
  imageHash:asset.imageHash??asset.contentHash??null,orientation:asset.orientation??null};
}
const physicalSource=asset=>({...assetVisualDescriptor(asset),kind:asset.kind??null,
 ...(asset.isCreativePreset?{isCreativePreset:true}:{}),
 tapeAxis:asset.tapeAxis??null,
 tapeFlatCrop:asset.tapeFlatCrop??null,
 tapeRepeatMode:asset.tapeRepeatMode==='repeatablePattern'?'repeatablePattern':'singleStrip',
 tapeRepeatPeriodMM:asset.tapeRepeatMode==='repeatablePattern'?asset.tapeRepeatPeriodMM??null:null,
 tapeRepeatStartMM:asset.tapeRepeatMode==='repeatablePattern'?asset.tapeRepeatStartMM??0:null,
 tapeRepeatEndMM:asset.tapeRepeatMode==='repeatablePattern'?asset.tapeRepeatEndMM??
  ((asset.tapeRepeatStartMM??0)+(asset.tapeRepeatPeriodMM??0)):null});
const frozenTaskRevision=Symbol('frozenTaskRevision');
// Inventory and catalog metadata never change a source cutout or its size.
export const assetSourceRevision=asset=>asset[frozenTaskRevision]||craftDigest(physicalSource(asset));
// A saved work still refers to the library image. Metadata may
// change while the model is working, but a different cutout or measured size
// would change the meaning of its placements and physical operations.
export function sameMaterialCutoutAndSize(exported,current){
 const a=assetVisualDescriptor(exported),b=assetVisualDescriptor(current);
 if(a.widthMM!==b.widthMM||a.heightMM!==b.heightMM)return false;
 if(a.imageHash||b.imageHash)return !!a.imageHash&&a.imageHash===b.imageHash;
 return a.blobId===b.blobId&&a.staticPath===b.staticPath&&
   craftDigest([a.processingRecord,a.sourceSilhouette,a.orientation])===
   craftDigest([b.processingRecord,b.sourceSilhouette,b.orientation]);
}
export function materialSourceSnapshot(asset){
 return {assetID:asset.id,sourceRevision:assetSourceRevision(asset),descriptor:assetVisualDescriptor(asset),updatedAt:asset.updatedAt??null,
  kind:asset.kind,title:asset.title,role:asset.role??null,tags:asset.tags||[],
  ...(asset.isCreativePreset?{isCreativePreset:true}:{}),
  tapeAxis:asset.tapeAxis??null,tapeFlatCrop:asset.tapeFlatCrop??null,tapeRepeatMode:asset.tapeRepeatMode??null,tapeRepeatPeriodMM:asset.tapeRepeatPeriodMM??null,
  tapeRepeatStartMM:asset.tapeRepeatStartMM??null,tapeRepeatEndMM:asset.tapeRepeatEndMM??null};
}
export function assetFromSourceSnapshot(snapshot,{frozenRevision=false}={}){
 const d=snapshot.descriptor;
 craftAssert(d&&d.assetID===snapshot.assetID,'INVALID_SOURCE_SNAPSHOT','素材来源快照缺失或编号不一致');
 const asset={id:snapshot.assetID,title:snapshot.title,kind:snapshot.kind,role:snapshot.role,tags:snapshot.tags,
  ...(snapshot.isCreativePreset?{isCreativePreset:true}:{}),
  blobId:d.blobId,originalBlobId:d.originalBlobId,staticPath:d.staticPath,physicalWidthMM:d.widthMM,physicalHeightMM:d.heightMM,
  imageSize:d.imageSize,processingRecord:d.processingRecord,sourceSilhouette:d.sourceSilhouette,imageHash:d.imageHash,orientation:d.orientation,
  updatedAt:snapshot.updatedAt,tapeAxis:snapshot.tapeAxis,tapeFlatCrop:snapshot.tapeFlatCrop??null,tapeRepeatMode:snapshot.tapeRepeatMode,tapeRepeatPeriodMM:snapshot.tapeRepeatPeriodMM,
  tapeRepeatStartMM:snapshot.tapeRepeatStartMM,tapeRepeatEndMM:snapshot.tapeRepeatEndMM};
 if(frozenRevision)Object.defineProperty(asset,frozenTaskRevision,{value:snapshot.sourceRevision});
 return asset;
}
