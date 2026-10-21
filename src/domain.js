import {paperDimensions,paperPresets} from './paper-sizes.js';
import {attachSceneV2} from './scene-v2.js';
export const uid=()=>crypto.randomUUID();
export const A4={width:210,height:297};
export const ratioMap={...Object.fromEntries(paperPresets.map(p=>[p.id,p.width/p.height])),portrait:3/4,square:1,landscape:4/3};
export function customPaper(ratio){return typeof ratio==='string'&&ratio.startsWith('custom:')?paperDimensions(ratio):null;}
export function canvasSize(mode='single',ratio='a4'){const height=1000,custom=customPaper(ratio);return {width:height*(custom?custom.width/custom.height:(ratioMap[ratio]||ratioMap.a4))*(mode==='spread'?2:1),height};}
export function draft({mode='single',ratio='a4',style='airy'}={}){return attachSceneV2({id:uid(),style,canvas:canvasSize(mode,ratio),pageMode:mode,pageRatio:ratio,physicalPageHeightMM:paperDimensions(ratio)?.height||297,paperColor:'#fcfaf0',paperPattern:'plain',sceneVersion:2,layers:[],makingSteps:[],createdAt:new Date().toISOString()});}
export function setDraftPaperSize(d,ratio){
  const size=paperDimensions(ratio);
  if(!size)throw Error('纸张规格无效');
  const before=d.canvas,after=canvasSize(d.pageMode,ratio),oldHeightMM=d.physicalPageHeightMM||297;
  const oldScale=oldHeightMM/before.height,newScale=size.height/after.height;
  const move=(item)=>{
    if(Number.isFinite(item.x))item.x=after.width/2+(item.x-before.width/2)*oldScale/newScale;
    if(Number.isFinite(item.y))item.y=after.height/2+(item.y-before.height/2)*oldScale/newScale;
    if(Number.isFinite(item.width))item.width*=oldScale/newScale;
    if(Number.isFinite(item.height))item.height*=oldScale/newScale;
  };
  // One Scene v2 tree owns all visible geometry. Resizing the page must
  // preserve physical coordinates for ink, typography and shapes as well as
  // real inventory items; otherwise those layers drift away from their paper.
  const transform=(nodes)=>{
    for(const node of nodes){
      if(node.type==='group'){transform(node.children||[]);continue;}
      if(node.type==='ink'){
        node.points=(node.points||[]).map(point=>({
          ...point,
          x:after.width/2+(point.x-before.width/2)*oldScale/newScale,
          y:after.height/2+(point.y-before.height/2)*oldScale/newScale
        }));
        if(Number.isFinite(node.width))node.width*=oldScale/newScale;
        continue;
      }
      move(node);
      if(node.type==='material'&&node.generationBaseline)move(node.generationBaseline);
      if(node.type==='text'){
        for(const key of ['fontSize','letterSpacing','lineSpacing','fixedLineHeight','paragraphSpacing'])
          if(Number.isFinite(node[key]))node[key]*=oldScale/newScale;
      }
      if(node.type==='shape'&&Number.isFinite(node.lineWidth))node.lineWidth*=oldScale/newScale;
    }
  };
  transform(d.layers);

  d.pageRatio=ratio;d.canvas=after;d.physicalPageHeightMM=size.height;
  return d;
}
export function project(title='未命名手账',options={}){const d=draft(options),snapshot=structuredClone(d);return {id:uid(),title,drafts:[d],activeDraftID:d.id,source:options.style==='imported'?'imported':'created',isUsed:false,isDraft:true,styleTags:[],candidateAssetIDs:[],updatedAt:new Date().toISOString(),lastOpenedAt:new Date().toISOString(),editHistory:{undo:[],redo:[]},manualArchives:[],initialEditorSnapshot:{drafts:[structuredClone(snapshot)],activeDraftID:d.id},draftHistorySnapshots:{[d.id]:snapshot}};}
export function itemFromAsset(asset,d,x,y,zIndex=10,strict=true){const h=(asset.physicalHeightMM||35)/((d.physicalPageHeightMM||297))*d.canvas.height;const w=(asset.physicalWidthMM||35)/(d.physicalPageHeightMM||297)*d.canvas.height;const base={x,y,width:w,height:h,rotation:0,zIndex};return {id:uid(),type:'material',assetID:asset.id,...(asset.blobId?{sourceBlobId:asset.blobId}:{}),...(asset.staticPath?{sourceStaticPath:asset.staticPath}:{}),...base,isLocked:false,isParked:false,cropZoom:1,cropOffsetX:0,cropOffsetY:0,isFlippedHorizontally:false,opacity:1,generationBaseline:structuredClone(base),materialUnitIndex:0,userOverrideFlags:[]};}
export function physicalPlacement(d,assets,ids){const seen=new Set();const result=[];const height=d.canvas.height,width=d.canvas.width;for(const id of ids){const asset=assets.find(a=>a.id===id);if(!asset||!(asset.physicalWidthMM>0&&asset.physicalHeightMM>0)||seen.has(id))continue;seen.add(id);const base=itemFromAsset(asset,d,0,0,10+result.length,true);const cell=result.length;const cols=3;const x=(cell%cols+.5)*width/cols,y=(Math.floor(cell/cols)+.5)*height/3;if(base.width>width/cols*.95||base.height>height/3*.95)continue;base.x=Math.max(base.width/2,Math.min(width-base.width/2,x));base.y=Math.max(base.height/2,Math.min(height-base.height/2,y));base.generationBaseline={x:base.x,y:base.y,width:base.width,height:base.height,rotation:0,zIndex:base.zIndex};result.push(base);}return result;}
export function recommend(core,candidates,series=[]){const cTags=new Set([...(core.tags||[]),...(core.styleTags||[]),...(core.contentTags||[])]);return candidates.filter(a=>a.id!==core.id&&a.reviewStatus==='ready'&&!a.isProjectInternal&&a.usageStatus!=='used').map(a=>{let score=0;const reasons=[];const shared=(a.tags||[]).filter(x=>cTags.has(x));if(shared.length){score+=shared.length*2;reasons.push('共同标签：'+shared.slice(0,2).join('、'));}if(core.seriesID&&a.seriesID===core.seriesID){score+=2;reasons.push('同系列');}if(core.role!==a.role){score+=2;reasons.push('互补视觉角色');}if(core.kind!==a.kind){score+=1;reasons.push('不同材质层次');}const colors=(a.palette||[]).map(x=>x.toLowerCase());if((core.palette||[]).some(x=>colors.includes(x.toLowerCase()))){score+=2;reasons.push('呼应配色');}if(a.physicalWidthMM&&a.physicalHeightMM){score+=1;reasons.push('已记录实物尺寸');}return {asset:a,score,reasons};}).sort((a,b)=>b.score-a.score||a.asset.title.localeCompare(b.asset.title));}
export function validatePhysicalDraft(d,assets){const usage=new Set(),errors=[];for(const item of d.items){const a=assets.find(x=>x.id===item.assetID);if(!a){errors.push('缺少素材 '+item.assetID);continue;}if(a.kind!=='tape'&&usage.has(a.id)&&!item.cropRect)errors.push(a.title+' 在当前方案中已取用；请裁切原素材');usage.add(a.id);if(!item.generationBaseline)errors.push(a.title+' 缺少生成基线');if(!(a.physicalWidthMM>0&&a.physicalHeightMM>0))errors.push(a.title+' 没有实物尺寸');}return errors;}
export function textBlock(content,d){return {id:uid(),type:'text',content,x:d.canvas.width*.5,y:d.canvas.height*.16,width:d.canvas.width*.72,height:135,fontSize:40,style:'serif',fontName:'Songti SC',color:'#30463d',zIndex:1001,rotation:0,alignment:'center',bold:false,italic:false};}
export function primitive(kind,d){return {id:uid(),type:'shape',kind,x:d.canvas.width*.5,y:d.canvas.height*.5,width:160,height:80,rotation:0,zIndex:500,fill:'#e3eee8',stroke:'#477463',lineWidth:3,fillOpacity:1,strokeOpacity:1,strokeDash:'solid',opacity:1,hidden:false,locked:false};}
