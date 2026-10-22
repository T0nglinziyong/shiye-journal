import React from 'react';
import {seriesCoverLayout} from './series-cover-layout.js';
import {TapeAssetImage} from './tape-asset-image.jsx';
export function SeriesArtwork({members,mode='auto',source,priority=false}){
 const {kind,slots}=seriesCoverLayout(members.length,mode);
 return <div className="series-cover-artwork" data-cover-layout={kind} aria-label={kind==='fan'?'扇形系列预览':'矩阵系列预览'}>
  {members.slice(0,5).map((asset,i)=>{const slot=slots[i],src=source(asset.blobId)||asset.staticPath;return <span key={asset.id} className="series-cover-slot" data-cover-index={i} style={{left:`${slot.x*100}%`,top:`${slot.y*100}%`,width:`${slot.w*100}%`,height:`${slot.h*100}%`,zIndex:slot.z,transform:`translate(-50%,-50%) rotate(${slot.rotation}deg)`}}>
   {src?<TapeAssetImage asset={asset} src={src} alt={asset.title} priority={priority}/>:<span className="series-cover-empty">无预览</span>}
  </span>;})}
  {!members.length?<span className="series-cover-empty">添加素材后显示封面</span>:null}
 </div>;
}
