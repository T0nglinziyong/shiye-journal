import {templateMarginalScores} from '../creative-agent/library/matcher.js';
import {isCurrentBuiltinMaterial} from './legacy-builtins.js';
import {classifyJournalMaterial,relevantJournalFamilies} from './journal-case-study.js';
const purposeKinds={
  日常记录:['paper','note','photo','sticker','tape','text'],
  旅途记录:['photo','ticket','card','paper','tape','sticker'],
  图文收藏:['photo','sticker','paper','card','frame'],
  清单计划:['note','paper','text','sticker','tape'],
  影像故事:['photo','card','paper','tape'],
  主题封面:['photo','sticker','paper','text','frame']
};
const styleTerms={
  随材而定:[],自动安排:[],清新淡雅:['清新','轻盈','淡雅'],童趣可爱:['童趣','可爱','卡通'],杂志排版:['标题','印刷','排版','杂志'],疏朗留白:['素','简'],均衡编排:[],丰富层叠:['拼贴','纸','胶带'],
  韩系清新:['浅','绿','粉','清新','柔和'],美式拼贴:['鲜明','拼贴','色块','贴纸'],
  复古旧物:['复古','旧','票','暖','牛皮'],极简留白:['素','简','单色','白'],
  杂志编辑:['照片','标题','排版','杂志'],日系文具:['文具','方格','便签','纸'],
  自然植物:['植物','叶','花','自然'],旅行票据:['旅行','旅途','票','地图'],
  童趣插画:['童趣','卡通','插画','可爱'],摄影叙事:['照片','摄影','胶片'],
  清单手帐:['清单','计划','待办','便签'],密集拼贴:['拼贴','胶带','贴纸','色块']
};
const purposeTerms={旅途记录:['旅','票','地图','路线'],清单计划:['清单','待办','计划','便签'],影像故事:['照片','摄影','胶片'],图文收藏:['收藏','照片','插画'],主题封面:['标题','主题','封面']};
const uniq=items=>[...new Set(items.filter(Boolean))];
// Existing automatically organized materials were left pending by older builds.
// Permit them in suggestions without silently changing the user's review flag.
const usableForMatching=a=>a?.reviewStatus==='ready'||a?.autoOrganized===true&&a?.reviewStatus==='pendingReview';
const descriptors=a=>uniq([a.title,a.kind,a.kindDetail,a.role,...(a.secondaryRoles||[]),
  ...(a.contentCategories||[]),...(a.layoutFits||[]),...(a.tags||[]),...(a.contentTags||[]),
  ...(a.themeTags||[]),...(a.styleTags||[]),...(a.colorTags||[]),
  ...(a.materialTags||[]),...(a.moodTags||[])]);

// Content similarity must not be inflated by generic kind/role/material labels.
const generic=new Set(['素材','纸','纸张','纸片','paper','photo','sticker','tape','stamp','focal','accent','connector','divider','information','annotation','background','和纸','贴纸纸','印刷纸','手帐预设','照片','贴纸','胶带','印章']);
const motifs=[['猫',/猫|cat/i],['植物',/植物|枝叶|叶片|花朵|花束|雏菊|红莓|botanical/i],['旅行',/旅行|旅途|出门|出发|远方|地图|邮戳|travel/i],['夜晚',/夜晚|月亮|晚安|night/i],['咖啡',/咖啡|coffee/i],['阅读',/阅读|读书|书本|library/i],['蝴蝶',/蝴蝶|butterfly/i]];
const motifTerms=text=>motifs.filter(([,re])=>re.test(text)).map(([key])=>key);
const segmenter=new Intl.Segmenter('zh',{granularity:'word'});
const contentTerms=a=>uniq([...motifTerms([a.title,...(a.tags||[]),...(a.contentTags||[])].join(' ')),a.title,...(a.tags||[]),...(a.contentTags||[]),...(a.themeTags||[])]
 .flatMap(t=>[String(t),...Array.from(segmenter.segment(String(t)),s=>s.segment)])
 .map(t=>t.toLowerCase().trim()).filter(t=>(t.length>=2||t==='猫')&&!generic.has(t)&&!/^\d+$/.test(t)));
const colorFamily=c=>{
 const text=String(c).toLowerCase(),hex=text.match(/^#?([a-f0-9]{6})$/);
 if(hex){const n=parseInt(hex[1],16),rgb=[n>>16&255,n>>8&255,n&255],max=Math.max(...rgb),min=Math.min(...rgb);
  if(max-min<24)return 'neutral';const h=max===rgb[0]?(rgb[1]-rgb[2])/(max-min):max===rgb[1]?2+(rgb[2]-rgb[0])/(max-min):4+(rgb[0]-rgb[1])/(max-min);
  const hue=(h*60+360)%360;return hue<15||hue>=345?'red':hue<45?'brown':hue<70?'yellow':hue<165?'green':hue<255?'blue':hue<285?'purple':hue<345?'pink':'red';}
 for(const [key,re] of [['green',/绿|green/],['blue',/蓝|blue|青|cyan/],['red',/红|red|coral/],['pink',/粉|pink|rose/],['purple',/紫|purple|lavender/],['brown',/棕|褐|牛皮|咖啡|焦糖|brown|ochre/],['yellow',/黄|金|yellow|gold/],['neutral',/灰|白|黑|奶油|米色|grey|gray|white|black|cream|beige/]])if(re.test(text))return key;
 return '';
};
const colorsOf=a=>new Set([...(a.colorTags||[]),...(a.semanticColorNames||[]),...(a.palette||[])].map(colorFamily).filter(Boolean));
const intersects=(a,b)=>a.some(value=>b.has(value));
const rolesOf=a=>uniq([a.role,...(a.secondaryRoles||[])]);
const layoutComplements=(a,b)=>{
  const left=new Set(a.layoutFits||[]),right=new Set(b.layoutFits||[]);
  return ((left.has('frame.photo')||left.has('frame'))&&b.kind==='photo'||
    (right.has('frame.photo')||right.has('frame'))&&a.kind==='photo'||
    (left.has('frame.text')||left.has('frame'))&&rolesOf(b).includes('marker')||
    (right.has('frame.text')||right.has('frame'))&&rolesOf(a).includes('marker')||
    (left.has('strip.edge')||left.has('strip'))&&(right.has('page.full')||right.has('page'))||
    (right.has('strip.edge')||right.has('strip'))&&(left.has('page.full')||left.has('page')));
};
export const recommendationDirections=Object.freeze(['全部','结构补足','配色协调','主题呼应','风格材质','尺寸节奏','不使用']);
export const recommendationWeights=Object.freeze({'结构补足':.30,'配色协调':.22,'主题呼应':.22,'风格材质':.16,'尺寸节奏':.10});
const legacyDirections={'配色关系':'配色协调','内容呼应':'主题呼应','材质':'风格材质','同系列':'主题呼应','尺寸层次':'尺寸节奏'};
export const normalizeRecommendationDirection=value=>legacyDirections[value]|| (recommendationDirections.includes(value)?value:'全部');
const colorRelation=(left,right)=>{
 if(!left.size||!right.size)return 0;
 const adjacent={red:['pink','brown'],pink:['red','purple'],purple:['pink','blue'],blue:['purple','green'],green:['blue','yellow'],yellow:['green','brown'],brown:['yellow','red']};
 const opposite={red:['green'],pink:['green'],purple:['yellow'],blue:['yellow','brown'],green:['red','pink'],yellow:['blue','purple'],brown:['blue']};
 let best=0;
 for(const a of left)for(const b of right){
  if(a===b)best=Math.max(best,a==='neutral'?4:9);
  else if(adjacent[a]?.includes(b))best=Math.max(best,7);
  else if(opposite[a]?.includes(b))best=Math.max(best,5);
  else if(a==='neutral'||b==='neutral')best=Math.max(best,3);
 }
 return best;
};
// Greedy marginal ranking keeps near-identical items from monopolising the
// first screen; selection remains deterministic for the same task.
export function diversifyRecommendations(rows,{limit=rows.length,perKind=Infinity}={}){
 const remaining=[...rows],chosen=[],kindCounts=new Map(),cache=new Map();
 const info=a=>{if(!cache.has(a.id))cache.set(a.id,{terms:contentTerms(a),colors:colorsOf(a)});return cache.get(a.id);};
 while(remaining.length&&chosen.length<limit){
  let best=-1,bestScore=-Infinity;
  for(let i=0;i<remaining.length;i++){
   const row=remaining[i],a=row.asset;if((kindCounts.get(a.kind)||0)>=perKind)continue;
   const {terms,colors}=info(a);
   const similarity=chosen.reduce((max,b)=>Math.max(max,
    (a.kind===b.asset.kind?2:0)+(intersects(rolesOf(a),new Set(rolesOf(b.asset)))?2:0)+
    (intersects(terms,new Set(info(b.asset).terms))?3:0)+
    (intersects([...colors],info(b.asset).colors)?1:0)),0);
   const score=row.score-similarity-(kindCounts.get(a.kind)||0)*1.5;
   if(score>bestScore){bestScore=score;best=i;}
  }
  if(best<0)break;
  const [row]=remaining.splice(best,1);chosen.push(row);kindCounts.set(row.asset.kind,(kindCounts.get(row.asset.kind)||0)+1);
 }
 return chosen;
}

export function scoreRecommendationCandidates({assets=[],basket=[],styles=[],purposes=[],excluded=[],intent='',pageSize=null}={}){
 const selected=assets.filter(a=>basket.includes(a.id)),excludedSet=new Set(excluded);
 const hasPersonal=assets.some(a=>usableForMatching(a)&&!a.isProjectInternal&&!isCurrentBuiltinMaterial(a)&&!a.isCreativePreset);
 const desiredRoles=new Set(relevantJournalFamilies({styles,purposes,materials:selected}).flatMap(family=>family.materials));
 const selectedRoles=new Set(selected.flatMap(classifyJournalMaterial));
 const selectedKinds=new Set(selected.map(a=>a.kind)),selectedRolesDirect=new Set(selected.flatMap(rolesOf));
 const purposeKindsSet=new Set(purposes.flatMap(p=>purposeKinds[p]||[]));
 const styleWords=uniq(styles.flatMap(s=>styleTerms[s]||[s])),purposeWords=uniq(purposes.flatMap(p=>purposeTerms[p]||[]));
 const basketTerms=new Set(selected.flatMap(contentTerms)),intentText=String(intent).toLowerCase(),intentMotifs=new Set(motifTerms(intentText));
 const candidates=assets.filter(a=>a?.id&&!basket.includes(a.id)&&!excludedSet.has(a.id)&&usableForMatching(a)&&!a.isProjectInternal&&a.usageStatus!=='used');
 const scored=candidates.map(a=>{
   const scores=Object.fromEntries(Object.keys(recommendationWeights).map(key=>[key,0]));
   const evidence=Object.fromEntries(Object.keys(recommendationWeights).map(key=>[key,[]]));
   const add=(key,points,reason)=>{if(points>0){scores[key]+=points;evidence[key].push(reason);}};
   const terms=contentTerms(a),words=descriptors(a).join(' ').toLowerCase();
   const roles=rolesOf(a),newRoles=roles.filter(role=>!selectedRolesDirect.has(role));
   if(purposeKindsSet.has(a.kind))add('结构补足',selectedKinds.has(a.kind)?2:4,'适合页面用途');
   if(selected.length&&newRoles.length)add('结构补足',selectedRolesDirect.size?5:3,'功能互补');
   if(selected.some(b=>layoutComplements(a,b)))add('结构补足',5,'版面可组合');
   const usefulRoles=classifyJournalMaterial(a).filter(role=>desiredRoles.has(role)&&!selectedRoles.has(role));
   if(usefulRoles.length)add('结构补足',Math.min(usefulRoles.length,2)*3,'补足图文结构');
   if(selected.some(b=>b.seriesID&&b.seriesID===a.seriesID))add('主题呼应',2,'同系列');
   const shared=terms.filter(t=>basketTerms.has(t));
   if(shared.length)add('主题呼应',Math.min(shared.length,2)*3,'呼应已选素材');
   if(selected.some(b=>(a.contentCategories||[]).some(id=>id!=='none'&&id!=='other'&&(b.contentCategories||[]).includes(id))))add('主题呼应',3,'内容类别呼应');
   const intentHits=terms.filter(t=>intentText.includes(t)||intentMotifs.has(t));
   if(intentHits.length)add('主题呼应',Math.min(intentHits.length,2)*5,'呼应补充想法');
   if(purposeWords.some(t=>words.includes(t.toLowerCase())))add('主题呼应',4,'呼应页面用途');
   const colors=colorsOf(a),colorScore=selected.reduce((best,b)=>Math.max(best,colorRelation(colors,colorsOf(b))),0);
   if(colorScore)add('配色协调',colorScore,colorScore>=9?'同色呼应':colorScore>=7?'邻近色协调':colorScore>=5?'对比色点缀':'中性色过渡');
   const colorHints=new Set([...styles,...styleWords,intent].map(colorFamily).filter(Boolean));
   if(!selected.length&&colorHints.size&&colors.size)add('配色协调',colorRelation(colors,colorHints),'呼应页面配色');
   const styleMatches=styleWords.filter(t=>words.includes(t.toLowerCase()));
   if(styleMatches.length)add('风格材质',Math.min(styleMatches.length,2)*4,'呼应所选风格');
   const sharedStyle=selected.some(b=>intersects(a.styleTags||[],new Set(b.styleTags||[]))||intersects(a.moodTags||[],new Set(b.moodTags||[])));
   if(sharedStyle)add('风格材质',5,'风格氛围一致');
   const ownMaterials=new Set(a.materialTags||[]),basketMaterials=new Set(selected.flatMap(b=>b.materialTags||[]));
   if(ownMaterials.size&&basketMaterials.size)add('风格材质',intersects([...ownMaterials],basketMaterials)?3:5,intersects([...ownMaterials],basketMaterials)?'材质呼应':'材质层次');
   const area=Number(a.physicalWidthMM)*Number(a.physicalHeightMM);
   if(area){const ratios=selected.map(b=>Number(b.physicalWidthMM)*Number(b.physicalHeightMM)).filter(Boolean).map(other=>Math.max(area,other)/Math.min(area,other));
    if(ratios.length){const ratio=Math.min(...ratios);if(ratio>=1.8&&ratio<=12)add('尺寸节奏',9,'形成大小层次');else if(ratio>12)add('尺寸节奏',4,'小件点缀');}
    if(selected.some(b=>{const bw=Number(b.physicalWidthMM),bh=Number(b.physicalHeightMM);return bw&&bh&&((a.physicalWidthMM>a.physicalHeightMM)!==(bw>bh));}))add('尺寸节奏',3,'横竖形态互补');}
   let penalty=0;const reasons=[];
   if(pageSize&&a.kind!=='tape'&&area){const w=a.physicalWidthMM,h=a.physicalHeightMM,pw=pageSize.width-8,ph=pageSize.height-8;
    if(!((w<=pw&&h<=ph)||(h<=pw&&w<=ph))){penalty-=6;reasons.push('整件偏大，需裁取');}}
   if(hasPersonal&&(isCurrentBuiltinMaterial(a)||a.isCreativePreset))penalty-=5;
   for(const key of Object.keys(scores))scores[key]=Math.min(10,scores[key]);
   const score=Object.entries(recommendationWeights).reduce((sum,[key,weight])=>sum+scores[key]*weight,0)*2+penalty;
   const topDirections=Object.keys(scores).sort((x,y)=>scores[y]*recommendationWeights[y]-scores[x]*recommendationWeights[x]);
   return {asset:a,score,templateFit:null,reasons:uniq([...topDirections.flatMap(key=>evidence[key]),...reasons]),directionScores:scores,directionReasons:evidence,penalty,penaltyReasons:reasons};
  });
 // Matching every library item against every template runs a full assignment
 // on the UI thread. The template bonus is small and only affects the visible
 // shortlist, so score it for the strongest 96 candidates when the library is
 // larger. All candidates retain their full semantic recommendation scores.
 if(pageSize){
  const shortlist=scored.length<=96?scored:[...scored].sort((a,b)=>b.score-a.score||a.asset.id.localeCompare(b.asset.id)).slice(0,96);
  const templateScores=templateMarginalScores({selected,candidates:shortlist.map(row=>row.asset),paper:pageSize,styles,content:[intent,...purposes]});
  for(const row of shortlist){
   const fit=templateScores.get(row.asset.id);row.templateFit=fit||null;
   if(!(fit?.utility>0))continue;
   const bonuses=[['结构补足',Math.min(4,fit.utility*.25)],['尺寸节奏',Math.min(3,fit.utility*.18)]];
   for(const [direction,bonus] of bonuses){
    row.directionScores[direction]=Math.min(10,row.directionScores[direction]+bonus);
    row.directionReasons[direction].push(direction==='结构补足'?'补足'+fit.title+'的版式位置':'真实尺寸更贴合版式');
   }
   row.score=Object.entries(recommendationWeights).reduce((sum,[direction,weight])=>sum+row.directionScores[direction]*weight,0)*2+row.penalty;
   row.reasons=uniq([...Object.keys(row.directionScores).sort((a,b)=>row.directionScores[b]*recommendationWeights[b]-row.directionScores[a]*recommendationWeights[a]).flatMap(direction=>row.directionReasons[direction]),...row.penaltyReasons]);
  }
 }
 return scored;
}
export function rankRecommendationCandidates(scored,direction='全部'){
 const mode=normalizeRecommendationDirection(direction);
 if(mode==='不使用')return [];
 const ranked=scored.filter(row=>mode==='全部'||row.directionScores[mode]>0)
  .map(row=>mode==='全部'?row:{...row,score:row.directionScores[mode]+row.penalty,
   reasons:uniq([...row.directionReasons[mode],...row.penaltyReasons])})
  .sort((a,b)=>b.score-a.score||String(a.asset.title||'').localeCompare(String(b.asset.title||''),'zh-CN'));
 const front=diversifyRecommendations(ranked.slice(0,96),{limit:18}),chosen=new Set(front.map(row=>row.asset.id));
 return [...front,...ranked.filter(row=>!chosen.has(row.asset.id))];
}
export function buildRecommendationRankings(options={}){
 const scored=scoreRecommendationCandidates(options);
 return Object.fromEntries(recommendationDirections.filter(direction=>direction!=='不使用')
  .map(direction=>[direction,rankRecommendationCandidates(scored,direction)]));
}
export function recommendForDirection(options={}){
 return rankRecommendationCandidates(scoreRecommendationCandidates(options),options.direction);
}
export function buildMaterialScope({basket=[],coreIDs=[],recommendations=[],excluded=[],autoIncludeRecommendations=false,requireAllCandidates=false,automaticPresets=[]}={}){
  const excludedSet=new Set(excluded),selected=uniq(basket).filter(id=>!excludedSet.has(id));
  const required=selected.filter(id=>coreIDs.includes(id)),preferred=selected.filter(id=>!coreIDs.includes(id));
  const available=autoIncludeRecommendations?uniq(recommendations.map(r=>typeof r==='string'?r:r.asset?.id)).filter(id=>!selected.includes(id)&&!excludedSet.has(id)):[];
  // Automatic supplies are always optional, even with ‘all candidates required’.
  const optionalPresets=uniq(automaticPresets.map(row=>typeof row==='string'?row:row.asset?.id)).filter(id=>!selected.includes(id)&&!available.includes(id)&&!excludedSet.has(id));
  const candidateAssetIDs=[...required,...preferred,...available,...optionalPresets];
  return requireAllCandidates
    ?{required:[...required,...preferred,...available],preferred:[],available:optionalPresets,excluded:uniq(excluded),candidateAssetIDs}
    :{required,preferred,available:[...available,...optionalPresets],excluded:uniq(excluded),candidateAssetIDs};
}
