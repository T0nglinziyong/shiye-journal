// JPEG pages embedded in a PDF with an explicit millimetre MediaBox. The
// document contains no browser chrome and never relies on print-dialog scaling.
export async function pagePDF(pages) {
  if(!Array.isArray(pages)||!pages.length)throw Error('没有可导出的页面');
  const {PDFDocument}=await import('pdf-lib'),pdf=await PDFDocument.create();
  for(const {jpeg,width,height} of pages){
    if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw Error('PDF 纸张尺寸无效');
    const w=width*72/25.4,h=height*72/25.4,image=await pdf.embedJpg(Uint8Array.from(jpeg)),page=pdf.addPage([w,h]);page.drawImage(image,{x:0,y:0,width:w,height:h});
  }
  return new Blob([await pdf.save()],{type:'application/pdf'});
}
export async function canvasPDFPage(canvas,width,height) {
  // Flatten alpha to white before JPEG encoding.
  const flat=document.createElement('canvas');flat.width=canvas.width;flat.height=canvas.height;
  const ctx=flat.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,flat.width,flat.height);ctx.drawImage(canvas,0,0);
  const jpeg=new Uint8Array(await (await new Promise(resolve=>flat.toBlob(resolve,'image/jpeg',.96))).arrayBuffer());
  return {jpeg,width,height,pixelWidth:flat.width,pixelHeight:flat.height};
}
export function materialPrintPlacements(assets) {
  if(!assets.length)throw Error('请先选择要打印的素材');
  const placements=[];let x=8,y=18,rowHeight=0,page=0;
  for(const a of assets) {
    const w=a.physicalWidthMM,h=a.physicalHeightMM;
    if(!Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<=0)throw Error('「'+a.title+'」尚未校准真实尺寸');
    if(w>194||h>265)throw Error('「'+a.title+'」按真实尺寸放不进 A4 可打印区域，请改用更大的纸张');
    if(x>8&&x+w>202){x=8;y+=rowHeight+6;rowHeight=0;}
    if(y+5+h>288){page++;x=8;y=18;rowHeight=0;}
    placements.push({asset:a,page,x,y:y+5,width:w,height:h});x+=w+5;rowHeight=Math.max(rowHeight,5+h);
  }
  return placements;
}
