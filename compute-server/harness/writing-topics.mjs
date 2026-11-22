import topicData from '../../src/data/journal-writing-topics.json' with {type:'json'};

const anchors=[
  [/照片|相片|相册|胶片|相机|影像|拍立得/,/照片|相册|影像|拍摄|回忆/],
  [/花|植物|叶|树|草|森林/,/花开|花朵|花瓣|第一朵花|植物|树|自然|春天|生长|发芽/],
  [/茶|咖啡|饮料|杯|热饮|奶茶|汽水/,/茶|饮|杯|味道|温度|暖|咖啡/],
  [/食物|早餐|午餐|晚餐|甜点|蛋糕|面包|水果/,/吃|食物|味道|食谱|早餐|水果/],
  [/地图|旅行|车票|机票|邮票|行李|城市/,/旅行|流浪|出发|地图|城市|行李|远方|车票/],
  [/海边|海洋|浪花|沙滩|日落|晚霞/,/海边|海水|浪花|沙滩|日落|晚霞|天空/],
  [/书|信|纸|文字|笔|报纸|书签/,/书|信|写|文字|读|纸|记录/],
  [/月|星|夜|宇宙|天空|云|太阳|日落/,/夜|梦|宇宙|天空|阳光|日落|星|白天/],
  [/猫|狗|宠物|鸟|动物/,/宠物|猫|狗|动物|陪伴/],
  [/音乐|唱片|耳机|歌|音符/,/歌|音乐|声音|听/],
  [/衣|布|裙|穿搭|时尚/,/穿搭|衣服|触觉|颜色/],
];
const forms=[['清单',/清单|写下三个|写下 3|盘点|Top|推荐/],['书信',/写给|给.+写|寄一张|致谢/],['想象',/如果|假如|想象|白日梦|超能力|穿越/],['感官记录',/味道|气味|声音|触觉|颜色|温度|阳光|天空/],['回望',/回忆|小时候|去年|复盘|过去|曾经|舍不得/],['片段叙事',/记录一次|记录今天|今天有没有|瞬间|时刻/]];
const monthOf=prompt=>Number.isInteger(prompt?.month)&&prompt.month>=1&&prompt.month<=12?prompt.month:null;
const stableHash=value=>{let h=2166136261;for(const ch of String(value)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;};
const formOf=prompt=>forms.find(([,pattern])=>pattern.test(prompt))?.[0]||'随想';
const searchable=topic=>topic.prompt.replace(/[“”‘’（）()？。，、：…]/g,' ');
const compactText=value=>String(value||'').toLowerCase().replace(/\s+/g,'');
const tokens=value=>{
  const words=[...compactText(value).matchAll(/[\p{Script=Han}]+|[a-z]{3,}/gu)].map(match=>match[0]);
  return [...new Set(words.flatMap(word=>/^[a-z]/.test(word)?[word]:[2,3,4].flatMap(size=>Array.from({length:Math.max(0,word.length-size+1)},(_,i)=>word.slice(i,i+size)))))].slice(0,60);
};

export const journalWritingTopics=topicData.topics;

export function searchWritingTopics({materials=[],query='',month=null,seed=0,limit=5,exclude=[],allowFiction=true}={}){
  const materialText=compactText(materials.map(material=>[material.title,material.kind,material.role,material.description,...(material.tags||[])].filter(Boolean).join(' ')).join(' '));
  const request=compactText(query),searched=materialText+' '+request,avoid=new Set(exclude.map(Number));
  const active=anchors.filter(([pattern])=>pattern.test(searched)).map(([,pattern])=>pattern);
  const fragments=tokens(request).filter(token=>token.length>=2),materialFragments=tokens(materialText).filter(token=>token.length>=2);
  const rows=journalWritingTopics.filter(topic=>!avoid.has(topic.id)&&(allowFiction||formOf(topic.prompt)!=='想象')).map(topic=>{
    const text=searchable(topic),lower=text.toLowerCase();
    const matched=active.filter(pattern=>pattern.test(text)).length;
    const exact=fragments.filter(token=>lower.includes(token)).length;
    const materialMatches=materialFragments.filter(token=>lower.includes(token)).length;
    const seasonal=monthOf({month})===topic.month?0.5:0;
    const score=matched*5+exact*3+materialMatches*2+seasonal;
    const jitter=(stableHash(seed+':'+topic.id)%1000)/1000;
    return {id:topic.id,prompt:topic.prompt,month:topic.month,form:formOf(topic.prompt),score,rank:score+jitter*.65};
  }).sort((a,b)=>b.rank-a.rank);
  const selected=[],usedForms=new Set();
  for(const row of rows){
    if(selected.length>=limit)break;
    if(usedForms.has(row.form)&&rows.some(other=>other.score>=row.score-2&&!usedForms.has(other.form)&&!selected.includes(other)))continue;
    selected.push(row);usedForms.add(row.form);
  }
  for(const row of rows)if(selected.length<limit&&!selected.includes(row))selected.push(row);
  return selected.map(({rank,...row})=>row);
}

export function writingLengthPlan({page,materials=[],textMode='automatic',purposes=[]}={}){
  if(textMode==='none'||purposes.includes('主题封面'))return {level:'标题为主',characters:[0,40],reason:'本页用途不要求长正文'};
  const area=(page?.canvas?.width||700)*(page?.physicalPageHeightMM||210)**2/(page?.canvas?.height||1000);
  const occupied=materials.reduce((sum,material)=>sum+Math.max(0,Number(material.widthMM||material.physicalWidthMM)||0)*Math.max(0,Number(material.heightMM||material.physicalHeightMM)||0),0);
  const density=occupied/Math.max(area,1);
  if(textMode==='rich')return {level:'展开',characters:density>.75?[80,160]:[130,260],reason:'按真实可写面积修订，必要时让素材为正文留位置'};
  if(textMode==='minimal')return {level:'简短',characters:[25,65],reason:'保留具体细节，不以口号凑字'};
  if(density>.8)return {level:'精简',characters:[25,75],reason:'素材占比高，允许改成分散边注或清单'};
  if(density>.4)return {level:'适中',characters:[65,130],reason:'先安排主体和可写区，再按预览调节'};
  return {level:'展开',characters:[110,220],reason:'有较多可写空间，写出有推进的完整内容'};
}

export function writingTopicBrief(document,brief={},seed=0){
  const source=document.source||{},enabled=source.contentPolicy!=='visual'&&source.textMode!=='none'&&!(source.textMode==='requested'&&!source.userText&&!/写|文字|正文|标题|清单|记录/.test(source.intent||''));
  if(!enabled)return null;
  const materials=(source.materials||[]).map(item=>{
    const snapshot=source.sourceSnapshots?.find(row=>row.assetID===item.assetID)||{};
    return {title:snapshot.title,kind:snapshot.kind,role:snapshot.role,tags:[...(snapshot.tags||[]),...(snapshot.contentTags||[]),...(snapshot.themeTags||[]),...(snapshot.moodTags||[])],description:snapshot.description};
  });
  const userTheme=String(source.intent||brief.intent||'').trim();
  const fiction=source.contentPolicy!=='documentary';
  const topics=searchWritingTopics({materials,query:userTheme,month:new Date(seed).getUTCMonth()+1,seed,limit:3,allowFiction:fiction});
  return {userTheme:userTheme||null,selected:topics[0],alternatives:topics.slice(1),length:writingLengthPlan({page:document.page,materials:(source.sourceSnapshots||[]).map(snapshot=>({widthMM:snapshot.descriptor?.widthMM,heightMM:snapshot.descriptor?.heightMM})),textMode:source.textMode,purposes:source.purposes||[]}),styles:['细节片段：从具体动作或物件开头，写一个转折','观察清单：两三项有差异的发现，结尾留一个问题','写给某物或某时刻：亲近、自然，不做空泛鼓励',...(fiction?['想象练习：可以虚构场景，写出感官和小意外']:[])],source:'用户提供的 365 主题 PDF；仅供启发，不照抄题目作正文'};
}
