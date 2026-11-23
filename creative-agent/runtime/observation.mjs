const imageURL=url=>typeof url==='string'&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(url);

export function captureVisualState({preview,spaces,previous={},turn}){
  const views=preview.spaceViews||spaces.map(space=>space.id==='page'?{id:'page',imageURL:preview.imageURL,signature:preview.pngHash,items:[]}:{id:space.id,imageURL:null,signature:'empty',items:[]});
  const expected=new Set(spaces.map(space=>space.id));
  if(views.length!==expected.size||new Set(views.map(view=>view.id)).size!==expected.size||views.some(view=>!expected.has(view.id)))
    throw Error('预览空间与当前 Scene 不一致');
  const changed=[],observations={};
  for(const view of views){
    if(view.id==='page'&&view.signature!==preview.pngHash)throw Error('纸面预览图与图像指纹不一致');
    if(typeof view.signature!=='string'||!view.signature||view.imageURL&&!imageURL(view.imageURL)||(view.items?.length||view.parkedIDs?.length)&&!view.imageURL)throw Error('预览空间图像或版本无效：'+view.id);
    const old=previous[view.id],different=old?.signature!==view.signature;
    if(old&&!different&&old.empty!==!view.imageURL)throw Error('预览空间图像与版本状态冲突：'+view.id);
    if(different&&view.imageURL)changed.push(view);
    observations[view.id]={signature:view.signature,empty:!view.imageURL,items:view.items||[],parkedIDs:view.parkedIDs||[],lastChangedTurn:different?turn:old.lastChangedTurn,
      lastSeenTurn:different&&view.imageURL?turn:old?.lastSeenTurn??null};
    if(different&&!view.imageURL)changed.push({...view,imageURL:null});
  }
  return {changed,observations};
}

export function recordCreativeDecision(history,entry){
  const next=[...(history||[]),entry];
  return next.slice(-16);
}
