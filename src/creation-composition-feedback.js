// Make the first actionable visual problem prominent. This is advisory: the
// model still looks at the actual preview and may explain a deliberate gap.
export function creationCompositionPriority(visualBalance,advisory,styles=[]){
  const sparse=styles.includes('疏朗留白');
  const pages=visualBalance?.pages||[];
  const weakest=pages.find(page=>page.share<.25);
  if(weakest)return `${weakest.page} 的有色像素较少；先看真实预览是否已由承托纸和跨边连接形成有意的不对称。只有内容确实孤立时才重分两页承重，不要单凭面积数字移动素材。`;
  const corner=pages.find(page=>page.quadrants?.[3]<.055&&page.quadrants?.[2]>.1&&page.quadrants[0]+page.quadrants[1]>.32);
  if(corner&&!sparse)return `${corner.page} 右下有色内容较少。结合用户选择的画面疏密看真实预览：只有阅读确实中断或丰富层叠目标尚未实现时才调整内容簇；阅读不必在右下结束，不为填角添加装饰。`;
  const gap=(advisory?.clusterAlignment||[]).find(item=>item.verticalGapFraction>.1);
  if(gap)return `${gap.page} 正文与主素材相隔较远。看真实预览区分有意停顿与关联断裂；只有关联不清时才移动正文或主素材，也可用共同轴线或颜色建立关系，不要求全部叠成一簇。`;
  const alignment=(advisory?.clusterAlignment||[]).find(item=>Math.abs(item.leftEdgeOffsetFraction)>.1);
  if(alignment)return `${alignment.page} 正文与主素材的左边线不同；对角错位、阶梯与背景书写都可以成立，无需为了齐边或同中心而拉回横竖排列。只在真实读序或内容联系不清时调整位置。`;
  if(styles.includes('丰富层叠')&&advisory?.estimatedGraphicPaintFraction<.003&&advisory?.layers?.material>0)return '本次选择丰富层叠：检查材料自身纹样、叠压与文字是否已提供充分细节；只有画面仍单薄时，才在具体关系处补素材或可编辑图形，不按数字图形面积评分。';
  return null;
}

// Describe visible layer relationships, not a template or a placement rule.
// Rotated bounding boxes are deliberately only a cue; a cut-out can have
// transparent pixels inside its box, so the agent still checks the preview.
export function detectCompositionLinks(scene){
  const items=(scene?.layers||[]).map((layer,index)=>{
    const world=layer.world,w=world?.sizeMm?.[0],h=world?.sizeMm?.[1],center=world?.centerMm;
    if(layer.hidden||layer.surface!=='page'||!['material','shape'].includes(layer.type)||!center||!(w>0&&h>0))return null;
    const angle=(world.rotationDeg||0)*Math.PI/180,c=Math.abs(Math.cos(angle)),s=Math.abs(Math.sin(angle));
    const rx=(c*w+s*h)/2,ry=(s*w+c*h)/2;
    return {id:layer.id,alias:layer.alias||layer.id,type:layer.type,index,area:w*h,
      box:[center[0]-rx,center[1]-ry,center[0]+rx,center[1]+ry]};
  }).filter(Boolean);
  const overlap=(a,b)=>{
    const width=Math.max(0,Math.min(a.box[2],b.box[2])-Math.max(a.box[0],b.box[0]));
    const height=Math.max(0,Math.min(a.box[3],b.box[3])-Math.max(a.box[1],b.box[1]));
    return width*height/Math.min(a.area,b.area);
  };
  const links=[];
  for(const item of items){
    const targets=items.filter(other=>other.type==='material'&&other.id!==item.id&&overlap(item,other)>=.035);
    if(targets.length<2)continue;
    const behind=targets.filter(target=>target.index>item.index),front=targets.filter(target=>target.index<item.index);
    const role=behind.length>=2?'underlay':front.length>=2?'bridge':null;
    if(role)links.push({id:item.id,alias:item.alias,role,materials:(role==='underlay'?behind:front).map(target=>({id:target.id,alias:target.alias}))});
  }
  const motifs=[];
  for(const lower of links.filter(link=>link.role==='underlay'))for(const upper of links.filter(link=>link.role==='bridge')){
    const shared=lower.materials.filter(material=>upper.materials.some(item=>item.id===material.id));
    if(shared.length>=2)motifs.push({underlay:lower.id,bridge:upper.id,materials:shared.slice(0,3).map(item=>item.id)});
  }
  return {links:links.slice(0,8),motifs:motifs.slice(0,4)};
}

// Remember a useful relationship between renders, while allowing the agent to
// deliberately replace it with a different one. These are geometric hints,
// never a hard constraint on layer positions or material use.
export function trackCompositionAnchors(previous,current){
  const before=Array.isArray(previous)?previous:previous?[previous]:[];
  const underlays=(current?.links||[]).filter(link=>link.role==='underlay');
  const anchors=underlays.map(link=>{
    const motif=(current.motifs||[]).find(item=>item.underlay===link.id);
    return {underlay:link.id,materials:motif?.materials||link.materials.slice(0,4).map(item=>item.id),bridge:motif?.bridge||null};
  });
  const notes=[];
  for(const old of before){
    const match=anchors.find(anchor=>anchor.underlay===old.underlay&&anchor.materials.filter(id=>old.materials.includes(id)).length>=2);
    if(!match)notes.push('先前一张底纸共同承托两个素材的关系已消失。看真实画面：若非有意重构，可恢复承托与叠压；不要仅为平衡像素面积拆散素材簇。');
    else if(old.bridge&&!match.bridge)notes.push('原来跨在这组素材交界处的连接对象已移开。看真实画面确认：若连接因此变弱，可把它放回接缝附近或用新的对象连接；无需还原固定坐标。');
  }
  return {anchors:anchors.length?anchors:before,notes:[...new Set(notes)].slice(0,2)};
}

export function compositionRotationAdvice(scene){
  const materials=(scene?.layers||[]).filter(layer=>layer.surface==='page'&&!layer.hidden&&layer.type==='material'&&layer.world?.sizeMm);
  if(materials.length<3)return null;
  const tilted=materials.filter(layer=>{
    const angle=Math.abs(((layer.world.rotationDeg||0)%90+90)%90);
    return Math.min(angle,90-angle)>=2;
  });
  if(tilted.length<3||tilted.length/materials.length<.75)return null;
  return '多数素材都带轻微倾角。看真实预览确认这些倾角是否真的形成节奏；若只是习惯性错开，可让底纸或一两个主要素材放正、边缘对齐，只保留少数有意旋转的强调对象。';
}
