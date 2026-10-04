import * as defaultDB from './store.js';

export const CURRENT_MATERIAL_SOURCE='shiye-current-builtin';
export const CURRENT_MATERIAL_REVISION=2;
export const CURRENT_MATERIAL_SERIES_ID='B7000000-0000-4000-8000-000000009000';
const CREATED_AT='2026-10-04T00:00:00.000Z';
const fixed=n=>`B7000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const retiredSeriesIDs=new Set([...Array.from({length:10},(_,i)=>fixed((i+1)*100)),'cece-sample-series']);
const isRetiredSystemMeta=id=>id==='starter-styles-current'||id==='swift-bundled-materials-current'||String(id||'').startsWith('cece-samples-');
const retiredSource=value=>String(value||'').startsWith('built-in-starter')||String(value||'').startsWith('built-in-style-');
export const isRetiredSystemAsset=asset=>!!asset&&(String(asset.id||'').startsWith('cece-')||asset.seriesID==='cece-sample-series'||retiredSource(asset.sourceIdentifier));
export const isRetiredSystemProject=project=>!!project&&/^cece-p\d+-project$/.test(String(project.id||''));
export const isRetiredSystemSeries=series=>!!series&&retiredSeriesIDs.has(series.id);
export const isRetiredSystemTrash=entry=>entry?.kind==='asset'?isRetiredSystemAsset(entry.item):entry?.kind==='project'?isRetiredSystemProject(entry.item):false;

export const currentMaterialDefinitions=Object.freeze([
  {id:fixed(9001),title:'手作纸艺 · 撕边横线便签',kind:'paper',role:'annotation',width:68,height:85,texture:'撕边横线纸',path:'/starter-styles/original-torn-note.png',content:['便签','书写区'],styles:['手写日记','日系文具','复古旧物'],materials:['暖纸','横线','撕边']},
  {id:fixed(9002),title:'手作纸艺 · 绿点纹胶带',kind:'tape',role:'connector',width:45,height:15,texture:'半透明和纸胶带',path:'/starter-styles/original-sage-washi.png',content:['连接','压角'],styles:['日系文具','韩系清新','复古旧物'],materials:['绿色','点纹','和纸'],repeatPeriod:15},
  {id:fixed(9003),title:'手作纸艺 · 蓝色相框',kind:'paper',role:'support',width:72,height:92,texture:'蓝色纸质相框',path:'/starter-styles/original-blue-photo-frame.png',content:['相框','照片'],styles:['杂志编辑','影像故事','摄影叙事'],materials:['蓝色','开窗','卡纸']},
  {id:fixed(9004),title:'手作纸艺 · 蓝色方格便签',kind:'paper',role:'annotation',width:70,height:88,texture:'蓝色方格纸',path:'/starter-styles/original-blue-grid-note.png',content:['便签','清单'],styles:['清单手帐','日常记录','日系文具'],materials:['蓝色','方格','可写']},
  {id:fixed(9005),title:'手作纸艺 · 暖棕票据',kind:'paper',role:'support',width:76,height:38,texture:'牛皮票据纸',path:'/current-materials/kraft-ticket.svg',content:['票据','编号区'],styles:['复古旧物','旅行票据','美式拼贴'],materials:['牛皮纸','虚线','暖棕']},
  {id:fixed(9006),title:'手作纸艺 · 奶油收据',kind:'paper',role:'annotation',width:64,height:96,texture:'奶油收据纸',path:'/current-materials/cream-receipt.svg',content:['收据','记录'],styles:['旅行票据','清单手帐','杂志编辑'],materials:['奶油色','细线','纸张']},
  {id:fixed(9007),title:'手作纸艺 · 雾粉波浪标签',kind:'paper',role:'annotation',width:58,height:30,texture:'雾粉标签纸',path:'/current-materials/blush-label.svg',content:['标签','短标题'],styles:['韩系清新','可爱插画','手作便签'],materials:['雾粉','波浪边','标签']},
  {id:fixed(9008),title:'手作纸艺 · 芥末黄便签',kind:'paper',role:'annotation',width:64,height:64,texture:'哑光便签纸',path:'/current-materials/mustard-note.svg',content:['便签','正文'],styles:['手写日记','美式拼贴','清单手帐'],materials:['芥末黄','哑光纸','可写']},
  {id:fixed(9009),title:'手作纸艺 · 海军蓝索引签',kind:'sticker',role:'annotation',width:45,height:22,texture:'哑光索引贴',path:'/current-materials/navy-tab.svg',content:['索引','标题'],styles:['杂志编辑','极简留白','清单手帐'],materials:['海军蓝','标签','哑光']},
  {id:fixed(9010),title:'手作纸艺 · 砖红邮票',kind:'sticker',role:'support',width:30,height:36,texture:'邮票纸贴',path:'/current-materials/brick-stamp.svg',content:['邮票','印记'],styles:['复古旧物','旅行票据','美式拼贴'],materials:['砖红','齿边','纸贴']},
  {id:fixed(9011),title:'手作纸艺 · 鼠尾草叶片',kind:'sticker',role:'support',width:28,height:48,texture:'植物纸贴',path:'/current-materials/sage-leaf.svg',content:['叶片','植物'],styles:['自然植物','韩系清新','极简留白'],materials:['鼠尾草绿','植物','纸贴']},
  {id:fixed(9012),title:'手作纸艺 · 奶油雏菊',kind:'sticker',role:'support',width:30,height:30,texture:'花朵纸贴',path:'/current-materials/daisy.svg',content:['花朵','点缀'],styles:['自然植物','可爱插画','韩系清新'],materials:['奶油白','花朵','纸贴']},
  {id:fixed(9013),title:'手作纸艺 · 墨蓝细条胶带',kind:'tape',role:'connector',width:80,height:14,texture:'半透明和纸胶带',path:'/current-materials/navy-washi.svg',content:['连接','包边'],styles:['杂志编辑','胶片日记','极简留白'],materials:['墨蓝','细条','和纸'],repeatPeriod:20},
  {id:fixed(9014),title:'手作纸艺 · 格纹胶带',kind:'tape',role:'connector',width:80,height:16,texture:'半透明格纹和纸',path:'/current-materials/check-washi.svg',content:['连接','压角'],styles:['日系文具','清单手帐','手写日记'],materials:['格纹','浅蓝','和纸'],repeatPeriod:16},
  {id:fixed(9015),title:'手作纸艺 · 暖橙点纹胶带',kind:'tape',role:'connector',width:80,height:15,texture:'半透明点纹和纸',path:'/current-materials/orange-washi.svg',content:['连接','跨缝'],styles:['美式拼贴','复古旧物','手作便签'],materials:['暖橙','点纹','和纸'],repeatPeriod:20},
  {id:fixed(9016),title:'手作纸艺 · 米白撕边底纸',kind:'paper',role:'background',width:145,height:190,texture:'纤维撕边纸',path:'/current-materials/torn-paper.svg',content:['底纸','书写背景'],styles:['复古旧物','手写日记','自然植物'],materials:['米白','纤维纸','撕边']}
]);

const currentSeries=()=>({id:CURRENT_MATERIAL_SERIES_ID,title:'手作纸艺',introduction:'拾页现行版本自带的原创纸片、标签、贴纸与胶带，可直接用于搭配和创作。',styleTags:['手作','纸艺','拼贴'],semanticTags:['便签','标签','贴纸','胶带','票据'],builtinRevision:CURRENT_MATERIAL_REVISION,createdAt:CREATED_AT,updatedAt:CREATED_AT});
function currentAsset(item,existing){
  const tape=item.kind==='tape';
  const record={id:item.id,title:item.title,kind:item.kind,role:item.role,tags:[...new Set([...item.content,...item.styles,...item.materials])],contentTags:item.content,styleTags:item.styles,materialTags:item.materials,palette:[],texture:item.texture,staticPath:item.path,blobId:item.id+'-image',originalBlobId:item.id+'-image',physicalWidthMM:item.width,physicalHeightMM:item.height,dimensionSource:'builtin',supply:tape?{kind:'tapeRoll',quantity:1,availableLengthMM:800}:{kind:'single',quantity:1},reviewStatus:'ready',usageStatus:'unused',seriesID:CURRENT_MATERIAL_SERIES_ID,createdAt:CREATED_AT,updatedAt:CREATED_AT,sourceIdentifier:CURRENT_MATERIAL_SOURCE,builtinRevision:CURRENT_MATERIAL_REVISION};
  if(tape){record.tapeRepeatMode='repeatablePattern';record.tapeRepeatPeriodMM=item.repeatPeriod;}
  if(existing){for(const key of ['usageStatus','usageUpdatedAt','isFavorite'])if(existing[key]!==undefined)record[key]=existing[key];}
  return record;
}
export function isCurrentBuiltinAsset(asset){return asset?.sourceIdentifier===CURRENT_MATERIAL_SOURCE&&asset.builtinRevision===CURRENT_MATERIAL_REVISION;}

export async function syncCurrentMaterials({database=defaultDB}={}){
  const [assets,series,projects,meta,trash]=await Promise.all(['assets','series','projects','meta','trash'].map(database.all));
  const retiredAssets=assets.filter(isRetiredSystemAsset),retiredProjects=projects.filter(isRetiredSystemProject),retiredSeries=series.filter(isRetiredSystemSeries),retiredMetaRows=meta.filter(row=>isRetiredSystemMeta(row.id)),retiredTrash=trash.filter(isRetiredSystemTrash);
  const retiredBlobIDs=new Set(retiredAssets.flatMap(asset=>[asset.blobId,asset.originalBlobId,asset.originalCutoutBlobId,asset.photoBlobId]).filter(Boolean));
  const existing=new Map(assets.filter(asset=>!isRetiredSystemAsset(asset)).map(asset=>[asset.id,asset]));
  const desired=currentMaterialDefinitions.map(item=>currentAsset(item,existing.get(item.id)));
  const currentSeriesRecord=currentSeries(),seriesRecord=series.find(item=>item.id===CURRENT_MATERIAL_SERIES_ID);
  const needsSeries=!seriesRecord||seriesRecord.builtinRevision!==CURRENT_MATERIAL_REVISION;
  const needsAssets=desired.filter(record=>existing.get(record.id)?.builtinRevision!==CURRENT_MATERIAL_REVISION);
  const changed=retiredAssets.length||retiredProjects.length||retiredSeries.length||retiredMetaRows.length||retiredTrash.length||needsSeries||needsAssets.length;
  if(changed){
    const transaction=database.confirmedTransaction||database.transaction;
    await transaction(['assets','blobs','series','projects','meta','trash'],tx=>{
      for(const row of retiredAssets)tx.objectStore('assets').delete(row.id);
      for(const id of retiredBlobIDs)tx.objectStore('blobs').delete(id);
      for(const row of retiredProjects)tx.objectStore('projects').delete(row.id);
      for(const row of retiredSeries)tx.objectStore('series').delete(row.id);
      for(const row of retiredMetaRows)tx.objectStore('meta').delete(row.id);
      for(const row of retiredTrash)tx.objectStore('trash').delete(row.id);
      if(needsSeries)tx.objectStore('series').put(currentSeriesRecord);
      for(const row of needsAssets)tx.objectStore('assets').put(row);
      tx.objectStore('meta').put({id:'current-materials',version:CURRENT_MATERIAL_REVISION,updatedAt:CREATED_AT});
    });
  }
  return {retired:{assets:retiredAssets.length,projects:retiredProjects.length,series:retiredSeries.length,meta:retiredMetaRows.length,trash:retiredTrash.length,blobs:retiredBlobIDs.size},current:{assets:desired.length,series:1},changed:!!changed};
}
