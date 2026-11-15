// SAM needs enough detail to propose regions, not the full export resolution.
// Keep the corrected source untouched for final material extraction.
export const SAM_INPUT_LONG_EDGE=1024;
export const SAM_INPUT_MIME='image/png';

export function samInputSize(width,height,longEdge=SAM_INPUT_LONG_EDGE){
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<1||height<1||longEdge<1)
    throw Error('SAM 输入尺寸无效');
  // Small phone images are enlarged to keep the A4 short edge above the
  // model's minimum input size; this cannot create detail but avoids failure.
  const scale=longEdge/Math.max(width,height);
  return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};
}

export function samInputBox(box,sourceSize,inputSize){
  const x=Math.max(0,Math.floor(box[0]*inputSize.width/sourceSize.width));
  const y=Math.max(0,Math.floor(box[1]*inputSize.height/sourceSize.height));
  const right=Math.min(inputSize.width,Math.ceil(box[2]*inputSize.width/sourceSize.width));
  const bottom=Math.min(inputSize.height,Math.ceil(box[3]*inputSize.height/sourceSize.height));
  return [x,y,Math.max(x+1,right),Math.max(y+1,bottom)];
}

export async function samInputBlob(source){
  const size=samInputSize(source.width,source.height);
  const canvas=document.createElement('canvas');canvas.width=size.width;canvas.height=size.height;
  const context=canvas.getContext('2d');context.imageSmoothingEnabled=true;
  context.imageSmoothingQuality='high';context.drawImage(source,0,0,size.width,size.height);
  // Lossless transport matters for small printed details. JPEG at 84–98
  // quality lost 1–5 proposals in the collage regression image.
  const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('SAM 输入导出失败')),SAM_INPUT_MIME));
  return {blob,size};
}
