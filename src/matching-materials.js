const purposeKinds={
  日常记录:['paper','photo','sticker','tape','text'],旅途记录:['photo','paper','tape','sticker'],
  图文收藏:['photo','sticker','paper','reference'],清单计划:['paper','text','sticker','tape'],
  影像故事:['photo','paper','tape'],主题封面:['photo','sticker','paper','text']
};
const styleTerms={
  韩系清新:['浅','绿','粉','清新','柔和'],美式拼贴:['鲜明','拼贴','色块','贴纸'],
  复古旧物:['复古','旧','票','暖','牛皮'],极简留白:['素','简','单色','白'],
  杂志编辑:['照片','标题','排版','杂志'],日系文具:['文具','方格','便签','纸'],
  自然植物:['植物','叶','花','自然'],旅行票据:['旅行','旅途','票','地图'],
  童趣插画:['童趣','卡通','插画','可爱'],摄影叙事:['照片','摄影','胶片'],
  清单手帐:['清单','计划','待办','便签'],密集拼贴:['拼贴','胶带','贴纸','色块']
};
const purposeTerms={旅途记录:['旅','票','地图','路线'],清单计划:['清单','待办','计划','便签'],影像故事:['照片','摄影','胶片'],图文收藏:['收藏','照片','插画'],主题封面:['标题','主题','封面']};
const uniq=items=>[...new Set(items.filter(Boolean))];
const descriptors=a=>uniq([a.title,a.kind,a.role,a.texture,...(a.tags||[]),...(a.contentTags||[]),...(a.styleTags||[]),...(a.materialTags||[]),...(a.semanticTags||[]),...(a.placementHints||[]),...(a.semanticColorNames||[])]);
export function recommendForDirection({assets=[],basket=[],styles=[],purposes=[],excluded=[]}={}){
  const selected=assets.filter(a=>basket.includes(a.id)),excludedSet=new Set(excluded),kinds=uniq(purposes.flatMap(p=>purposeKinds[p]||[]));
  const styleWords=uniq(styles.flatMap(s=>styleTerms[s]||[s])),purposeWords=uniq(purposes.flatMap(p=>purposeTerms[p]||[]));
  const basketTags=new Set(selected.flatMap(descriptors).map(t=>t.toLocaleLowerCase()));
  const basketKinds=new Set(selected.map(a=>a.kind));
  return assets.filter(a=>a?.id&&!basket.includes(a.id)&&!excludedSet.has(a.id)&&a.reviewStatus==='ready'&&!a.isProjectInternal&&(a.supply?.quantity??1)>0)
    .map(a=>{
      const terms=descriptors(a),words=terms.join(' ').toLocaleLowerCase();
      const reasons=[];let score=0;
      if(kinds.includes(a.kind)){score+=basketKinds.has(a.kind)?2:4;reasons.push('适合页面用途');}
      const purposeMatches=purposeWords.filter(t=>words.includes(t.toLowerCase()));if(purposeMatches.length){score+=Math.min(purposeMatches.length,2)*5;reasons.push('呼应页面用途');}
      const styleMatches=styleWords.filter(t=>words.includes(t.toLowerCase()));if(styleMatches.length){score+=Math.min(styleMatches.length,2)*2;reasons.push('呼应所选风格');}
      const shared=terms.filter(t=>basketTags.has(t.toLocaleLowerCase()));if(shared.length){score+=Math.min(shared.length,3)*3;reasons.push('呼应已选素材');}
      if(selected.some(b=>b.seriesID&&b.seriesID===a.seriesID)){score+=2;reasons.push('同系列');}
      if(selected.length&&!selected.some(b=>b.role===a.role)){score+=2;reasons.push('结构补足');}
      const colors=new Set([...(a.palette||[]),...(a.semanticColorNames||[])].map(c=>String(c).toLocaleLowerCase()));
      if(selected.some(b=>[...(b.palette||[]),...(b.semanticColorNames||[])].some(c=>colors.has(String(c).toLocaleLowerCase())))){score+=3;reasons.push('配色关系');}
      const area=a.physicalWidthMM*a.physicalHeightMM;
      if(area&&selected.some(b=>{const other=b.physicalWidthMM*b.physicalHeightMM;return other&&Math.max(area,other)/Math.min(area,other)>=2;})){score+=2;reasons.push('尺寸层次');}
      if(selected.length&&a.role&&selected.some(b=>b.role!==a.role)&&!selected.some(b=>b.role===a.role)){score+=2;reasons.push('功能互补');}
      if(a.physicalWidthMM&&a.physicalHeightMM)score++;
      return {asset:a,score,reasons};
    }).sort((a,b)=>b.score-a.score||a.asset.title.localeCompare(b.asset.title,'zh-CN'));
}
export function buildMaterialScope({basket=[],coreIDs=[],recommendations=[],excluded=[],autoIncludeRecommendations=false,requireAllCandidates=false}={}){
  const excludedSet=new Set(excluded),selected=uniq(basket).filter(id=>!excludedSet.has(id));
  const required=selected.filter(id=>coreIDs.includes(id)),preferred=selected.filter(id=>!coreIDs.includes(id));
  const available=autoIncludeRecommendations?uniq(recommendations.map(r=>typeof r==='string'?r:r.asset?.id)).filter(id=>!selected.includes(id)&&!excludedSet.has(id)):[];
  const candidateAssetIDs=[...required,...preferred,...available];
  return requireAllCandidates
    ?{required:candidateAssetIDs,preferred:[],available:[],excluded:uniq(excluded),candidateAssetIDs}
    :{required,preferred,available,excluded:uniq(excluded),candidateAssetIDs};
}
