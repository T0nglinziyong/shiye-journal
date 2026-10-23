// A reference image is a separate raster artifact, never a physical material.
import {existsSync,statSync,readFileSync,realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {previewImageFormat} from './offline-preview.js';
export function verifyImageReference(source){
 if(source.creationMode!=='hybrid')return null;
 const declared=source.referenceImage,path=declared?.image||'output/image-draft.png';
 if(!/^(reference\/draft\.(png|jpg|webp)|output\/image-draft\.png)$/.test(path))throw Error('混合参考图路径无效');
 if(!existsSync(path)||statSync(path).size>40000000||!realpathSync(path).startsWith(realpathSync(path.split('/')[0])+'/'))throw Error('混合模式缺少独立参考图或图片超出限制；不能仅交付 Scene 截图');
 const bytes=readFileSync(path),format=previewImageFormat(bytes),sha256='sha256:'+createHash('sha256').update(bytes).digest('hex');
 if(!format||(!declared&&format.mimeType!=='image/png'))throw Error('混合参考图格式无效');
 if(declared&&declared.sha256!==sha256)throw Error('混合参考图已改变，请恢复导出时的原图');
 return {image:path,sha256,role:'generated-visual-reference-not-source',fidelity:'not-lossless',semanticReview:'agent-required'};
}
