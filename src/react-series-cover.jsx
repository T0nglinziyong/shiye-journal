import React,{useEffect,useRef,useState} from 'react';
import {seriesCovers} from './library-model.js';
import {TapeAssetImage} from './tape-asset-image.jsx';
import {seriesCoverLayout,SERIES_COVER_WIDTH,SERIES_COVER_HEIGHT} from './series-cover-layout.js';
import {loadSeriesCoverSnapshot,seriesCoverSignature} from './series-cover-snapshot.js';
import './series-cover.css';

export function SeriesCover({series,assets,source,priority=false,account='browser',preview=false}){
 const coverRef=useRef(null),[snapshot,setSnapshot]=useState(null),members=seriesCovers(series,assets);
 const layout=seriesCoverLayout(members.length,series.coverLayout);
 const total=assets.filter(a=>a.seriesID===series.id&&!a.isProjectInternal).length;
 const key=JSON.stringify([account,series.id,seriesCoverSignature(series,assets),members.map(a=>source(a.blobId)||a.staticPath||'')]);
 useEffect(()=>{
  if(preview)return;const cover=coverRef.current;if(!cover)return;let cancelled=false;
  const start=()=>void loadSeriesCoverSnapshot({cover,series,assets,account}).then(url=>{if(!cancelled&&url)setSnapshot({key,url});}).catch(()=>{});
  if(priority||typeof IntersectionObserver!=='function')start();
  else{const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){observer.disconnect();start();}},{rootMargin:'260px'});observer.observe(cover);return ()=>{cancelled=true;observer.disconnect();};}
  return ()=>{cancelled=true;};
 },[key,preview,priority]);
 return <div className="series-cover series-cover-composed" ref={coverRef} data-cover-layout={layout.kind}
   role="img" aria-label={`${series.title||'系列'}封面，展示 ${members.length} 件，共 ${total} 件素材`}>
  {layout.slots.map(slot=>{const asset=members[slot.index],src=source(asset.blobId)||asset.staticPath;
   return <span className="series-cover-item" key={asset.id} data-series-cover-item={asset.id}
     style={{left:`${slot.x/SERIES_COVER_WIDTH*100}%`,top:`${slot.y/SERIES_COVER_HEIGHT*100}%`,width:`${slot.w/SERIES_COVER_WIDTH*100}%`,height:`${slot.h/SERIES_COVER_HEIGHT*100}%`,transform:`rotate(${slot.angle}deg)`}}>
     {src?<TapeAssetImage asset={asset} src={src} alt="" maxPreviewSize={480} loading={priority?'eager':'lazy'} priority={priority}/>:<span className="series-cover-missing">暂无预览</span>}
   </span>;
  })}
  {!members.length?<span className="series-cover-empty">暂无素材</span>:null}
  {!preview&&snapshot?.key===key?<img className="series-cover-snapshot" src={snapshot.url} alt="" loading={priority?'eager':'lazy'} decoding="async"/>:null}
  {total>members.length?<span className="series-cover-more" aria-hidden="true">+{total-members.length}</span>:null}
 </div>;
}
