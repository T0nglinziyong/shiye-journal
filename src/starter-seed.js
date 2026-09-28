import * as db from './store.js';
const styles=[['korean','韩系清新','浅色便签、贴纸与轻盈的图文组'],['american','美式拼贴','照片主导、醒目标题和层叠纸片'],['vintage','复古旧物','旧纸、票据、印章与暖色层次'],['minimal','极简留白','单一焦点、对齐与充分留白'],['editorial','杂志编辑','照片网格、分栏和清晰字号层级'],['film','胶片日记','连续照片、胶片边框与日记节奏'],['travel','旅行票据','地图票据、照片与真实地点叙事'],['cute','可爱插画','插画角色、亮色和少量手绘点缀'],['mixed','混合媒材','纸纹、笔触、印章与错层拼贴'],['bullet','清单手帐','任务层级、书写空间与克制装饰']];
const pieces=[['paper','书写底纸','paper','background',160,210,'paper'],['photo','主题图','photo','focal',80,80,'print'],['tape','半透明纸胶带','tape','connector',65,16,'washi'],['label','书写标签','paper','annotation',70,37,'paper'],['frame','拍立得相框','paper','support',80,99,'print'],['motif','装饰花形','sticker','support',26,26,'die-cut'],['ticket','无字票据','paper','support',72,37,'paper'],['illustration','主题插画','sticker','focal',90,65,'illustration']];
const fixed=(style,part)=>`B7000000-0000-4000-8000-${String(style*100+part).padStart(12,'0')}`;
export async function seedStarterStyles(){if(await db.get('meta','starter-styles-v1'))return;const existing=new Set((await db.all('assets')).map(a=>a.id));const seriesExisting=new Set((await db.all('series')).map(s=>s.id));const assets=[],series=[];
for(const [si,[slug,name,introduction]] of styles.entries()){
 const sid=fixed(si+1,0);if(!seriesExisting.has(sid))series.push({id:sid,title:name,introduction,createdAt:new Date(1750000000000+si*1000).toISOString(),updatedAt:new Date(1750000000000+si*1000).toISOString()});
 for(const [pi,[suffix,pieceName,kind,role,width,height,texture]] of pieces.entries()){
  const id=fixed(si+1,pi+1);if(existing.has(id))continue;
  const blobId=id+'-image';assets.push({staticPath:`/starter-styles/${slug}-${suffix}.png`,id,title:`${name} · ${pieceName}`,kind,role,tags:[name,pieceName,'入门素材'],palette:[],texture,blobId,originalBlobId:blobId,physicalWidthMM:width,physicalHeightMM:suffix==='photo'?(si===0||si===2||si===4||si===8?80*400/319:si===1||si===3||si===5||si===6?80*576/514:80*337/377):height,dimensionSource:'manual',supply:{kind:kind==='tape'?'quantity':'single',quantity:kind==='tape'?3:1},reviewStatus:'ready',seriesID:sid,createdAt:new Date(1750000000000+si*100000+pi*1000).toISOString(),sourceIdentifier:'built-in-starter-style'});
 }
}
await db.transaction(['assets','series','meta'],tx=>{for(const a of assets)tx.objectStore('assets').put(a);for(const s of series)tx.objectStore('series').put(s);tx.objectStore('meta').put({id:'starter-styles-v1',createdAt:new Date().toISOString()});});}
