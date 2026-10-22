// The single source-pixel -> processed-material painter. Callers own transform,
// opacity and compositing. Used by full Scene export and used-piece thumbnails.
import {clipMaterial} from './material-mask.js';
import {sceneLayerStyle,applyVectorMask} from './scene-model.js';
import {paintTapeStrip} from './tape-strip.js';
export function paintSceneMaterial(ctx,item,image){
 const w=image.naturalWidth||image.width,h=image.naturalHeight||image.height;
 if(!(w>0&&h>0))throw Error('素材图像尺寸无效');
 ctx.scale(item.isFlippedHorizontally?-1:1,1);
 const style=sceneLayerStyle(item);if(style.mask)applyVectorMask(ctx,style.mask,item.width,item.height);
 if(item.tapeStrip){paintTapeStrip(ctx,item,image);return;}
 clipMaterial(ctx,item);
 const crop=item.cropRect||{x:0,y:0,width:1,height:1};
 ctx.drawImage(image,crop.x*w,crop.y*h,crop.width*w,crop.height*h,-item.width/2,-item.height/2,item.width,item.height);
}
