// Layout observations distilled from user-supplied journal references and
// publicly documented journaling methods. No reference photograph or artwork
// is bundled here. This vocabulary is shared by web and API creation paths.
export const journalMaterialRoles = Object.freeze([
  {id:'base',name:'书写底纸',clues:['可写区域','底纹','孔位'],use:'承载成段文字，纹理不要抢走阅读焦点'},
  {id:'focal',name:'主视觉',clues:['照片','实物剪影','插画'],use:'根据画面内容确定视觉入口与尺度'},
  {id:'ephemera',name:'旅行与生活凭证',clues:['票根','收据','地图','包装'],use:'和地点、时间或经历关联；没有真实凭证就不伪造'},
  {id:'writing',name:'书写卡与标签',clues:['便签','卡片','标签'],use:'承载标题、图注或连贯短段，不留无意义空框'},
  {id:'connector',name:'连接材料',clues:['胶带','夹子','色带'],use:'连接相关图文组或提示阅读方向'},
  {id:'accent',name:'小装饰',clues:['贴纸','花枝','印章'],use:'在转折、角落或段首重复少量视觉母题'}
]);

export function classifyJournalMaterial(asset={}){
  const words=[asset.title,asset.role,asset.kind,asset.texture,...(asset.tags||[]),...(asset.contentTags||[]),...(asset.materialTags||[])].filter(Boolean).join(' ').toLowerCase();
  const roles=[];
  if(/底纸|背景|书写页|横线纸|background|base/.test(words))roles.push('base');
  if(/照片|摄影|主图|主视觉|插画|photo|focal/.test(words))roles.push('focal');
  if(/票|收据|地图|包装|ticket|receipt|map/.test(words))roles.push('ephemera');
  if(/便签|卡片|标签|可写|note|label|annotation/.test(words))roles.push('writing');
  if(/胶带|夹子|色带|tape|washi|connector/.test(words))roles.push('connector');
  if(/贴纸|花|叶|印章|sticker|motif/.test(words))roles.push('accent');
  if(!roles.length)roles.push(asset.kind==='paper'?'writing':asset.kind==='tape'?'connector':asset.kind==='photo'?'focal':'accent');
  return [...new Set(roles)];
}

export const journalCompositionFamilies = Object.freeze([
  {id:'written-diary',name:'图文日记',purposes:['日常记录','影像故事'],method:'让主图或实物细节和一段连贯的多行记录相邻；短图注解释可见内容，大小不同的记录区形成节奏。',materials:['base','focal','writing','accent']},
  {id:'route',name:'路线与时间轴',purposes:['旅途记录','影像故事'],method:'按确有依据的先后顺序串联照片、票据和短记；曲线、点号或日期是阅读线索，不是装饰性填空。',materials:['focal','ephemera','connector','writing']},
  {id:'food',name:'食物观察',purposes:['日常记录','图文收藏'],method:'以一件食物主图为入口，邻近的字块写味道、颜色或场景的可确认观察；小图和标记形成呼应，不复制同一份实物。',materials:['focal','writing','connector','accent']},
  {id:'paper-collage',name:'纸片错层',purposes:['日常记录','图文收藏'],method:'可写底纸、便签和连接材料错层叠放，保留真实边缘与空白书写面；标题和正文进入可写区域，避免把纸片排成互不相关的方阵。',materials:['base','writing','connector','accent']},
  {id:'editorial',name:'杂志式记录',purposes:['图文收藏','影像故事','主题封面'],method:'主图、导语、正文和短图注建立阅读层级；可用不等宽栏、局部出血和小字索引，但正文仍应完整可读。',materials:['focal','writing','accent']},
  {id:'list',name:'清单与问答',purposes:['清单计划','日常记录'],method:'让真实问题、条目或回答成为版面的主要内容，图片和符号辅助定位；不同长度的段落与可写卡片有机穿插。',materials:['base','writing','connector','accent']}
]);

const matchWords={
  '手写日记':['written-diary','list'],'旅行票据':['route','paper-collage'],
  '摄影叙事':['editorial','written-diary'],'胶片日记':['route','editorial'],
  '清单手帐':['list','written-diary'],'手作便签':['paper-collage','list'],
  '杂志编辑':['editorial','paper-collage'],'杂志网格':['editorial','written-diary'],
  '美式拼贴':['paper-collage','editorial'],'密集拼贴':['paper-collage','route'],
  '复古旧物':['paper-collage','route'],'混合媒材':['paper-collage','editorial']
};

export function relevantJournalFamilies({styles=[],purposes=[]}={}){
  const picks=new Set(styles.flatMap(style=>matchWords[style]||[]));
  const ranked=journalCompositionFamilies.map(family=>({family,score:family.purposes.filter(p=>purposes.includes(p)).length*3+(picks.has(family.id)?2:0)}));
  ranked.sort((a,b)=>b.score-a.score||journalCompositionFamilies.indexOf(a.family)-journalCompositionFamilies.indexOf(b.family));
  return ranked.slice(0,3).map(({family})=>family);
}

export function journalCaseStudyGuide({styles=[],purposes=[]}={}){
  const selected=relevantJournalFamilies({styles,purposes});
  return '真实手帐案例的构图观察（灵感，不是坐标模板或必须完成的配额）：\n'+
    selected.map(({name,method,materials})=>`- ${name}：${method}可留意 ${materials.map(id=>journalMaterialRoles.find(role=>role.id===id)?.name).join('、')} 的不同职责。`).join('\n')+
    '\n先看本次素材实际有哪些、边界和可写区域在哪里，再选一种或混合几种方法。缺少对应实物时用真实文字与可编辑数字图形组织内容，不生成不存在的票据、贴纸或照片。故意留白、局部叠压、半藏和出血可以成立；不要用数字配额评判。';
}
