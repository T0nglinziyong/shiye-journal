import {isCurrentBuiltinMaterial} from './legacy-builtins.js';
import {classifyJournalMaterial,relevantJournalFamilies} from './journal-case-study.js';
const purposeKinds={
  日常记录:['paper','photo','sticker','tape','text'],旅途记录:['photo','paper','tape','sticker'],
  图文收藏:['photo','sticker','paper','reference'],清单计划:['paper','text','sticker','tape'],
  影像故事:['photo','paper','tape'],主题封面:['photo','sticker','paper','text']
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
const descriptors=a=>uniq([a.title,a.kind,a.role,a.texture,...(a.tags||[]),...(a.contentTags||[]),...(a.styleTags||[]),...(a.materialTags||[]),...(a.semanticTags||[]),...(a.placementHints||[]),...(a.semanticColorNames||[])]);

// Content similarity must not be inflated by generic kind/role/material labels.
const generic=new Set(['素材','纸','纸张','纸片','paper','photo','sticker','tape','stamp','focal','accent','connector','divider','information','annotation','background','和纸','贴纸纸','印刷纸','手帐预设','照片','贴纸','胶带','印章']);
const motifs=[['猫',/猫|cat/i],['植物',/植物|枝叶|叶片|花朵|花束|雏菊|红莓|botanical/i],['旅行',/旅行|旅途|出门|出发|远方|地图|邮戳|travel/i],['夜晚',/夜晚|月亮|晚安|night/i],['咖啡',/咖啡|coffee/i],['阅读',/阅读|读书|书本|library/i],['蝴蝶',/蝴蝶|butterfly/i]];
const motifTerms=text=>motifs.filter(([,re])=>re.test(text)).map(([key])=>key);
const segmenter=new Intl.Segmenter('zh',{granularity:'word'});
const contentTerms=a=>uniq([...motifTerms([a.title,...(a.tags||[]),...(a.contentTags||[])].join(' ')),a.title,...(a.tags||[]),...(a.contentTags||[]),...(a.semanticTags||[])]
 .flatMap(t=>[String(t),...Array.from(segmenter.segment(String(t)),s=>s.segment)])
 .map(t=>t.toLowerCase().trim()).filter(t=>(t.length>=2||t==='猫')&&!generic.has(t)&&!/^\d+$/.test(t)));
const colorFamily=c=>{const text=String(c).toLowerCase();for(const [key,re] of [['green',/绿|green/],['blue',/蓝|blue/],['red',/红|red|coral/],['pink',/粉|pink|rose/],['purple',/紫|purple|lavender/],['brown',/棕|褐|牛皮|咖啡|焦糖|brown|ochre/],['yellow',/黄|金|yellow|gold/],['neutral',/灰|白|黑|grey|gray|white|black/]])if(re.test(text))return key;return text;};
const colorsOf=a=>new Set([...(a.semanticColorNames||[]),...(a.palette||[])].map(colorFamily));
const intersects=(a,b)=>a.some(value=>b.has(value));
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
    (a.kind===b.asset.kind?2:0)+(a.role&&a.role===b.asset.role?2:0)+
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

export function recommendForDirection({assets=[],basket=[],styles=[],purposes=[],excluded=[],intent='',pageSize=null}={}){
  const selected=assets.filter(a=>basket.includes(a.id)),excludedSet=new Set(excluded),kinds=uniq(purposes.flatMap(p=>purposeKinds[p]||[]));
  const hasPersonal=assets.some(a=>usableForMatching(a)&&!a.isProjectInternal&&!isCurrentBuiltinMaterial(a)&&!a.isCreativePreset);
  const desiredRoles=new Set(relevantJournalFamilies({styles,purposes,materials:selected}).flatMap(family=>family.materials));
  const selectedRoles=new Set(selected.flatMap(classifyJournalMaterial));
  const styleWords=uniq(styles.flatMap(s=>styleTerms[s]||[s])),purposeWords=uniq(purposes.flatMap(p=>purposeTerms[p]||[]));
  const basketTags=new Set(selected.flatMap(contentTerms).map(t=>t.toLocaleLowerCase()));
  const basketKinds=new Set(selected.map(a=>a.kind));
  const ranked=assets.filter(a=>a?.id&&!basket.includes(a.id)&&!excludedSet.has(a.id)&&usableForMatching(a)&&!a.isProjectInternal&&a.usageStatus!=='used')
    .map(a=>{
      const terms=descriptors(a),words=terms.join(' ').toLocaleLowerCase();
      const reasons=[];let score=0;
      if(kinds.includes(a.kind)){score+=basketKinds.has(a.kind)?2:4;reasons.push('适合页面用途');}
      const purposeMatches=purposeWords.filter(t=>words.includes(t.toLowerCase()));if(purposeMatches.length){score+=Math.min(purposeMatches.length,2)*5;reasons.push('呼应页面用途');}
      const styleMatches=styleWords.filter(t=>words.includes(t.toLowerCase()));if(styleMatches.length){score+=Math.min(styleMatches.length,2)*2;reasons.push('呼应所选风格');}
      const shared=contentTerms(a).filter(t=>basketTags.has(t));if(shared.length){score+=Math.min(shared.length,3)*3;reasons.push('呼应已选素材');}
      const intentMotifs=new Set(motifTerms(String(intent)));const intentHits=contentTerms(a).filter(t=>String(intent).toLowerCase().includes(t)||intentMotifs.has(t));if(intentHits.length){score+=Math.min(intentHits.length,2)*5;reasons.push('呼应补充想法');}
      if(selected.some(b=>b.seriesID&&b.seriesID===a.seriesID)){score+=2;reasons.push('同系列');}
      if(selected.length&&!selected.some(b=>b.role===a.role)){score+=2;reasons.push('结构补足');}
      const colors=colorsOf(a);
      if(selected.some(b=>intersects([...colors],colorsOf(b)))){score+=3;reasons.push('配色关系');}
      const area=a.physicalWidthMM*a.physicalHeightMM;
      if(area&&selected.some(b=>{const other=b.physicalWidthMM*b.physicalHeightMM;return other&&Math.max(area,other)/Math.min(area,other)>=2;})){score+=2;reasons.push('尺寸层次');}
      if(selected.length&&a.role&&selected.some(b=>b.role!==a.role)&&!selected.some(b=>b.role===a.role)){score+=2;reasons.push('功能互补');}
      const usefulRoles=classifyJournalMaterial(a).filter(role=>desiredRoles.has(role)&&!selectedRoles.has(role));
      if(usefulRoles.length){score+=Math.min(2,usefulRoles.length)*3;reasons.push('补足图文结构');}
      if(a.physicalWidthMM&&a.physicalHeightMM)score++;
      if(pageSize&&a.kind!=='tape'){const w=a.physicalWidthMM,h=a.physicalHeightMM,pw=pageSize.width-8,ph=pageSize.height-8;if(!((w<=pw&&h<=ph)||(h<=pw&&w<=ph))){score-=6;reasons.push('整件偏大，需裁取');}}
      if(hasPersonal&&(isCurrentBuiltinMaterial(a)||a.isCreativePreset))score-=5;
      return {asset:a,score,reasons};
    }).sort((a,b)=>b.score-a.score||String(a.asset.title||'').localeCompare(String(b.asset.title||''),'zh-CN'));
  const front=diversifyRecommendations(ranked.slice(0,96),{limit:18}),chosen=new Set(front.map(row=>row.asset.id));
  return [...front,...ranked.filter(row=>!chosen.has(row.asset.id))];
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
