// Product typography guidance, not screen-pixel limits or material resizing.
export const minimumPrintPoints=7;
export const creativeTypeRoles=Object.freeze([
  {label:'主标题',points:[18,26]},
  {label:'次标题／小节标题',points:[11,15]},
  {label:'正文',points:[9,12]},
  {label:'图片说明／日期／注释',points:[7,9]}
]);
export function creativeTypographyGuide(draft,{publicCommands=false}={}){
  if(publicCommands)return '新增文字默认 fontPreset=hand；新版创作包内置 Ma Shan Zheng，其他具体字体先用 fonts 确认可用。style.fontSizePt 用印刷 pt，size.width 用 mm；主要随写可从约 11–15 pt 试起，依真实预览调整。已有强印刷标题不必再叠同义标题；文字放不下先调书写面、框宽与句子，不缩小真实素材或无限缩字。短标题可用 text.lettering、outline/gradient/shadow，但正文优先可读。改字后重新预览换行与位置。';
  const height=draft.physicalPageHeightMM,canvasHeight=draft.canvas?.height;
  if(!Number.isFinite(height)||height<=0||!Number.isFinite(canvasHeight)||canvasHeight<=0)return '文字应分主标题、次标题、正文和注释层级；标题大于正文，注释略小，不为塞进窄框而无限缩字。';
  const factor=25.4/72*canvasHeight/height;
  const sizes=creativeTypeRoles.map(({label,points:[low,high]})=>label+'建议'+low+'–'+high+'pt（本页font_size约'+Math.ceil(low*factor)+'–'+Math.floor(high*factor)+'画布单位）');
  return '新增文字默认艺术手写，使用 font_style=hand；根据内容选择不同字体，不必每段都同款，正文保持可读。文字排版建议（不是固定屏幕像素）：'+sizes.join('；')+'。font_size填画布单位，不要直接填上述印刷pt数值。常规小注可参考'+minimumPrintPoints+'pt（本页font_size约'+Math.ceil(minimumPrintPoints*factor)+'），刻意的微型字或艺术文字可以更小。保持明确层级，正文优先可读；这些范围不是所有风格的硬上限。放不下时可扩大文字框、调整文字或重排，不缩放真实素材。字号改变后重新计算换行、行高与间距。网页显示会随整页和视口等比缩放，同一作品不因换设备改写字号。';
}
