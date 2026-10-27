export const creationBrowserFonts=['Ma Shan Zheng'];
// Only an application-bundled font is fetched. Model-provided paths/URLs never
// reach fetch. Read lazily for glyph cutting; normal text needs no font parse.
export function createBrowserCommandCapabilities({request=fetch}={}){
 let bytesPromise;
 const load=()=>bytesPromise ||= request(new URL('./assets/fonts/MaShanZheng-Regular.ttf',import.meta.url)).then(async response=>{
  if(!response.ok)throw Error('手写字体读取失败，请稍后重试字形镂空');
  return new Uint8Array(await response.arrayBuffer());
 }).catch(error=>{bytesPromise=null;throw error;});
 return async input=>{
  const glyphs=[];
  const scan=ops=>{for(const op of ops){if(op.op==='material.glyphKnockout'&&op.text)glyphs.push(op);if(op.op==='group.compose')scan(op.children);}};
  scan(input.operations);
  if(!glyphs.length)return {};
  if(glyphs.some(op=>!creationBrowserFonts.includes(op.style.fontFamily)))throw Object.assign(Error('网页字形镂空支持 Ma Shan Zheng；其他字体请提供已解析的 region 轮廓'),{code:'FONT_UNAVAILABLE'});
  const [{glyphCutGeometry},bytes]=await Promise.all([import('./craft-glyphs.js'),load()]);
  return {glyphOutline:(text,style)=>{
   if(!creationBrowserFonts.includes(style.fontFamily))throw Error('未授权字体');
   return glyphCutGeometry(bytes,text,{fontSizeMM:style.fontSizePt*25.4/72}).geometryMM;
  }};
 };
}
