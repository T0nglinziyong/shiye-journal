// Every completed manual geometry is authoritative. Never search an enlarged
// axis-aligned window or replace it with a different automatically found object.
export async function refineManualBoxes(boxes,_previous,segment){
  const next=[];
  for(let index=0;index<boxes.length;index++){
    const box=boxes[index];
    if(!(box.w>0&&box.h>0))throw Error('候选框尺寸无效');
    const region=await segment(box,index);
    if(!region?.mask)throw Error('第 '+(index+1)+' 个旋转框分割失败，未覆盖原素材');
    next.push({region,original:null});
  }
  return next;
}
