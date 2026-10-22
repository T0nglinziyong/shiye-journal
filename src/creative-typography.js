// Product typography guidance, not screen-pixel limits or material resizing.
export const minimumPrintPoints=7;
export const creativeTypeRoles=Object.freeze([
  {label:'主标题',points:[18,26]},
  {label:'次标题／小节标题',points:[11,15]},
  {label:'正文',points:[9,12]},
  {label:'图片说明／日期／注释',points:[7,9]}
]);
export function creativeTypographyGuide(draft,{publicCommands=false}={}){
  if(publicCommands)return '当前统一 Command 的 style.fontSizePt 使用印刷 pt（不是画布像素）；size.width 使用 mm 或明确 reference+ratio。构图时先给主要随写预留可读的书写面：可先尝试约 11–15 pt，边注可较小，具体仍按纸张、字体和真实 preview 调整。已有强印刷标题无需再叠同义标题；文字若显得小，先改变框宽、书写面、句子长度和段落层级，必要时使用 text.fit，不要靠不断缩字塞进缝隙。短标题可以用 text.lettering 逐字变化，style.outline/gradient/shadow 区分描边、渐变和投影；fontPreset 与字体效果不是同一个概念。素材少时文字块和艺术标题可担当主视觉，而非全部缩成图注。修改字号/内容后重新预览，检查换行与 linked 关系。';
  const height=draft.physicalPageHeightMM,canvasHeight=draft.canvas?.height;
  if(!Number.isFinite(height)||height<=0||!Number.isFinite(canvasHeight)||canvasHeight<=0)return '文字应分主标题、次标题、正文和注释层级；标题大于正文，注释略小，不为塞进窄框而无限缩字。';
  const factor=25.4/72*canvasHeight/height;
  const sizes=creativeTypeRoles.map(({label,points:[low,high]})=>label+'建议'+low+'–'+high+'pt（本页font_size约'+Math.ceil(low*factor)+'–'+Math.floor(high*factor)+'画布单位）');
  return '文字排版建议（不是固定屏幕像素）：'+sizes.join('；')+'。font_size填画布单位，不要直接填上述印刷pt数值。常规小注可参考'+minimumPrintPoints+'pt（本页font_size约'+Math.ceil(minimumPrintPoints*factor)+'），刻意的微型字或艺术文字可以更小。保持明确层级，正文优先可读；这些范围不是所有风格的硬上限。放不下时可扩大文字框、调整文字或重排，不缩放真实素材。字号改变后重新计算换行、行高与间距。网页显示会随整页和视口等比缩放，同一作品不因换设备改写字号。';
}
