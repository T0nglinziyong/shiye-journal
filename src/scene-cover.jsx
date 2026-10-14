import React,{useEffect,useState} from 'react';
import {sceneDisplaySiblings} from './craft-display.js';
import {sceneLayerStyle,maskSVG} from './scene-model.js';
import {materialMaskProperties} from './material-mask.js';
import {shapePreview} from './shape-preview.js';
import {textFontFamily,textLineHeight} from './editor-tools-model.js';
import {smoothInkSVG} from './ink-path-geometry.js';
import {pressureInkPath} from './pressure-ink.js';

const percent=value=>`${value*100}%`;
const numeric=value=>Number.isFinite(Number(value))?Number(value):0;
const at=point=>`${numeric(point.x)} ${numeric(point.y)}`;

function InkCover({node,draft}){
  const points=(node.points||[]).filter(point=>Number.isFinite(Number(point?.x))&&
    Number.isFinite(Number(point?.y)));
  if(!points.length)return null;
  const color=/^#[0-9a-f]{6}$/i.test(node.color||'')?node.color:'#30463d';
  const width=Math.max(.1,Math.min(1000,numeric(node.width)||2));
  const line={fill:'none',stroke:color,strokeWidth:width,strokeLinecap:'round',strokeLinejoin:'round'};
  let drawing;
  if(node.penStyle==='pressure')drawing=<path d={pressureInkPath(node)} fill={color}/>;
  else if(points.length===1)drawing=<circle cx={numeric(points[0].x)} cy={numeric(points[0].y)}
    r={width/2} fill={color}/>;
  else if(node.penStyle==='brush')drawing=points.slice(1).map((point,index)=>{
    const prior=points[index],pressure=Math.max(0,Math.min(1,
      ((numeric(prior.p??.5)+numeric(point.p??.5))/2)));
    return <path key={index} d={`M${at(prior)} L${at(point)}`} {...line}
      strokeWidth={width*(.35+.9*pressure)}/>;
  });
  else drawing=<path d={smoothInkSVG(points,numeric)} {...line}/>;
  return <svg className="scene-ink-object" viewBox={`0 0 ${draft.canvas.width} ${draft.canvas.height}`}
    preserveAspectRatio="none" aria-hidden="true" style={{position:'absolute',inset:0,width:'100%',
      height:'100%',zIndex:node.zIndex??2000,opacity:node.opacity??1,pointerEvents:'none',
      mixBlendMode:node.blendMode==='multiply'?'multiply':undefined}}>{drawing}</svg>;
}

function CoverNode({node,draft,asset,source}){
  if(node.hidden||node.isHidden||node.isParked||node.parked)return null;
  if(node.type==='group'){
    const {mask,blendMode}=sceneLayerStyle(node);
    const maskImage=mask?`url("data:image/svg+xml,${encodeURIComponent(maskSVG(mask))}")`:undefined;
    return <span className="scene-v2-group" style={{zIndex:node.zIndex??0,
      opacity:node.opacity??1,mixBlendMode:blendMode==='multiply'?'multiply':'normal',
      maskImage,WebkitMaskImage:maskImage,maskSize:mask?'100% 100%':undefined}}>
      {sceneDisplaySiblings(node.children||[]).map((child,index)=><CoverNode key={child.renderKey||child.id||index}
        node={child} draft={draft} asset={asset} source={source}/>)}</span>;
  }
  if(node.type==='ink')return <InkCover node={node} draft={draft}/>;
  const style={left:percent((node.x-node.width/2)/draft.canvas.width),
    top:percent((node.y-node.height/2)/draft.canvas.height),
    width:percent(node.width/draft.canvas.width),height:percent(node.height/draft.canvas.height),
    transform:`rotate(${node.rotation||0}deg)${node.type==='material'&&node.isFlippedHorizontally?' scaleX(-1)':''}`,
    opacity:node.opacity??1,zIndex:node.zIndex??0,
    mixBlendMode:node.blendMode==='multiply'?'multiply':undefined};
  if(node.type==='shape')return <span className="work-shape" style={style}>
    <img className="shape-preview" src={shapePreview(node)} alt=""/></span>;
  if(node.type==='text'){
    const spacing=(node.paragraphSpacing||0)/draft.canvas.width*100+'cqw';
    const children=node.paragraphSpacing?String(node.content||'').split('\n').map((part,index)=><span
      key={index} style={{display:'block',marginTop:index?spacing:undefined}}>{part||'\u200b'}</span>):node.content;
    return <span className="work-text" style={{...style,
      fontSize:Math.max(.6,node.fontSize/draft.canvas.width*100)+'cqw',
      lineHeight:textLineHeight(node)/draft.canvas.width*100+'cqw',color:node.color||'#333',
      textAlign:node.alignment||'left',fontFamily:textFontFamily(node)}}>{children}</span>;
  }
  if(node.type==='material'){
    const record=asset(node.assetID);
    if(!record)return null;
    const crop=node.cropRect||{x:0,y:0,width:1,height:1};
    const mask=node.materialMask?materialMaskProperties(node.materialMask):{};
    return <span className="work-material" style={{...style,...mask}}><span style={{position:'absolute',inset:0}}>
      <img data-asset-image-id={record.id} loading="lazy" decoding="async" alt=""
        src={source(record.blobId)||record.staticPath} style={{position:'absolute',maxWidth:'none',
          width:percent(1/crop.width),height:percent(1/crop.height),
          left:percent(-crop.x/crop.width),top:percent(-crop.y/crop.height),objectFit:'fill'}}/>
    </span></span>;
  }
  return null;
}

// React owns the thumbnail DOM; Scene v2 remains the only saved geometry.
export function SceneCover({draft,asset,source,priority=false,snapshotOnly=false,
  cloudEnabled=false,localCover='',projectID=null}){
  const [,refresh]=useState(0),[error,setError]=useState('');
  useEffect(()=>{
    if(!projectID)return;
    const update=event=>{
      if(event.detail?.projectID!==projectID)return;
      if(event.detail.error)setError(event.detail.error);
      refresh(value=>value+1);
    };
    window.addEventListener('shiye-react-cover-update',update);
    return ()=>window.removeEventListener('shiye-react-cover-update',update);
  },[projectID]);
  if(!draft)return null;
  const direct=draft.coverImageID||draft.coverBlobId;
  const local=typeof localCover==='function'?localCover():localCover;
  const cached=direct?source(direct):(snapshotOnly&&cloudEnabled?local:'');
  if(cached)return <img className="work-reference" loading={priority?'eager':'lazy'}
    fetchPriority={priority?'high':undefined} decoding="async" src={cached} alt="作品完整封面"/>;
  if(snapshotOnly&&cloudEnabled&&!draft.layers?.length)return <span className="work-cover-pending"
    role="status">{error||'正在准备预览…'}</span>;
  return sceneDisplaySiblings(draft.layers||[]).map((node,index)=><CoverNode
    key={node.renderKey||node.id||index} node={node} draft={draft} asset={asset} source={source}/>);
}
