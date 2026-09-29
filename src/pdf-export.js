const encoder = new TextEncoder();
const bytes = text => encoder.encode(text);
const join = arrays => { const out=new Uint8Array(arrays.reduce((n,a)=>n+a.length,0)); let offset=0; for(const a of arrays){out.set(a,offset);offset+=a.length;} return out; };
// JPEG pages embedded in a PDF with an explicit millimetre MediaBox. The
// document contains no browser chrome and never relies on print-dialog scaling.
export function pagePDF(pages) {
  const objects = [], add = data => {objects.push(typeof data==='string'?bytes(data):data);return objects.length;};
  add('<< /Type /Catalog /Pages 2 0 R >>'); add('');
  const kids=[];
  for(const {jpeg,width,height,pixelWidth,pixelHeight} of pages) {
    const w=width*72/25.4,h=height*72/25.4;
    const image=add(join([bytes('<< /Type /XObject /Subtype /Image /Width '+pixelWidth+' /Height '+pixelHeight+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+jpeg.length+' >>\nstream\n'),jpeg,bytes('\nendstream')]));
    const commands='q '+w.toFixed(4)+' 0 0 '+h.toFixed(4)+' 0 0 cm /Im0 Do Q';
    const content=add('<< /Length '+bytes(commands).length+' >>\nstream\n'+commands+'\nendstream');
    const page=add('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+w.toFixed(4)+' '+h.toFixed(4)+'] /Resources << /XObject << /Im0 '+image+' 0 R >> >> /Contents '+content+' 0 R >>'); kids.push(page);
  }
  objects[1]=bytes('<< /Type /Pages /Count '+kids.length+' /Kids ['+kids.map(n=>n+' 0 R').join(' ')+'] >>');
  const chunks=[bytes('%PDF-1.4\n')], offsets=[0]; let length=chunks[0].length;
  objects.forEach((o,i)=>{offsets.push(length);const chunk=join([bytes((i+1)+' 0 obj\n'),o,bytes('\nendobj\n')]);chunks.push(chunk);length+=chunk.length;});
  const xref=length;
  chunks.push(bytes('xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size '+(objects.length+1)+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n'));
  return new Blob(chunks,{type:'application/pdf'});
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
