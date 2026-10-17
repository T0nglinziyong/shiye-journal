import {assertSceneEditable,findSceneNode,validateSceneExtensions} from './scene-v2.js';
import {applyRegionOperation,maskToGeometry} from './craft-region-ops.js';
import {normalizeGeometry,transformGeometry,geometryIntersection,geometryArea,AREA_EPSILON} from './craft-topology.js';
import {buildMaterialLedger,compactMaterialLedger} from './material-ledger.js';

const finite=(n,label)=>{if(!Number.isFinite(n))throw Error(label+' 必须是有限数字');return n;};
const materialAsset=(assets,id)=>{
  const asset=assets.find(row=>row.id===id);
  if(!asset||!(asset.physicalWidthMM>0&&asset.physicalHeightMM>0))throw Error('替换素材缺少已标定来源：'+id);
  return asset;
};
const siblingsFor=(nodes,id)=>{
  for(const node of nodes){
    if(node.id===id)return nodes;
    if(node.type==='group'){
      const found=siblingsFor(node.children||[],id);if(found)return found;
    }
  }
  return null;
};
const baseline=node=>{node.generationBaseline={x:node.x,y:node.y,width:node.width,height:node.height,
  rotation:node.rotation||0,zIndex:node.zIndex||0,cropRect:node.cropRect||null,
  materialMask:node.materialMask||null,operation:node.operation||{op:'whole'},
  materialSteps:structuredClone(node.materialSteps||[])};};
const refreshLedger=(draft,assets)=>{draft.craftLedger=compactMaterialLedger(buildMaterialLedger(draft,assets));};

// A physical replacement preserves the visual anchor and stacking. Its frame
// must follow the new source's calibrated dimensions, never stretch the image.
export function replaceSceneMaterial(draft,id,assetID,assets){
  const node=assertSceneEditable(draft,id);
  if(node.type!=='material')throw Error('只能替换真实素材图层');
  const asset=materialAsset(assets,assetID);
  if(draft.items.some(other=>other.id!==id&&other.assetID===assetID&&!other.manualVisualCopy))
    throw Error('新素材已被本页取用；请先处理其现有片段');
  const scale=draft.canvas.height/draft.physicalPageHeightMM;
  for(const key of ['cropRect','materialMask','materialSteps','operation','craftDisplaySlices',
    'materialRelation','craftProvenance','manualVisualResize','manualVisualCopy','vectorMask'])delete node[key];
  node.assetID=asset.id;
  if(asset.blobId)node.sourceBlobId=asset.blobId;else delete node.sourceBlobId;
  if(asset.staticPath)node.sourceStaticPath=asset.staticPath;else delete node.sourceStaticPath;
  node.width=asset.physicalWidthMM*scale;node.height=asset.physicalHeightMM*scale;
  node.materialUnitIndex=0;node.userOverrideFlags=[];
  baseline(node);refreshLedger(draft,assets);return node;
}

// A repeatable digital stamp is just a family of independent vector layers;
// it introduces no duplicate physical stock and remains editable one by one.
export function repeatSceneStamp(draft,id,placements){
  const source=assertSceneEditable(draft,id);
  if(source.type!=='shape')throw Error('数字印章来源必须是图形');
  if(!Array.isArray(placements)||!placements.length||placements.length>64)throw Error('一次可重复盖印 1–64 次');
  const siblings=siblingsFor(draft.layers,id);
  const result=[];
  let serial=1;
  for(const placement of placements){
    while(findSceneNode(draft,`${id}-stamp-${serial}`))serial++;
    const next=structuredClone(source);next.id=`${id}-stamp-${serial++}`;
    next.x=finite(placement.x,'印章横坐标');next.y=finite(placement.y,'印章纵坐标');
    next.rotation=finite(placement.rotation??source.rotation??0,'印章旋转');
    const factor=finite(placement.scale??1,'印章比例');
    if(factor<=0||factor>8)throw Error('印章比例需在 0–8 之间');
    next.width=source.width*factor;next.height=source.height*factor;
    next.zIndex=finite(placement.zIndex??source.zIndex??0,'印章层级');
    if(placement.fill!==undefined)next.fill=placement.fill;
    delete next.aiManaged;delete next.agentKey;delete next.key;
    siblings.push(next);result.push(next);
  }
  return result;
}

// The layout source is a Scene snapshot, not an image. Digital geometry is
// transferred proportionally; mapped physical items keep their real size.
export function reuseSceneLayout(draft,layout,materialMap,assets,prefix){
  if(!/^[A-Za-z0-9_-]{1,64}$/.test(prefix||''))throw Error('布局编号前缀无效');
  const source=structuredClone(layout);validateSceneExtensions(source);
  if(!source.layers.length)throw Error('复用布局没有图层');
  const sx=draft.canvas.width/source.canvas.width,sy=draft.canvas.height/source.canvas.height;
  const cloned=[];
  const copy=node=>{
    const next=structuredClone(node);next.id=prefix+'-'+node.id;
    if(findSceneNode(draft,next.id))throw Error('复用布局编号已存在：'+next.id);
    delete next.aiManaged;delete next.agentKey;delete next.key;
    if(node.type==='group'){
      next.children=node.children.map(copy).filter(Boolean);return next.children.length?next:null;
    }
    if(node.type==='material'){
      const target=materialMap?.[node.assetID];if(!target)return null;
      const asset=materialAsset(assets,target);
      next.assetID=asset.id;next.x*=sx;next.y*=sy;
      next.width=asset.physicalWidthMM*draft.canvas.height/draft.physicalPageHeightMM;
      next.height=asset.physicalHeightMM*draft.canvas.height/draft.physicalPageHeightMM;
      if(asset.blobId)next.sourceBlobId=asset.blobId;else delete next.sourceBlobId;
      if(asset.staticPath)next.sourceStaticPath=asset.staticPath;else delete next.sourceStaticPath;
      for(const field of ['cropRect','materialMask','materialSteps','craftDisplaySlices',
        'craftProvenance','materialRelation','manualVisualResize','manualVisualCopy','vectorMask','creativePieceID'])delete next[field];
      next.materialUnitIndex=0;next.userOverrideFlags=[];baseline(next);
    }else if(node.type==='ink'){
      next.points=node.points.map(point=>({...point,x:point.x*sx,y:point.y*sy}));
      next.width*=Math.sqrt(sx*sy);
    }else{
      next.x*=sx;next.y*=sy;next.width*=sx;next.height*=sy;
      if(node.type==='text'){
        next.fontSize*=Math.sqrt(sx*sy);
        if(Number.isFinite(next.curveHeight))next.curveHeight*=sy;
      }
    }
    return next;
  };
  for(const node of source.layers){const value=copy(node);if(value)cloned.push(value);}
  draft.layers.push(...cloned);refreshLedger(draft,assets);return cloned;
}

// Numeric glyph outlines come from runtime/glyphs.cjs using a local font.
// Only the resulting geometry enters Scene; no font file or fake white text.
export function knockoutSceneGlyphs(draft,id,geometryMM,originMM,assets,permission='不预设'){
  const node=assertSceneEditable(draft,id);
  if(node.type!=='material')throw Error('字形镂空只可应用于真实素材');
  const asset=materialAsset(assets,node.assetID);
  if(!Array.isArray(originMM)||originMM.length!==2)throw Error('字形位置需为两个毫米坐标');
  const [x,y]=originMM.map((v,i)=>finite(v,i?'字形纵坐标':'字形横坐标'));
  const geometry=transformGeometry(normalizeGeometry(geometryMM),point=>[point[0]+x,point[1]+y]);
  const crop=node.cropRect||{x:0,y:0,width:1,height:1};
  if(geometryArea(geometryIntersection(geometry,maskToGeometry(node.materialMask,
    crop.width*asset.physicalWidthMM,crop.height*asset.physicalHeightMM)))<=AREA_EPSILON)
    throw Error('字形镂空没有落在当前裁片上');
  const result=applyRegionOperation({operation:{op:'cut_shape',shape:'geometry',mode:'remove',unit:'mm',geometry},
    current:crop,mask:node.materialMask||null,asset,permission});
  node.materialMask=result.mask;
  node.materialSteps=[...(node.materialSteps||[]),{op:'cut_shape',shape:'geometry',mode:'remove',unit:'mm',geometry}];
  node.operation=node.materialSteps.at(-1);baseline(node);refreshLedger(draft,assets);return node;
}
