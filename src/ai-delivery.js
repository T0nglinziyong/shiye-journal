export const DELIVERY_OPTIONS=[
  ['tools','调用工具 · 可编辑'],
  ['json','直接返回 JSON 图层 · 可编辑'],
  ['image','画面图片 · 快照'],
  ['pdf','PDF 页面 · 快照'],
  ['zip','ZIP 工程包 · 可编辑']
];
export function deliveryProfile(mode){
  if(mode==='tools')return {generationMode:'agent',snapshot:false};
  if(mode==='image')return {generationMode:'direct',snapshot:'image/png'};
  if(mode==='pdf')return {generationMode:'direct',snapshot:'application/pdf'};
  return {generationMode:'direct',snapshot:false};
}
