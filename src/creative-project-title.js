const GENERIC_TITLES=new Set(['新的手账','新的手帐','自动安排手帐','自动安排手账']);
const headingID=/(?:^|[-_])(title|heading|headline|标题|题目)(?:$|[-_\d])/i;

export function generatedProjectTitle(page){
  const texts=[];
  const visit=(layers=[])=>{
    for(const layer of layers){
      if(layer.type==='group')visit(layer.children);
      if(layer.type!=='text'||layer.hidden||layer.isHidden||layer.isParked||layer.workspaceId&&layer.workspaceId!=='page')continue;
      const content=String(layer.content||'').replace(/\s+/g,' ').trim();
      if(!content||content.length>30)continue;
      texts.push({content,id:String(layer.id||''),size:Number(layer.fontSize)||0});
    }
  };
  visit(page?.layers);
  if(!texts.length)return null;
  const named=texts.filter(item=>headingID.test(item.id));
  const candidates=named.length?named:texts;
  candidates.sort((a,b)=>b.size-a.size);
  const chosen=candidates[0];
  if(!named.length){
    const next=texts.map(item=>item.size).sort((a,b)=>b-a)[1]||0;
    if(chosen.size<30||chosen.size<next*1.35)return null;
  }
  return chosen.content;
}

export function shouldApplyGeneratedTitle(project){
  const title=String(project.title||'').trim();
  return GENERIC_TITLES.has(title)||Boolean(project.creativeTask?.originalTitle&&project.creativeTask.originalTitle===title);
}
