import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {journalBundledFonts} from './journal-font-catalog.js';
export function offlineBundledFonts(root=process.cwd()){
 return journalBundledFonts.flatMap(font=>{
  const path=[resolve(root,'fonts',font.file),resolve(root,'src/assets/fonts',font.file)].find(existsSync);
  return path?[{...font,path}]:[];
 });
}
