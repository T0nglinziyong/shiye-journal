import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {journalBundledFonts} from './journal-font-catalog.js';
export const offlineResourceRoot=typeof __dirname==='string'?resolve(__dirname,'..'):fileURLToPath(new URL('../',import.meta.url));
export function offlineBundledFonts(root=offlineResourceRoot){
 return journalBundledFonts.map(font=>{
  const path=[resolve(root,'fonts',font.file),resolve(root,'src/assets/fonts',font.file)].find(existsSync);
  if(!path)throw Error('预装字体缺失：'+font.family);
  return {...font,path};
 });
}
