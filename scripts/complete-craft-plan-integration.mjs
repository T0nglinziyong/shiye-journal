import {readFileSync,writeFileSync} from 'node:fs';
function patch(path,from,to){const text=readFileSync(path,'utf8'),i=text.indexOf(from);if(i<0||text.indexOf(from,i+from.length)>=0)throw Error('Unexpected source anchor '+path+': '+from.slice(0,80));writeFileSync(path,text.slice(0,i)+to+text.slice(i+from.length));}
patch('src/material-anatomy-ui.js',"import './material-anatomy.css';",'const anatomyStyleURL=new URL(\'./material-anatomy.css\',import.meta.url).href;');
patch('src/material-anatomy-ui.js','export function mountMaterialAnatomy(c,asset,controls,tabs){',`export function mountMaterialAnatomy(c,asset,controls,tabs){
 if(!document.querySelector('link[data-anatomy-style]')){const link=document.createElement('link');link.rel='stylesheet';link.href=anatomyStyleURL;link.dataset.anatomyStyle='';document.head.append(link);}`);
patch('src/material-anatomy.css','.material-info-tabs{flex-wrap:wrap}', '.material-editor-controls>.cutout-tabs{flex-wrap:wrap}');
patch('src/craft-task.js',"  craftAssert(assetSourceRevision(current)===snapshot.sourceRevision,'STALE_SOURCE'", "  craftAssert(craftDigest(current.anatomy??null)===craftDigest(snapshot.anatomy??null),'STALE_REGION_SOURCE','已确认区域在导出后改变，请重新导出任务',{assetId:item.assetID});\n  craftAssert(assetSourceRevision(current)===snapshot.sourceRevision,'STALE_SOURCE'");
patch('src/craft-plan.js',"import {assetSourceRevision,resolveMaterialRegion}","import {assetSourceRevision,resolveMaterialRegion,readMaterialRegions,sourceRegionGeometry}");
patch('src/craft-plan.js','   record.wasteAreaMM2=remainingArea;',`   for(const region of readMaterialRegions(parent.asset,{confirmedOnly:true}).filter(r=>r.preserve)){
    const protectedGeometry=sourceRegionGeometry(parent.asset,region,{mode:region.outlineRatio?'outline':'bounds'});
    const retained=geometryArea(geometryDifference(protectedGeometry,remaining));
    craftAssert(Math.abs(retained-geometryArea(protectedGeometry))<=AREA_EPSILON,'PROTECTED_REGION_DISCARDED','计划不能把已保护区域作为损耗丢弃',{assetId:parent.asset.id,constraint:region.id});
   }
   record.wasteAreaMM2=remainingArea;`);
console.log('Anatomy/source guards integrated.');
