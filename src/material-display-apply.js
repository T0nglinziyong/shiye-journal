import {renderHighResolutionCutout} from './cutout-full-resolution.js';
import {materialStorageBlobs} from './material-storage-resolution.js';
import {rotateMaterialPNG,rotatedPhysicalSize,wrapDisplayRotation} from './material-display-rotation.js';
import {sha256Hex} from './task-fingerprint.js';

export async function applyMaterialDisplayRotation(db,previous,next,{canCommit=()=>true}={}){
  const oldAngle=wrapDisplayRotation(previous.processingRecord?.displayRotationDegrees||0),
    angle=wrapDisplayRotation(next.processingRecord?.displayRotationDegrees||0);
  if(angle===oldAngle)return {asset:next,blob:null};
  const [stored,frame,mask]=await Promise.all([
    db.get('blobs',previous.blobId),
    previous.candidateFrameBlobId?db.get('blobs',previous.candidateFrameBlobId):null,
    previous.finalMaskBlobId?db.get('blobs',previous.finalMaskBlobId):null
  ]);
  if(!(stored?.data instanceof Blob))throw Error('素材原图尚未同步，无法调整显示角度');
  const processing=next.processingRecord||{};
  const rotated=frame?.data instanceof Blob&&mask?.data instanceof Blob
    ?await renderHighResolutionCutout(frame.data,mask.data,processing)
    :await rotateMaterialPNG(stored.data,angle-oldAngle);
  const sourceWidth=processing.sourceWidthMM||previous.physicalWidthMM,
    sourceHeight=processing.sourceHeightMM||previous.physicalHeightMM,
    size=rotatedPhysicalSize(sourceWidth,sourceHeight,angle),
    explicitSize=next.physicalWidthMM!==previous.physicalWidthMM||
      next.physicalHeightMM!==previous.physicalHeightMM,
    width=explicitSize?next.physicalWidthMM:size?.width||next.physicalWidthMM,
    height=explicitSize?next.physicalHeightMM:size?.height||next.physicalHeightMM;
  const image=(await materialStorageBlobs(rotated,rotated,width,height)).cutout;
  const asset={...next,physicalWidthMM:width,physicalHeightMM:height,
    imageHash:'sha256:'+await sha256Hex(await image.arrayBuffer()),updatedAt:new Date().toISOString()};
  if(!canCommit())throw new DOMException('素材旋转已取消','AbortError');
  await db.transaction(['assets','blobs'],tx=>{
    tx.objectStore('assets').put(asset);
    tx.objectStore('blobs').put({id:asset.blobId,data:image});
  });
  return {asset,blob:image};
}
