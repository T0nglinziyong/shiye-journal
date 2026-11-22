// Make the first actionable visual problem prominent. This is advisory: the
// model still looks at the actual preview and may explain a deliberate gap.
export function creationCompositionPriority(visualBalance,advisory){
  const pages=visualBalance?.pages||[];
  const weakest=pages.find(page=>page.share<.35);
  if(weakest)return `${weakest.page} 可见内容明显轻于另一页。下一轮先移动一整件素材、文字簇或底纸来重分两页承重；不要用几颗小星星代替结构调整。`;
  const corner=pages.find(page=>page.quadrants?.[3]<.055&&page.quadrants?.[2]>.1&&page.quadrants[0]+page.quadrants[1]>.32);
  if(corner)return `${corner.page} 右下缺少可辨认的收束点。下一轮优先移动收尾文字、小素材或已有簇到右下，并重看阅读路线；孤立小装饰不足以解决空洞。`;
  const gap=(advisory?.clusterAlignment||[]).find(item=>item.verticalGapFraction>.1);
  if(gap)return `${gap.page} 正文与主素材相隔较远。下一轮优先移动正文或主素材，让二者形成清楚的一簇；在整体关系成立后才补点缀。`;
  const alignment=(advisory?.clusterAlignment||[]).find(item=>Math.abs(item.leftEdgeOffsetFraction)>.1);
  if(alignment)return `${alignment.page} 正文与主素材的左边线明显错开。下一轮先看预览：若没有共同中心或连接，移动整段或素材，不用微小点阵遮掩。`;
  if(advisory?.estimatedGraphicPaintFraction<.003&&advisory?.layers?.material>0)return '整体结构稳定后，检查点缀是否在手机整页预览中可见；若太弱，可在阅读转折处加入与素材同色的短线、星点或空心圈。';
  return null;
}
