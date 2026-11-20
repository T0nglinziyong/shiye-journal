import {journalBundledFonts} from './journal-font-catalog.js';
export const creationBrowserFonts=journalBundledFonts.map(f=>f.family);
const fontURLs=Object.fromEntries(journalBundledFonts.map(font=>[font.family,new URL(`./assets/fonts/${font.file}`,import.meta.url)]));
export function createBrowserCommandCapabilities({request=fetch}={}){
 const loaded=new Map();
 const load=family=>{
  if(!loaded.has(family))loaded.set(family,request(fontURLs[family]).then(async response=>{
   if(!response.ok)throw Error('手写字体读取失败，请稍后重试字形镂空');
   return new Uint8Array(await response.arrayBuffer());
  }).catch(error=>{loaded.delete(family);throw error;}));
  return loaded.get(family);
 };
 return async input=>{
  const glyphs=[];
  const scan=ops=>{for(const op of ops){if(op.op==='material.glyphKnockout'&&op.text)glyphs.push(op);if(op.op==='group.compose')scan(op.children);}};
  scan(input.operations);
  if(!glyphs.length)return {};
  if(glyphs.some(op=>!creationBrowserFonts.includes(op.style.fontFamily)))throw Object.assign(Error('网页字形镂空仅支持已收录的字体；其他字体请提供 region 轮廓'),{code:'FONT_UNAVAILABLE'});
  const families=[...new Set(glyphs.map(op=>op.style.fontFamily))];
  const [{glyphCutGeometry},entries]=await Promise.all([import('./craft-glyphs.js'),Promise.all(families.map(async family=>[family,await load(family)]))]);
  const bytes=new Map(entries);
  return {glyphOutline:(text,style)=>{
   if(!bytes.has(style.fontFamily))throw Error('未授权字体');
   return glyphCutGeometry(bytes.get(style.fontFamily),text,{fontSizeMM:style.fontSizePt*25.4/72}).geometryMM;
  }};
 };
}
