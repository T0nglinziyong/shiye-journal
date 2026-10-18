import React,{useEffect,useRef,useState} from 'react';
import {tapeFlatCanvas} from './tape-flat-crop.js';
import {scheduleForegroundIdle} from './foreground-idle.js';

// The source img remains the library's original PNG. The visible canvas is a
// disposable view of that PNG and is never written back to storage.
export function TapeAssetImage({asset,src,alt='',loading='lazy',priority=false,onFlatCrop}){
  const image=useRef(null),canvas=useRef(null),[ready,setReady]=useState(false);
  const [loaded,setLoaded]=useState(0);
  const crop=JSON.stringify(asset?.tapeFlatCrop??null),axis=asset?.tapeAxis==='y'?'y':
    asset?.tapeAxis==='x'?'x':Number(asset?.physicalWidthMM)>=Number(asset?.physicalHeightMM)?'x':'y';
  const tape=asset?.kind==='tape';
  useEffect(()=>{
    setReady(false);
    const original=image.current,view=canvas.current;
    if(!tape||!original||!view||!original.complete||!original.naturalWidth)return;
    return scheduleForegroundIdle(()=>{try{
      const flat=tapeFlatCanvas(original,axis,asset.tapeFlatCrop,{maxSize:640});
      if(!flat)return;
      view.width=flat.canvas.width;view.height=flat.canvas.height;
      view.getContext('2d').drawImage(flat.canvas,0,0);
      onFlatCrop?.(flat.crop);
      setReady(true);
    }catch{/* An unavailable source keeps the normal image visible. */}},
    {minIdleMs:priority?250:700});
  },[src,tape,crop,axis,loaded]);
  return <><img ref={image} data-asset-image-id={asset?.id} loading={loading}
    fetchPriority={priority?'high':undefined} decoding="async" src={src} alt={alt}
    onLoad={()=>setLoaded(value=>value+1)} style={ready?{display:'none'}:undefined}/>
    {tape?<canvas ref={canvas} className="tape-flat-preview" style={ready?undefined:{display:'none'}}
      role="img" aria-label={alt}/>:null}</>;
}
