// Advisory physical regions shared by task brief and actual-Scene diagnostics.
// These do not clip, scale or silently move any layer.
export function creationPageRegions(page){
 const scale=page.canvas.height/page.physicalPageHeightMM;
 const height=page.physicalPageHeightMM,width=page.canvas.width/scale;
 const spread=page.pageMode==='spread',leaf=spread?width/2:width;
 const edge=Math.min(4,leaf*.06),inner=spread?Math.min(5,leaf*.07):edge;
 const round=n=>Math.round(n*100)/100;
 const region=(name,left,right)=>({reference:name,x:round(left),y:round(edge),width:round(right-left),height:round(height-edge*2)});
 return {unit:'mm',coordinateOrigin:'page top-left',advisory:true,
  ...(spread?{gutter:{x:round(leaf-inner),width:round(inner*2),center:round(leaf),insetPerPage:round(inner)}}:{}),
  safeRegions:spread?[region('page.left',edge,leaf-inner),region('page.right',leaf+inner,width-edge)]:[region('page',edge,width-edge)],
  guidance:spread?'先在左右单页内组织图文组，主体素材、标题和正文避开中缝两侧的安全带。用颜色、方向或图案隔缝呼应；默认不靠跨缝粘贴连接。过大实物应裁取、调整朝向或换纸，不能缩放实体。只有明确有意跨页时才例外，并检查重要内容未落缝。':'按实体毫米尺寸编排，正文与重要主体留出页边。'};
}
