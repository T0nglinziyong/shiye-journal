const clamp=value=>Math.max(0,Math.min(1,value));

/** Keep a rectangular crop inside the recorded visible paper, not its transparent image padding. */
export function visibleSourceBoundsMm(asset){
 const width=Number(asset.physicalWidthMM),height=Number(asset.physicalHeightMM);
 if(!(width>0&&height>0))throw new RangeError('裁剪素材缺少真实毫米尺寸');
 const input=asset.visualBoundsRatio;
 const box=Array.isArray(input)&&input.length===4&&input.every(Number.isFinite)?input.map(clamp):[0,0,1,1];
 if(box[2]-box[0]<.05||box[3]-box[1]<.05)return [0,0,width,height];
 return [box[0]*width,box[1]*height,box[2]*width,box[3]*height];
}

export function visibleCropRegion(asset,widthMm,heightMm){
 const [x0,y0,x1,y1]=visibleSourceBoundsMm(asset);
 const width=Math.min(Number(widthMm),x1-x0),height=Math.min(Number(heightMm),y1-y0);
 if(!(width>0&&height>0))throw new RangeError('裁剪目标需要正数毫米尺寸');
 return {shape:'rect',space:'source',unit:'mm',box:[(x0+x1-width)/2,(y0+y1-height)/2,width,height]};
}
