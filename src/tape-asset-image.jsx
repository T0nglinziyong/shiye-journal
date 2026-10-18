import React,{useLayoutEffect,useRef,useState} from 'react';
import {tapeFlatCanvas} from './tape-flat-crop.js';
import {scheduleForegroundIdle} from './foreground-idle.js';

// Reuse the derived display view across cards and route changes. The original
// PNG stays immutable; the raw image is never painted while a tape loads.
const flatViews=new Map();
let cachedPixels=0;
const maxPixels=8_000_000;
function getFlatView(key){
  const value=flatViews.get(key);
  if(value){flatViews.delete(key);flatViews.set(key,value);}
  return value;
}
function cacheFlatView(key,value){
  const old=flatViews.get(key);
  if(old)cachedPixels-=old.canvas.width*old.canvas.height;
  flatViews.delete(key);flatViews.set(key,value);
  cachedPixels+=value.canvas.width*value.canvas.height;
  while(cachedPixels>maxPixels&&flatViews.size>1){
    const first=flatViews.keys().next().value,removed=flatViews.get(first);
    cachedPixels-=removed.canvas.width*removed.canvas.height;
    flatViews.delete(first);
  }
}
export function TapeAssetImage({asset,src,alt='',loading='lazy',priority=false,onFlatCrop}){
  const image=useRef(null),canvas=useRef(null),[ready,setReady]=useState(false);
  const [loaded,setLoaded]=useState(0);
  const crop=JSON.stringify(asset?.tapeFlatCrop??null),axis=asset?.tapeAxis==='y'?'y':
    asset?.tapeAxis==='x'?'x':Number(asset?.physicalWidthMM)>=Number(asset?.physicalHeightMM)?'x':'y';
  const tape=asset?.kind==='tape';
  useLayoutEffect(()=>{
    if(!tape)return;
    const maxSize=priority?640:480,key=JSON.stringify([src,axis,crop,maxSize]);
    const original=image.current,view=canvas.current;
    if(!view)return;
    const paint=flat=>{
      view.width=flat.canvas.width;view.height=flat.canvas.height;
      view.getContext('2d').drawImage(flat.canvas,0,0);
      onFlatCrop?.(flat.crop,{width:view.width,height:view.height});
      setReady(true);
    };
    const cached=getFlatView(key);
    if(cached){paint(cached);return;}
    setReady(false);
    if(!original?.complete||!original.naturalWidth)return;
    return scheduleForegroundIdle(()=>{try{
      const reused=getFlatView(key);
      if(reused){paint(reused);return;}
      const flat=tapeFlatCanvas(original,axis,asset.tapeFlatCrop,{maxSize});
      if(!flat)return;
      cacheFlatView(key,flat);paint(flat);
    }catch{/* Keep a blank placeholder instead of showing the untrimmed PNG. */}},
    {minIdleMs:priority?250:700});
  },[src,tape,crop,axis,loaded]);
  return <><img ref={image} data-asset-image-id={asset?.id} loading={priority?'eager':loading}
    fetchPriority={priority?'high':undefined} decoding="async" src={src} alt={alt}
    aria-hidden={tape||undefined} onLoad={()=>setLoaded(value=>value+1)}
    style={tape?{position:'absolute',width:1,height:1,opacity:0,pointerEvents:'none'}:undefined}/>
    {tape?<canvas ref={canvas} className="tape-flat-preview" style={ready?undefined:{visibility:'hidden'}}
      role="img" aria-label={alt}/>:null}</>;
}
