const genericFileName=/^(?:img|image|dsc|pxl|photo|scan|screenshot|screen.?shot|wechat|mmexport|wx_camera|屏幕截图|截屏|微信图片|照片)[\s._-]*[\d\s._-]*$|^\d{5,}$|^[a-f\d]{8}-[a-f\d-]{20,}$/i;

export function importFileStem(fileName){
  const stem=String(fileName||'').replace(/\.[^.]+$/,'').replace(/[_]+/g,' ').replace(/\s+/g,' ').trim();
  return stem&&!genericFileName.test(stem)?stem.slice(0,60):'';
}

export function importDefaultTitle(fileName,kind,{sourceIndex=0,candidateIndex=0,date=new Date()}={}){
  const stem=importFileStem(fileName);
  const day=Number.isFinite(date.getTime())?date.toISOString().slice(0,10):'';
  if(kind==='material')return stem?`${stem} · ${candidateIndex+1}`:`素材 · ${day} · ${sourceIndex+1}-${candidateIndex+1}`;
  if(kind==='snapshot')return stem||`导入快照 · ${day} · ${sourceIndex+1}`;
  return stem||`导入作品 · ${day} · ${sourceIndex+1}`;
}

export function isGeneratedImportAssetTitle(title){
  return /^素材 \d+$/.test(title||'')||/^素材 · \d{4}-\d{2}-\d{2} · \d+-\d+$/.test(title||'');
}
