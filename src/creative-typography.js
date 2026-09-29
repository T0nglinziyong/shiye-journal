// Product typography guidance, not screen-pixel limits or material resizing.
export const minimumPrintPoints=7;
export const creativeTypeRoles=Object.freeze([
  {label:'主标题',points:[18,26]},
  {label:'次标题／小节标题',points:[11,15]},
  {label:'正文',points:[9,12]},
  {label:'图片说明／日期／注释',points:[7,9]}
]);
export function creativeTypographyGuide(draft){
  const height=draft.physicalPageHeightMM,canvasHeight=draft.canvas?.height;
  if(!Number.isFinite(height)||height<=0||!Number.isFinite(canvasHeight)||canvasHeight<=0)return '文字应分主标题、次标题、正文和注释层级；标题大于正文，注释略小，不为塞进窄框而无限缩字。';
  const factor=25.4/72*canvasHeight/height;
  const sizes=creativeTypeRoles.map(({label,points:[low,high]})=>label+'建议'+low+'–'+high+'pt（本页font_size约'+Math.ceil(low*factor)+'–'+Math.floor(high*factor)+'画布单位）');
  return '文字排版建议（不是固定屏幕像素）：'+sizes.join('；')+'。font_size填画布单位，不要直接填上述印刷pt数值。至少'+minimumPrintPoints+'pt（本页font_size至少'+Math.ceil(minimumPrintPoints*factor)+'）。保持明确层级，正文优先可读；这些范围不是所有风格的硬上限，封面标题可更大，特殊小纸张以工具合同允许范围为准。放不下时扩大文字框、减少文字或重排，不能无限缩字号；字号改变后重新计算换行、行高与间距，不缩放真实素材。网页显示会随整页和视口等比缩放，同一作品不因换设备改写字号。';
}
