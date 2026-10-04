import * as db from './store.js';
const journalMotifSeriesID='B7000000-0000-4000-8000-000000009000';
const journalMotifs=[
  {id:'B7000000-0000-4000-8000-000000009001',title:'手作纸艺 · 撕边横线便签',kind:'paper',role:'annotation',width:68,height:85,texture:'撕边横线纸',path:'/starter-styles/original-torn-note.png',tags:['手写日记','日常记录','清单计划','暖纸','横线','可写']},
  {id:'B7000000-0000-4000-8000-000000009002',title:'手作纸艺 · 绿点纹胶带',kind:'tape',role:'connector',width:45,height:15,texture:'半透明和纸胶带',path:'/starter-styles/original-sage-washi.png',tags:['日系文具','韩系清新','复古旧物','绿色','点纹','连接']},
  {id:'B7000000-0000-4000-8000-000000009003',title:'手作纸艺 · 蓝色相框',kind:'paper',role:'support',width:72,height:92,texture:'蓝色纸质相框',path:'/starter-styles/original-blue-photo-frame.png',tags:['杂志编辑','影像故事','摄影叙事','相框','蓝色','开窗']},
  {id:'B7000000-0000-4000-8000-000000009004',title:'手作纸艺 · 蓝色方格便签',kind:'paper',role:'annotation',width:70,height:88,texture:'蓝色方格纸',path:'/starter-styles/original-blue-grid-note.png',tags:['清单计划','日常记录','日系文具','蓝色','方格','可写']}
];

export async function seedJournalMotifs(){
  const marker='journal-motifs-current';if(await db.get('meta',marker))return;
  const [existingAssets,existingSeries]=await Promise.all([db.all('assets'),db.all('series')]);
  const assetIDs=new Set(existingAssets.map(asset=>asset.id)),seriesIDs=new Set(existingSeries.map(item=>item.id));
  const now=new Date().toISOString();
  await db.transaction(['assets','series','meta'],tx=>{
    if(!seriesIDs.has(journalMotifSeriesID))tx.objectStore('series').put({id:journalMotifSeriesID,title:'手作纸艺',introduction:'根据手帐案例中的纸片与胶带方法创作的原创内置素材',createdAt:now,updatedAt:now});
    for(const item of journalMotifs){if(assetIDs.has(item.id))continue;const blobId=`${item.id}-image`;tx.objectStore('assets').put({id:item.id,title:item.title,kind:item.kind,role:item.role,tags:item.tags,palette:[],texture:item.texture,staticPath:item.path,blobId,originalBlobId:blobId,physicalWidthMM:item.width,physicalHeightMM:item.height,dimensionSource:'manual',supply:{kind:item.kind==='tape'?'quantity':'single',quantity:item.kind==='tape'?3:1},reviewStatus:'ready',usageStatus:'unused',seriesID:journalMotifSeriesID,createdAt:now,sourceIdentifier:'original-journal-motif'});}
    tx.objectStore('meta').put({id:marker,createdAt:now});
  });
}
