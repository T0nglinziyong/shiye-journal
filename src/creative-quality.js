// Measurable warnings, not an invented aesthetic score.
import {textLines,textFont} from './editor-tools-model.js';
import {minimumPrintPoints} from './creative-typography.js';
export function reviewCreativeDraft(d,{allowNoText=false,purposes=[],measureText}={}){
 const warnings=[],texts=(d.textBlocks||[]).filter(x=>!x.isHidden),materials=(d.items||[]).filter(x=>!x.isParked),visible=[...texts,...materials,...(d.primitives||[]).filter(x=>!x.hidden)],rgb=c=>/^#[0-9a-f]{6}$/i.test(c||'')?[1,3,5].map(i=>parseInt(c.slice(i,i+2),16)/255):null,lum=c=>{const a=rgb(c);return a?a.map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0):null;};
 if(!allowNoText&&!texts.some(x=>x.content?.trim()))warnings.push('缺少文字内容');
 if(purposes.includes('日常记录')&&!allowNoText&&texts.filter(x=>x.content?.length>=18).length<2)warnings.push('日常记录建议两段关联正文，而非仅封面标题');
 for(const x of visible)if(x.x-x.width/2<0||x.y-x.height/2<0||x.x+x.width/2>d.canvas.width||x.y+x.height/2>d.canvas.height)warnings.push('元素超出画布：'+(x.agentKey||x.creativePieceID||x.key||x.id));
 const canvas=globalThis.document?.createElement?.('canvas'),ctx=canvas?.getContext?.('2d');
 // AI completion policy in physical print points, independent of viewport zoom.
 // This never resizes a user's material or prevents manual small annotations.
 if(Number.isFinite(d.physicalPageHeightMM)&&d.physicalPageHeightMM>0)for(const t of texts){const points=t.fontSize*d.physicalPageHeightMM/d.canvas.height*72/25.4;if(points<minimumPrintPoints)warnings.push('印刷字号过小：'+(t.agentKey||t.id)+'（'+points.toFixed(1)+'pt，至少'+minimumPrintPoints+'pt；请增大字号并重新排版）');}
 for(const t of texts){const ink=lum(t.color),paper=lum(d.paperColor);if(ink!=null&&paper!=null&&(Math.max(ink,paper)+.05)/(Math.min(ink,paper)+.05)<4.5)warnings.push('文字与纸底对比偏低：'+(t.agentKey||t.id));if(ctx)ctx.font=textFont(t);const measure=measureText?text=>measureText(text,t):ctx?text=>ctx.measureText(text).width:text=>[...text].reduce((n,ch)=>n+t.fontSize*(/[\u0000-\u00ff]/u.test(ch)?.65:1)+(t.letterSpacing||0),0);if(textLines(t,measure).height>t.height+2)warnings.push('完整文字超出文字框：'+(t.agentKey||t.id));}
 for(let i=0;i<texts.length;i++)for(let j=i+1;j<texts.length;j++){const a=texts[i],b=texts[j],w=Math.min(a.x+a.width/2,b.x+b.width/2)-Math.max(a.x-a.width/2,b.x-b.width/2),h=Math.min(a.y+a.height/2,b.y+b.height/2)-Math.max(a.y-a.height/2,b.y-b.height/2);if(w>2&&h>2)warnings.push('文字框相互遮挡：'+(a.agentKey||a.id)+' / '+(b.agentKey||b.id));}
 return {materials:materials.length,textBlocks:texts.length,graphics:(d.primitives||[]).length,warnings:[...new Set(warnings)]};
}
