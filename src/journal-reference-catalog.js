// The uploaded tutorials are indexed by visual method, not copied into the
// distributable app. Images below are original, realistic journal studies.
// A case image is composition inspiration, never an available physical asset.
export const journalReferenceCases=Object.freeze([
  {id:'handwritten-observation',title:'图文日记与问答',image:'/journal-cases/handwritten-observation.png',sourceNumbers:[1,3,11,15,28,39,61,62,63,64,65,68],styles:['手写日记','日系文具','韩系清新','手作便签'],purposes:['日常记录','影像故事'],materialWords:['便签','书写','纸','照片'],method:'真实照片或贴纸旁保留连贯的多行记录；问答和短注回应同一件事，荧光笔只强调关键句。',copy:'写观察、疑问与回应；不写如何构图。'},
  {id:'warm-food',title:'暖色食物拼贴',image:'/journal-cases/warm-food.png',sourceNumbers:[2,5,24,26,31,35,51,55,59,66],styles:['密集拼贴','美式拼贴','复古旧物','混合媒材'],purposes:['日常记录','图文收藏'],materialWords:['食物','早餐','餐','茶','饮品'],method:'食物主图与局部细节错层，短记贴近相应图像；撕边纸和荧光笔串起阅读顺序。',copy:'写可确认的味道、颜色、质地或收藏理由；不编造用餐经历。'},
  {id:'photo-editorial',title:'照片与杂志分栏',image:'/journal-cases/photo-editorial.png',sourceNumbers:[4,9,13,14,16,17,23,27,32,36,40,49,52,53,54,57,70],styles:['杂志编辑','杂志网格','摄影叙事','美式拼贴'],purposes:['影像故事','图文收藏','主题封面'],materialWords:['照片','摄影','图','票'],method:'一张主图与不同大小的局部图建立层级；分栏文字、注释与细线服务阅读，避免等大方格。',copy:'写图像所见与前后关联；不把配色说明当正文。'},
  {id:'dark-route',title:'深色路线与手绘',image:'/journal-cases/dark-route.png',sourceNumbers:[6,7,8,19,20,21,29,33],styles:['密集拼贴','童趣插画','美式拼贴','自由构图'],purposes:['影像故事','旅途记录','日常记录'],materialWords:['照片','食物','票','旅行'],method:'几组图文沿手绘曲线或 S 形路径前进；深底亮色笔迹强调节点，不把路线变成装饰性占位。',copy:'按确有依据的先后或主题关联写节点，未知顺序不假定。'},
  {id:'gentle-planner',title:'浅色清单与书写卡',image:'/journal-cases/gentle-planner.png',sourceNumbers:[10,12,22,25,37,38,43,44,45,46,48],styles:['清单手帐','韩系清新','日系文具','可爱插画'],purposes:['清单计划','日常记录'],materialWords:['清单','便签','方格','卡片'],method:'可写纸片承载具体条目，边角贴纸和细线建立轻秩序；不同纸片错层但条目仍可逐项阅读。',copy:'写可执行计划、提醒或真实记录；不把空勾选框当内容。'},
  {id:'quiet-day',title:'照片与静物慢记录',image:'/journal-cases/quiet-day.png',sourceNumbers:[18,30,34],styles:['摄影叙事','胶片日记','极简留白','自然植物','留白叙事'],purposes:['日常记录','影像故事','图文收藏'],materialWords:['照片','植物','茶','花'],method:'主照片与一两张细节图形成安静的视觉入口；有内容的短段和小注与照片相邻。',copy:'写可见光影、物件与感受，但不冒充用户的亲身经历。'},
  {id:'travel-route',title:'实物路线与纸片',image:'/journal-cases/travel-route.png',sourceNumbers:[41,42,47,50,56,58,60,67,69],styles:['旅行票据','胶片日记','自由构图','混合媒材'],purposes:['旅途记录','影像故事','清单计划'],materialWords:['票','地图','路线','旅行'],method:'从教程中的 S 形动线、上下呼应和纸片遮挡抽象阅读路径；照片、票据和文字只按真实素材组织。',copy:'有事实才写地名、日期和行程；否则写可见景物或待补的计划。'}
]);

const scoreCase=(entry,{styles=[],purposes=[],materials=[]})=>{
  const styleScore=styles.reduce((score,value,index)=>score+(entry.styles.includes(value)?(index===0?5:3):0),0);
  const purposeScore=purposes.reduce((score,value,index)=>score+(entry.purposes.includes(value)?(index===0?6:3):0),0);
  const words=materials.map(item=>[item.title,...(item.tags||[])].join(' ')).join(' ');
  const materialScore=entry.materialWords.filter(word=>words.includes(word)).length;
  return styleScore+purposeScore+Math.min(materialScore,3);
};

export function selectJournalReferenceCases(input={},limit=2){
  const ranked=journalReferenceCases.map((entry,index)=>({entry,index,score:scoreCase(entry,input)}));
  ranked.sort((a,b)=>b.score-a.score||a.index-b.index);
  return ranked.slice(0,Math.max(0,Math.min(limit,3))).map(({entry})=>entry);
}

export function journalReferenceGuide(cases){
  return '匹配的真实风格手帐案例（原创重构图，不是可使用的素材）：\n'+cases.map((entry,index)=>`${index+1}. ${entry.title}：${entry.method}正文职责：${entry.copy}`).join('\n')+'\n只借鉴图文关系、纸片层次与阅读顺序；案例照片、贴纸和文字不属于本次素材篮，不得照搬或引入成品。最终正文按本次页面用途与用户事实写。';
}

const cache=new Map();
export async function loadJournalReferenceCases(cases,{request=fetch}={}){
  return Promise.all(cases.map(async entry=>{
    if(!cache.has(entry.id))cache.set(entry.id,(async()=>{
      const response=await request(entry.image,{cache:'force-cache'});
      if(!response.ok)throw Error(`手帐案例 ${entry.title} 暂时无法载入`);
      const blob=await response.blob(),bytes=new Uint8Array(await blob.arrayBuffer());
      if(bytes[0]!==137||bytes[1]!==80||bytes[2]!==78||bytes[3]!==71)throw Error(`手帐案例 ${entry.title} 不是 PNG`);
      const url=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});
      return {id:entry.id,title:entry.title,bytes,url};
    })().catch(error=>{cache.delete(entry.id);throw error;}));
    return cache.get(entry.id);
  }));
}
