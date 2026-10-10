import * as defaultDB from './store.js';
import {project,itemFromAsset,textBlock} from './domain.js';
import {currentMaterialCatalog} from './current-materials.js';

export const CURRENT_EXAMPLE_SOURCE='shiye-current-example-v2';
export const CURRENT_EXAMPLE_PROJECT_IDS=new Set([
  'cece-p1-project','cece-p2-project','cece-p3-project','cece-p4-project',
  'shiye-example-handmade','shiye-example-journal','shiye-example-travel'
]);
export const CURRENT_EXAMPLE_SHAPES_URL='/builtin-examples/cece/shapes.json';
const MARKER='current-example-stationery-v2';
const materialIDByTitle=new Map(currentMaterialCatalog.assets.map(asset=>[asset.title,asset.id]));
export const isCurrentExampleProject=record=>CURRENT_EXAMPLE_PROJECT_IDS.has(record?.id);
export const isUntouchedLegacyExample=record=>
  record?.sourceIdentifier==='shiye-current-example-cece'
  &&CURRENT_EXAMPLE_PROJECT_IDS.has(record.id)
  &&record.updatedAt===record.coverBaselineUpdatedAt;

const layouts=[
  {id:'shiye-example-handmade',title:'蓝色方格与相框',style:'手作纸艺',pieces:[
    ['手作纸艺 · 蓝色方格便签',0.32,0.37,2],['手作纸艺 · 蓝色相框',0.67,0.46,3],
    ['手作纸艺 · 绿点纹胶带',0.52,0.69,4]]},
  {id:'shiye-example-journal',title:'纸上日常',style:'韩系清新',pieces:[
    ['韩系清新 · 棉纸横线书写页',0.5,0.52,1],['韩系清新 · 主题图',0.68,0.35,3],
    ['手作纸艺 · 撕边横线便签',0.30,0.65,4],['韩系清新 · 点纹纤维纸胶带',0.56,0.77,5]]},
  {id:'shiye-example-travel',title:'旅行纸片日记',style:'旅行票据',pieces:[
    ['旅行票据 · 纹样书写底纸',0.5,0.5,1],['旅行票据 · 主题图',0.63,0.38,3],
    ['旅行票据 · 可写票据',0.32,0.68,4],['旅行票据 · 纹样纸胶带',0.53,0.78,5]]}
];
function example(spec,assets){
  const result=project(spec.title,{style:'airy'}),d=result.drafts[0];
  d.paperColor='#f7f3e9';d.items=spec.pieces.flatMap(([name,rx,ry,z])=>{
    const id=materialIDByTitle.get(name),asset=assets.find(a=>a.id===id);if(!asset)return [];
    const item=itemFromAsset(asset,d,d.canvas.width*rx,d.canvas.height*ry,z);
    const scale=Math.min(1,d.canvas.width*.83/item.width,d.canvas.height*.78/item.height);
    item.width*=scale;item.height*=scale;item.generationBaseline={x:item.x,y:item.y,width:item.width,height:item.height,rotation:0,zIndex:z};
    return [item];
  });
  if(!d.items.length)return null;
  const heading=textBlock(spec.title,d);heading.y=d.canvas.height*.12;heading.fontSize=32;heading.height=70;heading.zIndex=20;d.textBlocks=[heading];
  result.id=spec.id;result.isDraft=false;result.sourceIdentifier=CURRENT_EXAMPLE_SOURCE;
  result.examplePresetID=spec.style;result.styleTags=[spec.style];
  result.candidateAssetIDs=d.items.map(item=>item.assetID);
  result.initialEditorSnapshot={drafts:[structuredClone(d)],activeDraftID:d.id};
  result.draftHistorySnapshots={[d.id]:structuredClone(d)};
  return result;
}
export async function syncCurrentExamples({database=defaultDB}={}){
  const [assets,saved,meta,trash]=await Promise.all(['assets','projects','meta','trash'].map(name=>database.all(name)));
  const existing=new Set(saved.map(p=>p.id));
  const initialized=meta.some(row=>row.id===MARKER)||layouts.some(layout=>existing.has(layout.id));
  if(initialized)return {changed:false,projects:0};
  const deleted=new Set([...meta.filter(row=>row.id?.startsWith('tombstone:projects:')).map(row=>row.targetID||row.id.slice('tombstone:projects:'.length)),...trash.filter(row=>row.kind==='project').map(row=>row.item?.id)]);
  const projects=layouts.filter(layout=>!existing.has(layout.id)&&!deleted.has(layout.id)).map(layout=>example(layout,assets)).filter(Boolean);
  if(!projects.length)return {changed:false,projects:0};
  await database.transaction(['projects','meta'],tx=>{
    for(const record of projects)tx.objectStore('projects').put(record);
    tx.objectStore('meta').put({id:MARKER,createdAt:new Date().toISOString()});
  });
  return {changed:projects.length>0,projects:projects.length};
}

