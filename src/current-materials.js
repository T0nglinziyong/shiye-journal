import * as defaultDB from './store.js';
import {projectAssetIDs} from './library-model.js';

export const CURRENT_MATERIAL_SOURCE='shiye-current-builtin';
export const CURRENT_MATERIAL_REVISION=3;
const CREATED_AT=1750000000000;
const styleFamilies=[
 ['korean','韩系清新','浅色便签、贴纸与轻盈的图文组'],
 ['american','美式拼贴','照片主导、醒目标题和层叠纸片'],
 ['vintage','复古旧物','旧纸、票据、印章与暖色层次'],
 ['minimal','极简留白','单一焦点、对齐与充分留白'],
 ['editorial','杂志编辑','照片网格、分栏和清晰字号层级'],
 ['film','胶片日记','连续照片、胶片边框与日记节奏'],
 ['travel','旅行票据','地图票据、照片与真实地点叙事'],
 ['cute','可爱插画','插画角色、亮色和少量手绘点缀'],
 ['mixed','混合媒材','纸纹、笔触、印章与错层拼贴'],
 ['bullet','清单手帐','任务层级、书写空间与克制装饰']
];
const starterPieces=[
 ['paper','书写底纸','paper','background',160,210,'paper'],
 ['photo','主题图','photo','focal',80,80,'print'],
 ['tape','半透明纸胶带','tape','connector',65,16,'washi'],
 ['label','书写标签','paper','annotation',70,37,'paper'],
 ['frame','拍立得相框','paper','support',80,99,'print'],
 ['motif','装饰花形','sticker','support',26,26,'die-cut'],
 ['ticket','无字票据','paper','support',72,37,'paper'],
 ['illustration','主题插画','sticker','focal',90,65,'illustration']
];
const expansionStyles=[
 ['korean','韩系清新',[['cherry_blossom','樱花贴纸'],['hot_beverage','热饮贴纸']],['抹茶花枝',70,64]],
 ['american','美式拼贴',[['sunflower','向日葵贴纸'],['camera_with_flash','相机贴纸']],['相机花束',70,64]],
 ['vintage','复古旧物',[['old_key','旧钥匙贴纸'],['feather','羽毛贴纸']],['植物标本',50,75]],
 ['minimal','极简留白',[['leaf_fluttering_in_wind','叶片贴纸'],['potted_plant','盆栽贴纸']],['枝叶陶瓶',50,75]],
 ['editorial','杂志编辑',[['newspaper','报纸贴纸'],['pen','笔贴纸']],['鸢尾陶杯',50,75]],
 ['film','胶片日记',[['clapper_board','场记板贴纸'],['camera','相机小贴纸']],['胶片相机',70,64]],
 ['travel','旅行票据',[['compass','罗盘贴纸'],['ticket','票券贴纸']],['罗盘地图',70,58]],
 ['cute','可爱插画',[['cat_face','猫咪贴纸'],['strawberry','草莓贴纸']],null],
 ['mixed','混合媒材',[['artist_palette','调色盘贴纸'],['paintbrush','画笔贴纸']],null],
 ['bullet','清单手帐',[['calendar','日历贴纸'],['pushpin','图钉贴纸']],null]
];
const expansionBase=[
 ['backing','纹样书写底纸','paper','background',115,152,'paper',1],
 ['notecard','横向书写卡','paper','annotation',92,52,'paper',1],
 ['ticket','可写票据','paper','support',72,46,'paper',1],
 ['washi','纹样纸胶带','tape','connector',75,17,'washi',3],
 ['special','风格构件','paper','support',60,52,'paper',1]
];
const realism=[
 ['barley-tea','麦茶杯纸贴','sticker','support',26,26,'die-cut photographic print',1],
 ['cherry-sprig','樱花枝纸贴','sticker','support',26,26,'die-cut botanical print',1],
 ['pressed-clover','压花三叶草纸贴','sticker','support',26,26,'die-cut pressed botanical print',1],
 ['scallop-memo','波浪边手写卡','paper','annotation',60,52,'fibrous stationery paper',1],
 ['notecard','棉纸横向记事卡','paper','annotation',92,52,'uncoated cotton paper',1],
 ['backing','浅纹竖向书写底纸','paper','background',115,152,'fibrous writing paper',1],
 ['label','棉纸空白标签','paper','annotation',70,37,'uncoated paper label',1],
 ['ticket','撕线记事票','paper','support',72,37,'perforated paper ticket',1],
 ['washi','点纹纤维纸胶带','tape','connector',60,20,'translucent washi paper',3],
 ['paper','棉纸横线书写页','paper','background',160,210,'uncoated writing paper',1]
];
const fixed=(style,part)=>`B7000000-0000-4000-8000-${String(style*100+part).padStart(12,'0')}`;
const fixedID=n=>`B7000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const omitStarter=new Set([fixed(1,6),fixed(1,8)]);
const omitExpansion=new Set(Array.from({length:7},(_,i)=>fixedID(120+i)));
const motifSeriesID=fixedID(9000);
const motifs=[
 {id:fixedID(9001),title:'手作纸艺 · 撕边横线便签',kind:'paper',role:'annotation',width:68,height:85,texture:'撕边横线纸',file:'original-torn-note.png',tags:['手写日记','日常记录','清单计划','暖纸','横线','可写']},
 {id:fixedID(9002),title:'手作纸艺 · 绿点纹胶带',kind:'tape',role:'connector',width:45,height:15,texture:'半透明和纸胶带',file:'original-sage-washi.png',tags:['日系文具','韩系清新','复古旧物','绿色','点纹','连接']},
 {id:fixedID(9003),title:'手作纸艺 · 蓝色相框',kind:'paper',role:'support',width:72,height:92,texture:'蓝色纸质相框',file:'original-blue-photo-frame.png',tags:['杂志编辑','影像故事','摄影叙事','相框','蓝色','开窗']},
 {id:fixedID(9004),title:'手作纸艺 · 蓝色方格便签',kind:'paper',role:'annotation',width:70,height:88,texture:'蓝色方格纸',file:'original-blue-grid-note.png',tags:['清单计划','日常记录','日系文具','蓝色','方格','可写']}
];

const photoHeight=(slug,index)=>80*([0,2,4,8].includes(index)?400/319:[1,3,5,6].includes(index)?576/514:337/377);
const currentRecord=(record,used)=>({...record,usageStatus:used?'used':'unused',sourceIdentifier:CURRENT_MATERIAL_SOURCE,builtinRevision:CURRENT_MATERIAL_REVISION});
function catalog(){
 const assets=[],series=[];
 for(const [si,[slug,name,introduction]] of styleFamilies.entries()){
  const seriesID=fixed(si+1,0),createdAt=new Date(CREATED_AT+si*1000).toISOString();
  series.push({id:seriesID,title:name,introduction,createdAt,updatedAt:createdAt});
  for(const [pi,[suffix,pieceName,kind,role,width,height,texture]] of starterPieces.entries()){
   const id=fixed(si+1,pi+1);if(omitStarter.has(id))continue;
   const actualHeight=suffix==='photo'?photoHeight(slug,si):height,blobId=id+'-image';
   assets.push({id,title:`${name} · ${pieceName}`,kind,role,tags:[name,pieceName,'入门素材'],palette:[],texture,staticPath:`/builtin-materials/starter/${slug}-${suffix}.png`,blobId,originalBlobId:blobId,physicalWidthMM:width,physicalHeightMM:actualHeight,dimensionSource:'manual',supply:{kind:kind==='tape'?'quantity':'single',quantity:kind==='tape'?3:1},reviewStatus:'ready',seriesID,createdAt:new Date(CREATED_AT+si*100000+pi*1000).toISOString(),builtinFamily:'starter'});
  }
 }
 for(const [index,[slug,style,web,original]] of expansionStyles.entries()){
  const pieces=[...expansionBase.map(([suffix,...rest])=>[`${slug}-extra-${suffix}.png`,...rest]),...web.map(([suffix,name])=>[`${slug}-extra-web-${suffix}.png`,name,'sticker','support',26,26,'printed sticker',1])];
  if(original)pieces.push([`${slug}-extra-original.png`,original[0],'sticker','focal',original[1],original[2],'illustrated cutout',1]);
  if(slug==='film')pieces.push(['film-extra-rain-window.png','雨窗夜景','photo','focal',68,90,'film print',1],['film-extra-red-path.png','红光林间','photo','support',68,90,'film print',1]);
  for(const [offset,[filename,name,kind,role,width,height,texture,quantity]] of pieces.entries()){
   const id=fixedID((index+1)*100+20+offset);if(omitExpansion.has(id))continue;const blobId=id+'-image';
   assets.push({id,staticPath:`/builtin-materials/expansion/${filename}`,title:`${style} · ${name}`,kind,role,tags:[style,name,'扩展素材'],styleTags:[style],materialTags:[texture],contentTags:[name],palette:[],texture,blobId,originalBlobId:blobId,physicalWidthMM:width,physicalHeightMM:height,dimensionSource:'manual',supply:{kind:kind==='tape'?'quantity':'single',quantity},reviewStatus:'ready',seriesID:fixed(index+1,0),createdAt:new Date(CREATED_AT).toISOString(),builtinFamily:'expansion'});
  }
 }
 for(const [offset,[file,name,kind,role,width,height,texture,quantity]] of realism.entries()){
  const id=fixedID(180+offset),blobId=id+'-image';
  assets.push({id,staticPath:`/builtin-materials/expansion/korean-realism-${file}.png`,title:`韩系清新 · ${name}`,kind,role,tags:['韩系清新',name,'实体文具'],styleTags:['韩系清新'],materialTags:[texture],contentTags:[name],palette:[],texture,blobId,originalBlobId:blobId,physicalWidthMM:width,physicalHeightMM:height,dimensionSource:'manual',supply:{kind:kind==='tape'?'quantity':'single',quantity},reviewStatus:'ready',seriesID:fixed(1,0),createdAt:new Date(CREATED_AT).toISOString(),builtinFamily:'realism'});
 }
 series.push({id:motifSeriesID,title:'手作纸艺',introduction:'根据手帐案例中的纸片与胶带方法创作的原创内置素材',createdAt:new Date(CREATED_AT).toISOString(),updatedAt:new Date(CREATED_AT).toISOString()});
 for(const item of motifs){const blobId=item.id+'-image';assets.push({id:item.id,title:item.title,kind:item.kind,role:item.role,tags:item.tags,palette:[],texture:item.texture,staticPath:`/builtin-materials/starter/${item.file}`,blobId,originalBlobId:blobId,physicalWidthMM:item.width,physicalHeightMM:item.height,dimensionSource:'manual',supply:{kind:item.kind==='tape'?'quantity':'single',quantity:item.kind==='tape'?3:1},reviewStatus:'ready',seriesID:motifSeriesID,createdAt:new Date(CREATED_AT).toISOString(),builtinFamily:'journal-motif'});}
 return {assets,series};
}
export const currentMaterialCatalog=catalog();
export const CURRENT_MATERIAL_IDS=new Set(currentMaterialCatalog.assets.map(asset=>asset.id));
const TRANSIENT_REPLACEMENT_IDS=new Set(Array.from({length:12},(_,i)=>fixedID(9005+i)));

export async function syncCurrentMaterials({database=defaultDB}={}){
 const [assets,series,projects]=await Promise.all(['assets','series','projects'].map(name=>database.all(name)));
 const transient=assets.filter(asset=>TRANSIENT_REPLACEMENT_IDS.has(asset.id)&&asset.sourceIdentifier===CURRENT_MATERIAL_SOURCE);
 const existingAssets=new Map(assets.filter(asset=>!transient.includes(asset)).map(asset=>[asset.id,asset])),existingSeries=new Set(series.map(item=>item.id));
 const usedByWorks=new Set(projects.filter(project=>project.isUsed).flatMap(project=>[...projectAssetIDs(project)]));
 const writes=[];
 for(const asset of assets){
  if(CURRENT_MATERIAL_IDS.has(asset.id)||transient.includes(asset))continue;
  if(asset.usageStatus!=='used'&&asset.usageStatus!=='unused')writes.push({...asset,usageStatus:usedByWorks.has(asset.id)?'used':'unused',usageUpdatedAt:new Date().toISOString()});
 }
 for(const desired of currentMaterialCatalog.assets){
  const existing=existingAssets.get(desired.id);
  if(!existing){writes.push(currentRecord(desired,usedByWorks.has(desired.id)));continue;}
  const usageStatus=existing.usageStatus==='used'||existing.usageStatus==='unused'?existing.usageStatus:(usedByWorks.has(existing.id)?'used':'unused');
  if(existing.sourceIdentifier!==CURRENT_MATERIAL_SOURCE||existing.builtinRevision!==CURRENT_MATERIAL_REVISION||existing.staticPath!==desired.staticPath||existing.usageStatus!==usageStatus)
   writes.push({...existing,staticPath:desired.staticPath,usageStatus,sourceIdentifier:CURRENT_MATERIAL_SOURCE,builtinRevision:CURRENT_MATERIAL_REVISION});
 }
 const missingSeries=currentMaterialCatalog.series.filter(item=>!existingSeries.has(item.id));
 if(!writes.length&&!missingSeries.length&&!transient.length)return {changed:false,assets:currentMaterialCatalog.assets.length,series:currentMaterialCatalog.series.length};
 await database.transaction(['assets','series','meta'],tx=>{for(const asset of transient)tx.objectStore('assets').delete(asset.id);for(const asset of writes)tx.objectStore('assets').put(asset);for(const item of missingSeries)tx.objectStore('series').put(item);tx.objectStore('meta').put({id:'current-builtins',revision:CURRENT_MATERIAL_REVISION,updatedAt:new Date().toISOString()});});
 return {changed:true,assets:currentMaterialCatalog.assets.length,series:currentMaterialCatalog.series.length};
}
