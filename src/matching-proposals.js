import {paperDimensions} from './paper-sizes.js';
// Local-only material proposal generator. No AI, no network, no fixed fill
// ratio. Recommendations are candidates; the user-starred materials alone
// are mandatory. The rest may be left out to preserve visual hierarchy.
const uniq=values=>[...new Set(values.filter(Boolean))];
const area=a=>Math.max(0,(Number(a.physicalWidthMM)||0)*(Number(a.physicalHeightMM)||0));
const colorWords=a=>uniq([...(a.semanticColorNames||[]),...(a.palette||[])]).map(s=>String(s).toLowerCase());
const tagWords=a=>uniq([...(a.tags||[]),...(a.semanticTags||[]),...(a.styleTags||[])]).map(s=>String(s).toLowerCase());
const kind=a=>a?.kind||'unknown';
const similarity=(a,b)=>{
 const one=new Set(a||[]),two=new Set(b||[]);
 const intersection=[...one].filter(x=>two.has(x)).length;
 return one.size||two.size?intersection/(one.size+two.size-intersection):1;
};
const kindRole=a=>({
 photo:'主图／叙事',sticker:'焦点／点缀',paper:'底纸／书写区',
 tape:'连接／固定',text:'主题文字',reference:'视觉参考'
})[kind(a)]||'组合元素';

export function matchingProposalContextKey({basket=[],coreIDs=[],excluded=[],styles=[],purposes=[],pageRatio='a4',pageMode='single'}={}){
 return JSON.stringify({basket:[...basket].sort(),coreIDs:[...coreIDs].sort(),
  excluded:[...excluded].sort(),styles,purposes,pageRatio,pageMode});
}

export function materialSetScore(records,{required=[],preferred=[],history=[],paperWidthMM=210,paperHeightMM=297}={}){
 if(!records.length)return -Infinity;
 const ids=records.map(a=>a.id),kinds=new Map(),colors=new Map(),tags=new Map();
 for(const a of records){
  kinds.set(kind(a),(kinds.get(kind(a))||0)+1);
  for(const color of colorWords(a))colors.set(color,(colors.get(color)||0)+1);
  for(const tag of tagWords(a))tags.set(tag,(tags.get(tag)||0)+1);
 }
 if(required.some(id=>!ids.includes(id)))return -Infinity;
 const pageArea=paperWidthMM*paperHeightMM;
 const large=records.filter(a=>area(a)>pageArea*.31);
 const support=records.filter(a=>kind(a)==='paper').length;
 const visual=records.filter(a=>['sticker','photo'].includes(kind(a))).length;
 const connectors=records.filter(a=>kind(a)==='tape').length;
 const coherence=[...colors.values()].filter(n=>n>=2).length*2+
   [...tags.values()].filter(n=>n>=2).length*.6;
 const redundancy=[...kinds.entries()].reduce((n,[type,count])=>{
   // Several writing papers are often redundant; several photos may tell a
   // story, so apply a gentler penalty to that kind.
   const free=type==='paper'?2:type==='photo'?3:2;
   return n+Math.max(0,count-free)**2*(type==='paper'?3.5:1.5);
 },0);
 const scalePenalty=Math.max(0,large.length-1)*2+
   Math.max(0,records.reduce((n,a)=>n+Math.min(area(a),pageArea),0)/pageArea-1.7)*1.1;
 const diversityPenalty=history.length?
   Math.max(...history.map(h=>similarity(ids,h.selectedAssetIDs||h)))*10:0;
 return coherence+new Set(records.map(a=>a.role).filter(Boolean)).size*1.4+
   (visual?3:0)+(support?1.8:0)+(connectors?1:0)+
   uniq(ids.filter(id=>preferred.includes(id))).length*.7+
   Math.min(4,records.length)*.65-
   redundancy-scalePenalty-diversityPenalty;
}
const theme=a=>{
 const name=String(a?.title||'日常片刻').trim();
 return name.length>24?name.slice(0,24):name;
};
const layouts=[
 {id:'story',title:'图文叙事',description:'视觉主角与一组可读记录相呼应，采用不等大的图文区。'},
 {id:'cutouts',title:'手工错层',description:'以纸片遮挡、局部探出和胶带连接建立真实剪贴感。'},
 {id:'quiet',title:'安静留白',description:'减少重复纸片，让一件主素材和少量文字建立清楚的焦点。'},
 {id:'editorial',title:'不对称编排',description:'大小错落的标题、素材和线条组成有方向的阅读路径。'},
 {id:'notes',title:'便签笔记',description:'书写卡与装饰贴纸主次明确，适当保留实际记录空间。'},
 {id:'experimental',title:'自由拼接',description:'沿轮廓或材质关系重新组织区域，尝试区别于常规网格的节奏。'}
];

// The same candidate set can yield different compositions without duplicating
// physical assets. All ranking and diversification is deterministic.
export function generateMaterialProposals({
 assets=[],basket=[],coreIDs=[],excluded=[],recommendations=[],styles=[],purposes=[],
 pageRatio='a4',pageMode='single',history=[],batch=0,count=4
}={}){
 const excludedSet=new Set(excluded);
 if(coreIDs.some(id=>excludedSet.has(id)))return [];
 const preferred=uniq(basket).filter(id=>!excludedSet.has(id));
 const mandatory=uniq(coreIDs).filter(id=>preferred.includes(id));
 const allowed=assets.filter(a=>a?.id&&!excludedSet.has(a.id)&&!a.isProjectInternal&&
    (a.supply?.quantity??1)>0&&a.reviewStatus!=='pendingReview');
 const map=new Map(allowed.map(a=>[a.id,a]));
 if(mandatory.some(id=>!map.has(id)))return [];
 const candidateIDs=uniq([...mandatory,...preferred,
  ...recommendations.map(r=>typeof r==='string'?r:r.asset?.id)]);
 const candidates=candidateIDs.map(id=>map.get(id)).filter(Boolean).slice(0,36);
 if(!candidates.length)return [];
 const dimensions=paperDimensions(pageRatio)||{width:210,height:297};
 const paperWidthMM=dimensions.width*(pageMode==='spread'?2:1),paperHeightMM=dimensions.height;
 const historyRecords=history.filter(h=>Array.isArray(h.selectedAssetIDs)).slice(-40);
 const ranked=[];
 const seeds=uniq([...mandatory,...candidates.filter(a=>['photo','sticker'].includes(kind(a))).map(a=>a.id),
  ...candidates.map(a=>a.id)]).map(id=>map.get(id)).filter(Boolean);
 const maxCandidates=Math.min(30,seeds.length);
 for(let i=0;i<maxCandidates;i++)for(let type=0;type<layouts.length;type++){
  const layout=layouts[(type+batch)%layouts.length];
  const anchor=seeds[(i+batch*3)%seeds.length];
  const chosen=mandatory.map(id=>map.get(id));
  if(!chosen.some(a=>a.id===anchor.id))chosen.push(anchor);
  // Target is a soft search heuristic, not a compulsory material count.
  const target=Math.max(chosen.length,Math.min(8,3+(type%4)+Math.min(2,basket.length>6?1:0)));
  while(chosen.length<target){
   let best=null,bestScore=-Infinity;
   for(const asset of candidates){
    if(chosen.some(a=>a.id===asset.id))continue;
    const candidate=[...chosen,asset],base=materialSetScore(candidate,{
      required:mandatory,preferred,history:historyRecords,paperWidthMM,paperHeightMM
    });
    const boost=preferred.includes(asset.id)?1.4:0;
    const roleBonus=!chosen.some(a=>kind(a)===kind(asset))?2.5:0;
    const seedBias=((candidateIDs.indexOf(asset.id)*17+type*11+batch*23)%13)*.035;
    const score=base+boost+roleBonus+seedBias;
    if(score>bestScore){best=asset;bestScore=score;}
   }
   if(!best)break;chosen.push(best);
  }
  const ids=chosen.map(a=>a.id);
  const score=materialSetScore(chosen,{required:mandatory,preferred,history:historyRecords,paperWidthMM,paperHeightMM});
  const proposal={
    id:'proposal-'+batch+'-'+layout.id+'-'+i,
    title:layout.title+' · '+theme(anchor),
    theme:theme(anchor),
    concept:'以「'+theme(anchor)+'」为视觉起点；'+layout.description,
    layout:layout.id,
    selectedAssetIDs:ids,
    requiredAssetIDs:mandatory,
    optionalAssetIDs:candidates.filter(a=>!ids.includes(a.id)).slice(0,8).map(a=>a.id),
    roles:Object.fromEntries(chosen.map(a=>[a.id,a.role||kindRole(a)])),
    rationale:'保留 '+chosen.length+' 件具有主题或功能联系的素材；其余候选不必用尽。',
    score,
    batch,
    contextKey:matchingProposalContextKey({basket,coreIDs,excluded,styles,purposes,pageRatio,pageMode})
  };
  ranked.push(proposal);
 }
 const result=[];
 for(const proposal of ranked.sort((a,b)=>b.score-a.score)){
  if(result.length>=Math.max(1,Math.min(count,6)))break;
  const older=[...historyRecords,...result];
  if(older.some(h=>similarity(proposal.selectedAssetIDs,h.selectedAssetIDs)>0.86&&proposal.layout===h.layout))continue;
  if(result.some(h=>h.layout===proposal.layout))continue;
  result.push(proposal);
 }
 return result;
}
