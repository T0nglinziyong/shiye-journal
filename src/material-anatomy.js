import {craftDigest} from './craft-fingerprint.js';
import {craftAssert} from './craft-errors.js';

export function assetVisualDescriptor(asset){
 return {assetID:asset.id,blobId:asset.blobId??null,originalBlobId:asset.originalBlobId??null,staticPath:asset.staticPath??null,
  widthMM:asset.physicalWidthMM,heightMM:asset.physicalHeightMM,imageSize:asset.imageSize??null,
  processingRecord:asset.processingRecord??null,sourceSilhouette:asset.sourceSilhouette??null,
  imageHash:asset.imageHash??asset.contentHash??null,orientation:asset.orientation??null};
}
function physicalSupply(asset){
 const supply=asset.supply??{quantity:1},quantity=supply.quantity??1;
 if(supply.kind==='tapeRoll')return {kind:'tapeRoll',quantity,availableLengthMM:supply.availableLengthMM??null};
 if(supply.kind==='unlimited')return {kind:'unlimited',quantity};
 return {kind:'counted',quantity};
}
const physicalSource=asset=>({...assetVisualDescriptor(asset),kind:asset.kind??null,supply:physicalSupply(asset),
 tapeRepeatMode:asset.tapeRepeatMode==='repeatablePattern'?'repeatablePattern':'singleStrip',
 tapeRepeatPeriodMM:asset.tapeRepeatMode==='repeatablePattern'?asset.tapeRepeatPeriodMM??null:null});
// Editing a title, label or series updates updatedAt without changing the
// physical material. Keep that timestamp out of new source revisions.
export const assetSourceRevision=asset=>craftDigest(physicalSource(asset));
// A saved work still refers to the library image. Metadata and inventory may
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
  kind:asset.kind,title:asset.title,role:asset.role??null,tags:asset.tags||[],supply:structuredClone(asset.supply??{quantity:1}),
  tapeRepeatMode:asset.tapeRepeatMode??null,tapeRepeatPeriodMM:asset.tapeRepeatPeriodMM??null};
}
export function assetFromSourceSnapshot(snapshot){
 const d=snapshot.descriptor;
 craftAssert(d&&d.assetID===snapshot.assetID,'INVALID_SOURCE_SNAPSHOT','素材来源快照缺失或编号不一致');
 return {id:snapshot.assetID,title:snapshot.title,kind:snapshot.kind,role:snapshot.role,tags:snapshot.tags,
  blobId:d.blobId,originalBlobId:d.originalBlobId,staticPath:d.staticPath,physicalWidthMM:d.widthMM,physicalHeightMM:d.heightMM,
  imageSize:d.imageSize,processingRecord:d.processingRecord,sourceSilhouette:d.sourceSilhouette,imageHash:d.imageHash,orientation:d.orientation,
  updatedAt:snapshot.updatedAt,supply:snapshot.supply,tapeRepeatMode:snapshot.tapeRepeatMode,tapeRepeatPeriodMM:snapshot.tapeRepeatPeriodMM};
}
